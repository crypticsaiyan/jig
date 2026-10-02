import type { CompleteStreamFunc, UserMessage } from "../provider/types";
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
  complete: CompleteStreamFunc,
) => {
  // calculate the index of the last assistant message
  let fromLast = messages.length - 1;
  while (
    fromLast > previousSummarizedUpTo &&
    messages[fromLast]?.type !== "assistant"
  ) {
    fromLast--;
  }

  const COMPACTION_PROMPT = `You are an anchored context summarization assistant for coding sessions.
Summarize only the conversation history you are given. The newest turns are kept verbatim outside your summary, so focus on older context that still matters for continuing the work.

If a "Previous summary" is provided, update it: keep facts that still hold, revise what changed, drop what is finished or superseded, and add the new messages. Output one merged summary, not a summary of the summary.

Output plain text using exactly these sections:

## Goal
- The user's standing task and any constraints or preferences they stated.

## Progress
- What is done. Include file paths created or changed and what changed in each.
- Commands run that matter (tests, typecheck) and their real results.

## Decisions
- Choices made and why. Approaches tried and rejected, so they are not repeated.

## Current state
- Files, functions and identifiers needed to continue, with exact names and paths.
- Errors or blockers still unresolved.

## Next steps
- The exact action in progress or planned next, and open questions for the user.

Rules:
- Be dense and factual. No filler, no greetings, no narration.
- Keep exact identifiers, paths, flags and error messages. Never paraphrase them.
- Drop tool output that is no longer needed, failed attempts that were fixed, and repeated reads of the same file.
- Never invent facts. If something is unknown, leave it out.
- Do not call tools or ask questions. Output only the summary.`;

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

    const callbacks = {
      onText: (chunk: string) => {
        console.log(chunk);
      },
      onReasoning: (chunk: string) => {
        console.log(chunk);
      },
    };

    const compacted = await complete(
      [sysMsg, userMsg],
      [],
      signal,
      compactionModel,
      callbacks,
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
