import { PROVIDER } from "../config";
import { client } from "./client";
import { StreamStalledError, withIdleTimeout } from "./stall";
import { normalize, normalizeStream, toSdkMsg, toSdkTool } from "./normalize";
import type {
  AgentMessage,
  CompleteStreamFunc,
  ProviderResponse,
  StreamCallbacks,
  ToolSpec,
} from "./types";

export const completeStream: CompleteStreamFunc = async (
  messages: AgentMessage[],
  tools: ToolSpec[] = [],
  signal: AbortSignal,
  model: string,
  callbacks?: StreamCallbacks,
): Promise<ProviderResponse> => {
  // own controller: aborts on ctrl-c (the caller's signal) or when the stream stalls
  const controller = new AbortController();
  const onUserAbort = () => controller.abort(signal.reason);
  if (signal.aborted) onUserAbort();
  signal.addEventListener("abort", onUserAbort, { once: true });

  const ms = PROVIDER.streamIdleTimeoutMs;
  let stalled = false;
  const stall = () => {
    stalled = true;
    controller.abort();
  };
  const firstByte = setTimeout(stall, ms); // the request itself can hang too

  try {
    const stream = await client.chat.send(
      {
        chatRequest: {
          model,
          messages: messages.map(toSdkMsg),
          tools: tools.map(toSdkTool),
          stream: true,
          streamOptions: { includeUsage: true },
          // one moving cache point at the end of the request (automatic caching)
          ...(PROVIDER.promptCache && {
            cacheControl: { type: "ephemeral" as const },
          }),
        },
      },
      { fetchOptions: { signal: controller.signal } },
    );
    clearTimeout(firstByte);

    if (!(stream instanceof ReadableStream)) {
      throw new Error("Expected a non-streaming response");
    }

    return await normalizeStream(withIdleTimeout(stream, ms, stall), callbacks);
  } catch (error) {
    if (stalled) throw new StreamStalledError(ms);
    throw error;
  } finally {
    clearTimeout(firstByte);
    signal.removeEventListener("abort", onUserAbort);
  }
};
