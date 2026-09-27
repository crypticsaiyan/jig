import type { AgentMessage } from "../provider";

export type PruneMsgs = (
  messages: AgentMessage[],
  contextWindow: number,
  maxContextRatio: number,
) => AgentMessage[];
