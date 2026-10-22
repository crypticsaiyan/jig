// shared fakes: no network, no filesystem

import type {
  ChatFinishReasonEnum,
  ChatStreamChunk,
} from "@openrouter/sdk/models";
import { z } from "zod";
import type { LoopConfig, RunContext } from "../src/loop/types";
import type {
  CompleteStreamFunc,
  ProviderResponse,
  ToolCall,
} from "../src/provider/types";
import type { Tool } from "../src/tool/types";

// --- stream chunks, for normalizeStream ---

function chunk(fields: Partial<ChatStreamChunk>): ChatStreamChunk {
  return {
    id: "chunk",
    created: 0,
    model: "test-model",
    object: "chat.completion.chunk",
    choices: [],
    ...fields,
  };
}

export function textChunk(content: string): ChatStreamChunk {
  return chunk({
    choices: [{ index: 0, delta: { content }, finishReason: null }],
  });
}

export function toolChunk(
  index: number,
  piece: { id?: string; name?: string; args?: string },
): ChatStreamChunk {
  return chunk({
    choices: [
      {
        index: 0,
        delta: {
          toolCalls: [
            {
              index,
              ...(piece.id !== undefined && { id: piece.id }),
              function: {
                ...(piece.name !== undefined && { name: piece.name }),
                ...(piece.args !== undefined && { arguments: piece.args }),
              },
            },
          ],
        },
        finishReason: null,
      },
    ],
  });
}

// string, so tests can send reasons the SDK enum doesn't list
export function finishChunk(reason: string): ChatStreamChunk {
  const finishReason = reason as ChatFinishReasonEnum;
  return chunk({
    choices: [{ index: 0, delta: {}, finishReason }],
  });
}

export function usageChunk(
  promptTokens: number,
  completionTokens: number,
): ChatStreamChunk {
  return chunk({
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    },
  });
}

export async function* stream(
  chunks: ChatStreamChunk[],
): AsyncIterable<ChatStreamChunk> {
  for (const c of chunks) yield c;
}

// --- provider responses, for the loop ---

const STATS = {
  promptTokens: 10,
  completionTokens: 5,
  totalTokens: 15,
  costUsd: 0.001,
  cachedTokens: 4,
  cacheWriteTokens: 0,
};

export function reply(text: string, totalTokens = 15): ProviderResponse {
  return {
    message: { type: "assistant", content: text },
    finishReason: "stop",
    stats: { ...STATS, totalTokens },
  };
}

export function callTool(
  name: string,
  args: object,
  totalTokens = 15,
): ProviderResponse {
  const call: ToolCall = {
    toolCallId: `call_${name}`,
    name,
    arguments: JSON.stringify(args),
  };
  return {
    message: { type: "assistant", content: null, toolCalls: [call] },
    finishReason: "tool_calls",
    stats: { ...STATS, totalTokens },
  };
}

// returns the next response on each call; throws if the loop asks for more
export function scripted(responses: ProviderResponse[]): CompleteStreamFunc & {
  calls: number;
} {
  let i = 0;
  const fake = async (
    ..._args: Parameters<CompleteStreamFunc>
  ): Promise<ProviderResponse> => {
    const callbacks = _args[4];
    const next = responses[i++];
    fake.calls = i;
    if (!next) throw new Error("script exhausted");
    if (next.message.content) callbacks?.onText?.(next.message.content);
    return next;
  };
  fake.calls = 0;
  return fake;
}

// --- loop setup ---

export const testConfig: LoopConfig = {
  maxIterations: 5,
  maxTokens: 1000,
  contextWindow: 1_000_000, // huge, so prune and compaction never fire
  pruneRatio: 0.5,
  maxPruneAllowanceRatio: 0.1,
  compactionRatio: 0.9,
  compactionModel: "test-model",
  loopModel: "test-model",
  transcriptCapChars: 2000,
};

export const systemPrompt = { type: "system", content: "test" } as const;

export function makeCtx(overrides: Partial<RunContext> = {}): RunContext {
  return {
    asker: async () => "allow-once",
    signal: new AbortController().signal,
    maxOutputChars: 2000,
    permissions: {
      allowList: [],
      projectRoot: process.cwd(),
      sandbox: false,
      network: false,
    },
    budget: {
      used: 0,
      max: testConfig.maxTokens,
      costUsd: 0,
      promptTokens: 0,
      cachedTokens: 0,
      cacheWriteTokens: 0,
    },
    depth: 0,
    ...overrides,
  };
}

// --- fake tools ---

export const echoTool: Tool<{ text: z.ZodString }, { echo: string }> = {
  name: "echo",
  description: "returns its input",
  parameters: z.object({ text: z.string() }),
  getPermissionKey: () => undefined,
  execute: async ({ text }) => ({ echo: text }),
};

// asks permission like bash does
export const guardedTool: Tool<{ command: z.ZodString }, string> = {
  name: "guarded",
  description: "needs permission",
  parameters: z.object({ command: z.string() }),
  getPermissionKey: ({ command }) => ({ kind: "bash", value: command }),
  execute: async () => "ran",
};
