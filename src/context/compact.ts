import type { CompleteFunc, UserMessage } from "../provider/types";
import type { AgentMessage, SystemMessage } from "../provider";
import type { Compact } from "./types";
import { truncate } from "../util";

export const compact: Compact = async (
  previousSummary: AgentMessage,
  previousSummarizedUpTo: number,
  messages: AgentMessage[],
  signal: AbortSignal,
  compactionModel: string,
  transcriptCapChars: number,
  complete: CompleteFunc,
) => {
  // calculate the index of the last assistant message
  let fromLast = messages.length - 1;
  while (
    fromLast > previousSummarizedUpTo &&
    messages[fromLast]?.type !== "assistant"
  ) {
    fromLast--;
  }

  const COMPACTION_PROMPT = ` You are a context summarization assistant. Your job is to compress a long-running agent or chat conversation history into a dense, high-fidelity working state so the primary model can resume operations seamlessly without hitting token limits.

Analyze the provided transcript and output a structured summary using the following sections:

1. CORE GOAL & INTENT:
- What is the user's primary objective or standing task?
- Note any specific constraints, technical requirements, or user preferences established.

2. PROGRESS & COMPLETED WORK:
- What milestones, code changes, or steps have been successfully completed?
- Mention critical file paths, active components, or tools used.

3. KEY DECISIONS & ARCHITECTURE:
- What critical technical, design, or logical decisions were made during the conversation?
- List any discarded approaches to avoid repeating past mistakes.

4. PENDING TASKS & NEXT STEPS:
- What exact sub-task or action item was immediately in progress or planned next?
- List any unresolved questions or blockers.

Guidelines:
- Be concise, dense, and factual. Discard conversational filler, redundant tool outputs, and superseded trial-and-error steps.
- Retain exact technical identifiers (variable names, file paths, API endpoints) that are vital for future turns.

`;

  // truncated messages from previousSummarizedUpTo + 1 to fromLast (excluded)
  const lines: string[] = [];
  for (let i = previousSummarizedUpTo + 1; i < fromLast; i++) {
    const message = messages[i];
    if (!message) continue;
    if (message.content)
      lines.push(
        `${message.type}: ${truncate(message.content, transcriptCapChars)}`,
      );
    if (message.type == "assistant" && message.toolCalls) {
      for (const call of message.toolCalls) {
        lines.push(
          `assistant called ${call.name}(${truncate(call.arguments, transcriptCapChars)})`,
        );
      }
    }
  }

  const sysMsg: SystemMessage = { type: "system", content: COMPACTION_PROMPT };

  const previous = previousSummary.content
    ? `Previous summary:\n${previousSummary.content}\n\n`
    : "";

  const userMsg: UserMessage = {
    type: "user",
    content: `${previous}Messages to compact:\n${lines.join("\n")}`,
  };
  console.log(userMsg);

  if (fromLast - 1 > previousSummarizedUpTo) {
    console.log("[CALLING COMPACT]");

    const compacted = await complete(
      [sysMsg, userMsg],
      [],
      signal,
      compactionModel,
    );
    const text = compacted.message.content;

    if (!text || compacted.finishReason === "length")
      throw new Error("Error compacting: empty or truncated summary");

    console.log(compacted.message);

    return [
      { type: "user", content: `[SUMMARIZED]\n${text}` },
      fromLast - 1,
      compacted.stats.totalTokens,
    ];
  }
  return null;
};
