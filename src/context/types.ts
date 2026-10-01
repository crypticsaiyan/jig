import type { CompleteFunc } from "../provider/types";
import type { AgentMessage } from "../provider";

export type PruneMsgs = (
  messages: AgentMessage[],
  contextWindow: number,
  maxContextRatio: number,
) => AgentMessage[];

export type Compact = (
  previousSummary: AgentMessage,
  previousSummarizedUpTo: number,
  messages: AgentMessage[],
  signal: AbortSignal,
  compactionModel: string,
  transcriptCapChars: number,
  complete: CompleteFunc,
) => Promise<
  [summary: AgentMessage, summaryUpTo: number, tokensUsed: number] | null
>;

export type Skill = {
  name: string;
  description: string;
};
