import type { AgentMessage } from "../provider";
import { isToolError, summarizeArgs } from "./summarize";
import type { Item } from "./types";

// rebuild display items from saved history, so a resumed session shows the old conversation
export function messagesToItems(
  messages: AgentMessage[],
  newId: () => number,
): Item[] {
  // tool results by call id, so each tool line can show ok or error
  const results = new Map<string, string>();
  for (const m of messages) {
    if (m.type === "tool") results.set(m.toolCallId, m.content);
  }

  const items: Item[] = [];
  for (const m of messages) {
    if (m.type === "user") {
      items.push({ id: newId(), kind: "user", text: m.content });
    } else if (m.type === "assistant") {
      const text = m.content?.trim();
      if (text) items.push({ id: newId(), kind: "assistant", text });
      for (const call of m.toolCalls ?? []) {
        const result = results.get(call.toolCallId);
        items.push({
          id: newId(),
          kind: "tool",
          name: call.name,
          summary: summarizeArgs(call.arguments),
          ok: result !== undefined && !isToolError(result),
        });
      }
    }
  }
  return items;
}
