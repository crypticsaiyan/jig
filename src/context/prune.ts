import type { AgentMessage, ToolMessage } from "../provider";
import type { PruneMsgs } from "./types";

// estimate tokens used by existing tool calls = chars/4
function estimateToolTokens(message: ToolMessage): number {
  return message.content.length / 4;
}

export const prune: PruneMsgs = (
  messages: AgentMessage[],
  contextWindow: number,
  maxContextRatio: number,
) => {
  const maxAllowedTokens = contextWindow * maxContextRatio; // max allowed context fill
  const newMessages: AgentMessage[] = [];
  let tokensUsed = 0;

  // push the latest response in all cases
  let fromLast = messages.length - 1;
  while (fromLast && messages[fromLast]?.type !== "assistant") {
    const msg = messages[fromLast];
    fromLast--;
    if (!msg) continue;
    newMessages.push(msg);
    if (msg.type === "tool") tokensUsed += estimateToolTokens(msg);
  }

  // start from the second last message
  for (let i = fromLast; i >= 0; i--) {
    const message = messages[i];

    if (!message) continue;

    if (message.type === "tool") {
      tokensUsed += estimateToolTokens(message);
    }

    if (tokensUsed <= maxAllowedTokens) newMessages.push(message);
    else {
      if (message.type === "tool") {
        const newContent = "[Tool output pruned. Rerun the tool to see output]";
        newMessages.push({
          type: message.type,
          toolCallId: message.toolCallId,
          content:
            message.content.length > newContent.length // skip when the tool call output is small
              ? newContent
              : message.content,
        });
      } else {
        newMessages.push({ ...message });
      }
    }
  }
  return newMessages.reverse();
};
