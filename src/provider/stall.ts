// spotting a model stream that went quiet

// the provider sent nothing for too long; safe to retry
export class StreamStalledError extends Error {
  constructor(ms: number) {
    super(`model stream stalled: no data for ${ms / 1000}s`);
    this.name = "StreamStalledError";
  }
}

// passes chunks through, calling onIdle if the gap between two chunks reaches ms
export async function* withIdleTimeout<T>(
  stream: AsyncIterable<T>,
  ms: number,
  onIdle: () => void,
): AsyncIterable<T> {
  let timer = setTimeout(onIdle, ms);
  try {
    for await (const chunk of stream) {
      clearTimeout(timer);
      timer = setTimeout(onIdle, ms);
      yield chunk;
    }
  } finally {
    clearTimeout(timer);
  }
}
