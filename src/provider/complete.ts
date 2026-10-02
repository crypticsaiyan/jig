import { client } from "./client";
import { normalize, normalizeStream, toSdkMsg, toSdkTool } from "./normalize";
import type {
  AgentMessage,
  CompleteFunc,
  CompleteStreamFunc,
  ProviderResponse,
  StreamCallbacks,
  ToolSpec,
} from "./types";

export const complete: CompleteFunc = async (
  messages: AgentMessage[],
  tools: ToolSpec[] = [],
  signal: AbortSignal,
  model: string,
): Promise<ProviderResponse> => {
  const completion = await client.chat.send(
    {
      chatRequest: {
        model,
        messages: messages.map(toSdkMsg),
        tools: tools.map(toSdkTool),
        stream: false,
      },
    },
    { fetchOptions: { signal } },
  );

  if (completion instanceof ReadableStream) {
    throw new Error("Expected a non-streaming response");
  }

  return normalize(completion);
};

export const completeStream: CompleteStreamFunc = async (
  messages: AgentMessage[],
  tools: ToolSpec[] = [],
  signal: AbortSignal,
  model: string,
  callbacks: StreamCallbacks,
): Promise<ProviderResponse> => {
  const stream = await client.chat.send(
    {
      chatRequest: {
        model,
        messages: messages.map(toSdkMsg),
        tools: tools.map(toSdkTool),
        stream: true,
        streamOptions: { includeUsage: true },
      },
    },
    { fetchOptions: { signal } },
  );

  if (!(stream instanceof ReadableStream)) {
    throw new Error("Expected a non-streaming response");
  }

  const response = await normalizeStream(stream, callbacks);
  return response;
};
