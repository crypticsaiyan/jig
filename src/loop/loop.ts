import { compact } from "../context/compact";
import { prune } from "../context/prune";
import type { AgentMessage, SystemMessage } from "../provider";
import { generateToolsArray } from "../tool";
import { dispatchTool } from "./dispatch";
import type { ToolContext } from "../tool/types";
import type { LoopInput, LoopOutput } from "./types";

function buildMsgView(
  systemPrompt: SystemMessage,
  summary: AgentMessage,
  summarizedUpTo: number,
  messages: AgentMessage[],
): AgentMessage[] {
  if (systemPrompt.content.length)
    return [systemPrompt, summary, ...messages.slice(summarizedUpTo + 1)];
  return [summary, ...messages.slice(summarizedUpTo + 1)];
}

export async function runLoop(input: LoopInput): Promise<LoopOutput> {
  let iterations = 0;
  let tokensUsed = 0;
  const messages: Array<AgentMessage> = [...input.messages];
  const ctx: ToolContext = input.ctx;
  const cfg = input.config;
  let lastMessageView: AgentMessage[] = [cfg.systemPrompt, ...input.messages];
  let lastPromptTokens = 0;
  let previousSummary: AgentMessage = { type: "assistant", content: "" };
  let previousSummarizedUpTo = -1; // inclusive (index of last summarized msg)

  while (true) {
    if (ctx.signal.aborted) {
      return {
        messages,
        stopReason: "interrupted",
        iterations,
        lastPromptTokens,
        lastMessageView,
      };
    }
    console.log("Running loop ", iterations);
    if (iterations >= input.config.maxIterations) {
      return {
        messages,
        stopReason: "max_iterations",
        iterations,
        lastPromptTokens,
        lastMessageView,
      };
    }

    // prune if >= 50% ctxwindow
    if (lastPromptTokens >= cfg.contextWindow * cfg.pruneRatio) {
      lastMessageView = prune(
        lastMessageView,
        cfg.contextWindow,
        cfg.maxPruneAllowanceRatio,
      );
    }

    // compact if >= 90% ctxwindow
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
          lastMessageView = buildMsgView(
            cfg.systemPrompt,
            summary,
            summarizedUpTo,
            messages,
          );

          previousSummary = summary;
          previousSummarizedUpTo = summarizedUpTo;

          tokensUsed += compactionTokensUsed;
        }
      } catch (error) {
        if (ctx.signal.aborted)
          return {
            messages,
            stopReason: "interrupted",
            iterations,
            lastPromptTokens,
            lastMessageView,
          };
        throw error;
      }
    }

    let completion;
    try {
      completion = await input.complete(
        lastMessageView,
        generateToolsArray(),
        ctx.signal,
        input.config.loopModel,
      );
    } catch (error) {
      if (ctx.signal.aborted)
        return {
          messages,
          stopReason: "interrupted",
          iterations,
          lastPromptTokens,
          lastMessageView,
        };
      throw error;
    }

    tokensUsed += completion.stats.totalTokens;
    lastPromptTokens = completion.stats.promptTokens;

    // console.log(messages);
    console.dir(lastMessageView, { depth: null });
    console.log(
      "Context %: ",
      (lastPromptTokens / input.config.contextWindow) * 100,
    );
    messages.push(completion.message);
    lastMessageView.push(completion.message);

    const finishReason = completion.finishReason;

    if (finishReason === "tool_calls") {
      if (completion.message.toolCalls) {
        const toolCallResults = await dispatchTool(
          completion.message.toolCalls,
          ctx,
        );
        for (const result of toolCallResults) {
          messages.push(result);
          lastMessageView.push(result);
        }
      } else {
        return {
          messages,
          stopReason: "error",
          iterations,
          lastPromptTokens,
          lastMessageView,
        };
        // TODO: add a callback func to handle interrupts
      }
    } else if (
      finishReason === "error" ||
      finishReason === "stop" ||
      finishReason === "length" ||
      finishReason === "content_filter"
    ) {
      return {
        messages,
        stopReason: finishReason,
        iterations,
        lastPromptTokens,
        lastMessageView,
      };
    }
    if (tokensUsed > input.config.maxTokens) {
      return {
        messages,
        stopReason: "max_tokens",
        iterations,
        lastPromptTokens,
        lastMessageView,
      };
    }
    iterations++;
  }
}
