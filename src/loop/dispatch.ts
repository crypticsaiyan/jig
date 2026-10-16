// ToolCall[] => run() => ToolMessage[]

import type { ToolCall, ToolMessage } from "../provider";
import type { Registry, ToolContext } from "../tool/types";
import type { LoopEvents } from "./types";

export async function dispatchTool(
  toolCalls: ToolCall[],
  ctx: ToolContext,
  registry: Registry,
  events?: LoopEvents,
): Promise<ToolMessage[]> {
  const toolResponse: Array<ToolMessage> = [];
  for (const toolCall of toolCalls) {
    if (ctx.signal.aborted) {
      toolResponse.push({
        type: "tool",
        toolCallId: toolCall.toolCallId,
        content: "Error: cancelled by user",
      });
      continue;
    }
    if (events?.onToolStart) events.onToolStart(toolCall);
    const content = await registry.run(toolCall.name, toolCall.arguments, ctx);
    toolResponse.push({
      type: "tool",
      toolCallId: toolCall.toolCallId,
      content,
    });
    if (events?.onToolResult) events.onToolResult(toolCall, content);
  }
  return toolResponse;
}
