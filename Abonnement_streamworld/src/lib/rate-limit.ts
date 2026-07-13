/**
 * Minimal fixed-window rate limiter, in-process memory.
 *
 * Good enough for a single dev/staging instance to stop brute-force login
 * attempts. NOT sufficient once you run more than one server instance
 * (each process has its own counters) — swap this for Upstash Ratelimit
 * or similar Redis-backed limiter before scaling horizontally.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, remaining: limit - 1, resetAt };
  }

  if (bucket.count >= limit) {
    return { ok: false, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  return { ok: true, remaining: limit - bucket.count, resetAt: bucket.resetAt };
}

/** Best-effort client IP from standard proxy headers (Vercel/most PaaS set this). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() ?? "unknown";
}
