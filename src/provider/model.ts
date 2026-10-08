const PROVIDER_URL = "https://openrouter.ai/api/v1/models";

// OpenRouter's public model list
export async function getContextWindow(
  model: string,
  fallback: number,
): Promise<number> {
  try {
    const res = await fetch(PROVIDER_URL, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return fallback;
    const body = (await res.json()) as {
      data: { id: string; context_length?: number | null }[];
    };
    const found = body.data.find((m) => m.id === model);
    return found?.context_length ?? fallback;
  } catch {
    return fallback; // offline or timeout
  }
}
