import type { AgentMessage } from "../provider";
import type {
  CompleteStreamFunc,
  SystemMessage,
  ToolCall,
} from "../provider/types";
import type { Asker, PermSession } from "../permission/types";
import type { Registry } from "../tool/types";

// dependency injecting interfaces for loop

// loop config
export interface LoopConfig {
  maxIterations: number;
  maxTokens: number;
  contextWindow: number; // depends on the model (TODO: model mapping)
  pruneRatio: number; // limit after which prune fires
  maxPruneAllowanceRatio: number; // max ctx allowed (latest max not pruned)
  pruneMinGainRatio: number; // apply a prune only if it frees this share of the prompt
  compactionRatio: number; // limit after which compaction fires
  compactionModel: string;
  loopModel: string;
  transcriptCapChars: number;
}

// tokens and dollars spent this turn; one object shared by the parent and its sub-agents
export type TokenBudget = {
  used: number; // total tokens, checked against max
  max: number;
  costUsd: number; // as billed, cache discounts included
  promptTokens: number;
  cachedTokens: number; // prompt tokens read from the provider's cache
  cacheWriteTokens: number;
};

// per-turn runtime state, shared by the loop, its tools and sub-agent loops
export type RunContext = {
  permissions: PermSession;
  asker: Asker;
  signal: AbortSignal;
  maxOutputChars: number;
  budget: TokenBudget;
  depth: number;
  events?: LoopEvents;
};

// loop input format
export interface LoopInput {
  userMessage: AgentMessage; // new user query
  systemPrompt: SystemMessage; // built at runtime, kept out of config and state
  complete: CompleteStreamFunc;
  config: LoopConfig;
  ctx: RunContext;
  state?: LoopState | undefined;
  tools: Registry;
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
  tokensUsed: number;
  lastMessageView: AgentMessage[];
  state: LoopState;
}

export interface LoopEvents {
  onText?: (chunk: string) => void;
  onReasoning?: (chunk: string) => void;
  onToolStart?: (call: ToolCall, depth: number) => void;
  onToolResult?: (call: ToolCall, result: string, depth: number) => void;
}

export interface LoopState {
  messages: AgentMessage[]; // raw history, no system prompt
  view: AgentMessage[];
  summary: AgentMessage;
  summarizedUpTo: number;
  lastPromptTokens: number;
}
