// Need to know when:
// 1) Response from the provider
// 2) Agent message (Tool result/ text)
// 3) Tool calls requested by the provider

export type ToolCall = {
  toolCallId: string;
  name: string;
  arguments: string;
};

export type FinishReason =
  "tool_calls" | "stop" | "length" | "content_filter" | "error";

export type Statistics = {
  promptTokens: number; // input tokens (sent by messages array)
  completionTokens: number; // output tokens: what model generated (assistant text + tool call tokens)
  totalTokens: number;
};

export type ProviderResponse = {
  message: AssistantMessage;
  finishReason: FinishReason;
  stats: Statistics;
};

export type UserMessage = {
  type: "user";
  content: string;
};

export type SystemMessage = {
  type: "system";
  content: string;
};

// previous provider response
export type AssistantMessage = {
  type: "assistant";
  content: string | null;
  toolCalls?: ToolCall[];
};

export type ToolMessage = {
  type: "tool";
  toolCallId: string;
  content: string;
};

export type AgentMessage =
  UserMessage | SystemMessage | AssistantMessage | ToolMessage;

export type ToolSpec = {
  name: string;
  description: string;
  parameters: object;
};

export type CompleteFunc = (
  // generates the next completion
  messages: AgentMessage[],
  tools: ToolSpec[],
  signal: AbortSignal,
  model: string,
) => Promise<ProviderResponse>;

export type StreamCallbacks = {
  onText?: (chunk: string) => void;
  onReasoning?: (chunk: string) => void;
};

export type CompleteStreamFunc = (
  // generates the next completion
  messages: AgentMessage[],
  tools: ToolSpec[],
  signal: AbortSignal,
  model: string,
  callbacks?: StreamCallbacks,
) => Promise<ProviderResponse>;
