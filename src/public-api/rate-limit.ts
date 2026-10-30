/**
 * Best-effort in-memory limiter for a single instance. Production deployments
 * should also enforce limits at the edge (CDN/WAF). Kept dependency-free so the
 * public module does not need a database.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;

function configuredLimit(): number {
  const raw = Number(process.env.VOTAVIA_PUBLIC_RATE_LIMIT ?? "");
  return Number.isFinite(raw) && raw >= 1 && raw <= 10_000 ? Math.floor(raw) : 120;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

export function consumeRateLimit(key: string, now = Date.now()): RateLimitResult {
  if (buckets.size > 20_000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
  }

  const limit = configuredLimit();
  const existing = buckets.get(key);
  const bucket = existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + WINDOW_MS };
  bucket.count += 1;
  buckets.set(key, bucket);

  return {
    allowed: bucket.count <= limit,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export function __resetRateLimit() {
  buckets.clear();
}
