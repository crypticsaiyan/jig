import { compact } from "../context/compact";
import { prune } from "../context/prune";
import type { AgentMessage } from "../provider";
import { dispatchTool } from "./dispatch";
import type { Statistics } from "../provider/types";
import type {
  LoopInput,
  LoopOutput,
  RunContext,
  StopReason,
  TokenBudget,
} from "./types";

function spend(budget: TokenBudget, stats: Statistics): void {
  budget.used += stats.totalTokens;
  budget.costUsd += stats.costUsd;
  budget.promptTokens += stats.promptTokens;
  budget.cachedTokens += stats.cachedTokens;
  budget.cacheWriteTokens += stats.cacheWriteTokens;
}

function buildMsgView(
  summary: AgentMessage,
  summarizedUpTo: number,
  messages: AgentMessage[],
): AgentMessage[] {
  return [summary, ...messages.slice(summarizedUpTo + 1)];
}

function estimateTokens(messages: AgentMessage[]): number {
  let chars = 0;
  for (const message of messages) chars += message.content?.length ?? 0;
  return chars / 4;
}

// tells the model its last turn was cut off, so the next message isn't misread
const INTERRUPT_NOTE: AgentMessage = {
  type: "user",
  content: "[Request interrupted by user]",
};

export async function runLoop(input: LoopInput): Promise<LoopOutput> {
  const ctx: RunContext = input.ctx;
  const cfg = input.config;
  const state = input.state;

  const messages: Array<AgentMessage> = [
    ...(state?.messages ?? []),
    input.userMessage,
  ];
  let lastMessageView: AgentMessage[] = [
    ...(state?.view ?? []),
    input.userMessage,
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
      const pruned = prune(
        lastMessageView,
        cfg.contextWindow,
        cfg.maxPruneAllowanceRatio,
      );
      // a prune changes old messages, so the cached prompt is rebuilt from there:
      // only worth it when it frees a lot; small prunes are skipped
      const gain = estimateTokens(lastMessageView) - estimateTokens(pruned);
      if (gain >= lastPromptTokens * cfg.pruneMinGainRatio)
        lastMessageView = pruned;
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
          const [summary, summarizedUpTo, compactionStats] = summaryResult;
          lastMessageView = buildMsgView(summary, summarizedUpTo, messages);

          previousSummary = summary;
          previousSummarizedUpTo = summarizedUpTo;

          tokensUsed += compactionStats.totalTokens;
          spend(ctx.budget, compactionStats);
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
        input.tools.specs,
        ctx.signal,
        input.config.loopModel,
        ctx.events,
      );
    } catch (error) {
      if (ctx.signal.aborted) return finish("interrupted");
      throw error;
    }

    tokensUsed += completion.stats.totalTokens;
    spend(ctx.budget, completion.stats);
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
          input.tools,
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
    // shared budget, so a sub-agent's spending counts toward this cap too
    if (ctx.budget.used > ctx.budget.max) {
      return finish("max_tokens");
    }
    iterations++;
  }
}
