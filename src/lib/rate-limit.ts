export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

type Bucket = number[];

const buckets = new Map<string, Bucket>();

/**
 * Sliding window kept in process memory. Fits this single-node SQLite app
 * and needs no extra infrastructure. It resets on restart and is not shared
 * across multiple server processes.
 */
export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now()
): RateLimitResult {
  const hits = (buckets.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);

  if (hits.length >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000));
    buckets.set(key, hits);
    return { ok: false, retryAfterSeconds };
  }

  hits.push(now);
  buckets.set(key, hits);
  return { ok: true };
}
