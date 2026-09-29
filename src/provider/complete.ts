import { client } from "./client";
import { normalize, toSdkMsg, toSdkTool } from "./normalize";
import type {
  AgentMessage,
  CompleteFunc,
  ProviderResponse,
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
