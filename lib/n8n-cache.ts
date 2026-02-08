/** In-memory cache for n8n enriched results.
 *  Keyed by Devin session ID. For production on Vercel, swap for Vercel KV. */

interface CachedResult {
  structuredOutput: Record<string, unknown>;
  updatedAt: string;
}

const cache = new Map<string, CachedResult>();

export function setCachedResult(
  sessionId: string,
  structuredOutput: Record<string, unknown>,
): void {
  cache.set(sessionId, {
    structuredOutput,
    updatedAt: new Date().toISOString(),
  });
}

export function getCachedResult(
  sessionId: string,
): CachedResult | null {
  return cache.get(sessionId) ?? null;
}
