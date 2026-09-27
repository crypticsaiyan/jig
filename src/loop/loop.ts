import { prune } from "../context/prune";
import type { AgentMessage } from "../provider";
import { generateToolsArray } from "../tool";
import type { ToolContext } from "../tool/types";
import { dispatchTool } from "./dispatch";
import type { LoopInput, LoopOutput } from "./types";

export async function runLoop(input: LoopInput): Promise<LoopOutput> {
  let iterations = 0;
  let tokensUsed = 0;
  const messages: Array<AgentMessage> = [...input.messages];
  let contextView: AgentMessage[] = messages;
  const ctx: ToolContext = input.ctx;
  let lastPromptTokens = 0;

  while (true) {
    if (ctx.signal.aborted) {
      return {
        messages,
        stopReason: "interrupted",
        iterations,
        lastPromptTokens,
      };
    }
    console.log("Running loop ", iterations);
    if (iterations >= input.config.maxIterations) {
      return {
        messages,
        stopReason: "max_iterations",
        iterations,
        lastPromptTokens,
      };
    }

    if (lastPromptTokens >= input.config.contextWindow * 0.5) {
      contextView = prune(messages, input.config.contextWindow, 0.1);
    }

    let completion;
    try {
      completion = await input.complete(
        contextView,
        generateToolsArray(),
        ctx.signal,
      );
    } catch (error) {
      if (ctx.signal.aborted)
        return {
          messages,
          stopReason: "interrupted",
          iterations,
          lastPromptTokens,
        };
      throw error;
    }

    tokensUsed += completion.stats.totalTokens;
    lastPromptTokens = completion.stats.promptTokens;

    // console.log(messages);
    console.dir(contextView, { depth: null });
    console.log(
      "Context %: ",
      (lastPromptTokens / input.config.contextWindow) * 100,
    );
    messages.push(completion.message);

    const finishReason = completion.finishReason;

    if (finishReason === "tool_calls") {
      if (completion.message.toolCalls) {
        const toolCallResults = await dispatchTool(
          completion.message.toolCalls,
          ctx,
        );
        for (const result of toolCallResults) {
          messages.push(result);
        }
      } else {
        return {
          messages,
          stopReason: "error",
          iterations,
          lastPromptTokens,
        };
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
      };
    }
    if (tokensUsed > input.config.maxTokens) {
      return {
        messages,
        stopReason: "max_tokens",
        iterations,
        lastPromptTokens,
      };
    }
    iterations++;
  }
}
