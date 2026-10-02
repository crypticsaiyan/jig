// conversion between sdk types and custom types

import {
  type ChatChoice,
  type ChatFunctionTool,
  type ChatMessages,
  type ChatResult,
  type ChatStreamChunk,
  type ChatToolCall,
  type ChatUsage,
} from "@openrouter/sdk/models";

import type {
  AgentMessage,
  AssistantMessage,
  FinishReason,
  ProviderResponse,
  Statistics,
  StreamCallbacks,
  ToolCall,
  ToolSpec,
} from "./types";

// as ChatFinishReasonEnum is an OpenEnum, it can consider unwanted values
function normalizeFinishReason(raw: string | null): FinishReason {
  switch (raw) {
    case "tool_calls":
      return "tool_calls";
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "content_filter":
      return "content_filter";
    case "error":
      return "error";
    default:
      throw new Error("Non-standard finish reason");
  }
}

function normalizeStats(usage: ChatUsage | undefined): Statistics {
  if (usage) {
    return {
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
    };
  }
  throw new Error("Error fetching stats");
}

function normalizeToolCalls(raw: ChatToolCall[] | undefined): ToolCall[] {
  let result: ToolCall[] = [];
  if (raw) {
    for (const tool of raw) {
      result.push({
        toolCallId: tool.id,
        name: tool.function.name,
        arguments: tool.function.arguments,
      });
    }
  }
  return result;
}

function normalizeAssistantMessage(choice: ChatChoice): AssistantMessage {
  const msg = choice.message.content;
  if (choice) {
    return {
      type: "assistant",
      content: typeof msg === "string" ? msg : null,
      toolCalls: normalizeToolCalls(choice.message.toolCalls),
    };
  }
  throw new Error("Invalid message content format");
}

export function normalize(completion: ChatResult): ProviderResponse {
  const choice = completion.choices[0];
  if (!choice) {
    throw new Error("Did not receive correct response");
  }

  return {
    message: normalizeAssistantMessage(choice),
    finishReason: normalizeFinishReason(choice.finishReason),
    stats: normalizeStats(completion.usage),
  };
}

export function toSdkMsg(msg: AgentMessage): ChatMessages {
  switch (msg.type) {
    case "user":
    case "system":
      return {
        role: msg.type,
        content: msg.content,
      };
    case "assistant":
      return {
        role: "assistant",
        content: msg.content,
        toolCalls: msg.toolCalls?.map((tc) => ({
          id: tc.toolCallId,
          type: "function",
          function: {
            name: tc.name,
            arguments: tc.arguments,
          },
        })),
      };
    case "tool":
      return {
        role: "tool",
        toolCallId: msg.toolCallId,
        content: msg.content,
      };
  }
}

export function toSdkTool(tool: ToolSpec): ChatFunctionTool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

export async function normalizeStream(
  stream: AsyncIterable<ChatStreamChunk>,
  callbacks: StreamCallbacks = {},
): Promise<ProviderResponse> {
  let text = "";
  let rawFinish: string | null = null;
  let usage: ChatUsage | undefined;
  const calls: { id: string; name: string; args: string }[] = [];

  for await (const chunk of stream) {
    if (chunk.error) throw new Error(`Stream error: ${chunk.error.message}`);
    if (chunk.usage) usage = chunk.usage;

    const choice = chunk.choices[0];
    if (!choice) continue;
    const delta = choice.delta;

    if (delta.content) {
      text += delta.content;
      callbacks.onText?.(delta.content);
    }

    if (delta.reasoning) callbacks.onReasoning?.(delta.reasoning); // not kept in history

    for (const piece of delta.toolCalls ?? []) {
      const call = (calls[piece.index] ??= { id: "", name: "", args: "" });
      call.id += piece.id ?? "";
      call.name += piece.function?.name ?? "";
      call.args += piece.function?.arguments ?? "";
    }

    if (choice.finishReason) rawFinish = choice.finishReason;
  }

  const toolCalls: ToolCall[] = calls.map((c) => ({
    toolCallId: c.id,
    name: c.name,
    arguments: c.args,
  }));

  return {
    message: { type: "assistant", content: text || null, toolCalls },
    finishReason: normalizeFinishReason(rawFinish),
    stats: normalizeStats(usage),
  };
}
