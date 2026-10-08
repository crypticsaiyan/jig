import { compact } from "../context/compact";
import { prune } from "../context/prune";
import type { AgentMessage } from "../provider";
import { generateToolsArray } from "../tool";
import { dispatchTool } from "./dispatch";
import type { ToolContext } from "../tool/types";
import type { LoopInput, LoopOutput, StopReason } from "./types";

function buildMsgView(
  summary: AgentMessage,
  summarizedUpTo: number,
  messages: AgentMessage[],
): AgentMessage[] {
  return [summary, ...messages.slice(summarizedUpTo + 1)];
}

// tells the model its last turn was cut off, so the next message isn't misread
const INTERRUPT_NOTE: AgentMessage = {
  type: "user",
  content: "[Request interrupted by user]",
};

export async function runLoop(input: LoopInput): Promise<LoopOutput> {
  const ctx: ToolContext = input.ctx;
  const cfg = input.config;
  const state = input.state;

  const messages: Array<AgentMessage> = [
    ...(state?.messages ?? []),
    ...input.messages,
  ];
  let lastMessageView: AgentMessage[] = [
    ...(state?.view ?? []),
    ...input.messages,
  ];
  let previousSummary: AgentMessage = state
    ? state.summary
    : { type: "assistant", content: "" };
  let previousSummarizedUpTo = state ? state.summarizedUpTo : -1; // inclusive (index of last summarized msg)
  let lastPromptTokens = state ? state.lastPromptTokens : 0;
  let iterations = 0;
  let tokensUsed = 0;

  const finish = (stopReason: StopReason): LoopOutput => {
    if (stopReason === "interrupted") {
      messages.push(INTERRUPT_NOTE);
      lastMessageView.push(INTERRUPT_NOTE);
    }
    return {
      messages,
      stopReason,
      iterations,
      lastPromptTokens,
      lastMessageView,
      tokensUsed,
      state: {
        messages,
        view: lastMessageView,
        summary: previousSummary,
        summarizedUpTo: previousSummarizedUpTo,
        lastPromptTokens,
      },
    };
  };

  while (true) {
    if (ctx.signal.aborted) {
      return finish("interrupted");
    }
    if (iterations >= input.config.maxIterations) {
      return finish("max_iterations");
    }

    // prune past pruneRatio of the context window
    if (lastPromptTokens >= cfg.contextWindow * cfg.pruneRatio) {
      lastMessageView = prune(
        lastMessageView,
        cfg.contextWindow,
        cfg.maxPruneAllowanceRatio,
      );
    }

    // compact past compactionRatio of the context window
    if (lastPromptTokens >= cfg.contextWindow * cfg.compactionRatio) {
      try {
        const summaryResult = await compact(
          previousSummary,
          previousSummarizedUpTo,
          messages,
          ctx.signal,
          cfg.compactionModel,
          cfg.transcriptCapChars,
          input.complete,
        );
        if (summaryResult) {
          const [summary, summarizedUpTo, compactionTokensUsed] = summaryResult;
          lastMessageView = buildMsgView(summary, summarizedUpTo, messages);

          previousSummary = summary;
          previousSummarizedUpTo = summarizedUpTo;

          tokensUsed += compactionTokensUsed;
        }
      } catch (error) {
        if (ctx.signal.aborted) return finish("interrupted");
        throw error;
      }
    }

    let completion;
    try {
      completion = await input.complete(
        [input.systemPrompt, ...lastMessageView],
        generateToolsArray(),
        ctx.signal,
        input.config.loopModel,
        input.events,
      );
    } catch (error) {
      if (ctx.signal.aborted) return finish("interrupted");
      throw error;
    }

    tokensUsed += completion.stats.totalTokens;
    lastPromptTokens = completion.stats.promptTokens;

    // console.log(messages);
    //  console.dir(lastMessageView, { depth: null });
    //  console.log(
    //    "Context %: ",
    //    (lastPromptTokens / input.config.contextWindow) * 100,
    //  );
    messages.push(completion.message);
    lastMessageView.push(completion.message);

    const finishReason = completion.finishReason;

    if (finishReason === "tool_calls") {
      if (completion.message.toolCalls) {
        const toolCallResults = await dispatchTool(
          completion.message.toolCalls,
          ctx,
          input.events,
        );
        for (const result of toolCallResults) {
          messages.push(result);
          lastMessageView.push(result);
        }
      } else {
        return finish("error");
        // TODO: add a callback func to handle interrupts
      }
    } else if (
      finishReason === "error" ||
      finishReason === "stop" ||
      finishReason === "length" ||
      finishReason === "content_filter"
    ) {
      return finish(finishReason);
    }
    if (tokensUsed > input.config.maxTokens) {
      return finish("max_tokens");
    }
    iterations++;
  }
}
