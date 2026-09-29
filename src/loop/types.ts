import type { AgentMessage } from "../provider";
import type { CompleteFunc, SystemMessage } from "../provider/types";
import type { ToolContext } from "../tool/types";

// dependency injecting interfaces for loop

// loop config
export interface LoopConfig {
  maxIterations: number;
  maxTokens: number;
  contextWindow: number; // depends on the model (TODO: model mapping)
  pruneRatio: number; // limit after which prune fires
  maxPruneAllowanceRatio: number; // max ctx allowed (latest max not pruned)
  compactionRatio: number; // limit after which compaction fires
  systemPrompt: SystemMessage;
  compactionModel: string;
  loopModel: string;
  transcriptCapChars: number;
}

// loop input format
export interface LoopInput {
  messages: AgentMessage[];
  complete: CompleteFunc;
  config: LoopConfig;
  ctx: ToolContext;
}

export type StopReason =
  | "stop"
  | "max_iterations"
  | "error"
  | "length"
  | "content_filter"
  | "interrupted"
  | "max_tokens";

// loop output format
export interface LoopOutput {
  messages: AgentMessage[];
  stopReason: StopReason;
  iterations: number;
  lastPromptTokens: number;
  lastMessageView: AgentMessage[];
}
