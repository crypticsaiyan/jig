import type { AgentMessage } from "../provider";

// text of the last assistant message that has any
export function lastAssistantText(
  messages: AgentMessage[],
): string | undefined {
  const last = messages.findLast(
    (message) => message.type === "assistant" && Boolean(message.content),
  );
  return last?.content ?? undefined;
}
