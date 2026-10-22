// retries a model call that stalled, lost the connection, or hit a 5xx/429.
// never after ctrl-c, and only while nothing has streamed yet, so text is never shown twice

import {
  ConnectionError,
  OpenRouterError,
  RequestTimeoutError,
  UnexpectedClientError,
} from "@openrouter/sdk/models/errors";
import { StreamStalledError } from "./stall";
import type { CompleteStreamFunc, StreamCallbacks } from "./types";

function isRetryable(error: unknown): boolean {
  if (error instanceof StreamStalledError) return true;
  // UnexpectedClientError: what the SDK throws when DNS or the connection fails
  if (
    error instanceof ConnectionError ||
    error instanceof RequestTimeoutError ||
    error instanceof UnexpectedClientError
  )
    return true;
  if (error instanceof OpenRouterError)
    return error.statusCode >= 500 || error.statusCode === 429;
  return false;
}

export function withRetry(
  complete: CompleteStreamFunc,
  retries: number,
  onRetry?: (attempt: number, error: unknown) => void,
): CompleteStreamFunc {
  return async (messages, tools, signal, model, callbacks) => {
    for (let attempt = 1; ; attempt++) {
      let streamed = false;
      const watched: StreamCallbacks = {
        onText: (chunk) => {
          streamed = true;
          callbacks?.onText?.(chunk);
        },
        onReasoning: (chunk) => {
          streamed = true;
          callbacks?.onReasoning?.(chunk);
        },
      };
      try {
        return await complete(messages, tools, signal, model, watched);
      } catch (error) {
        const giveUp =
          signal.aborted ||
          streamed ||
          attempt > retries ||
          !isRetryable(error);
        if (giveUp) throw error;
        onRetry?.(attempt, error);
        await Bun.sleep(1000 * attempt); // 1s, then 2s
        if (signal.aborted) throw error;
      }
    }
  };
}
