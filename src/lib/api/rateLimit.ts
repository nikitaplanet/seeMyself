// Spec §13.4 — simple in-memory rate limit for /api/chart (default 30 requests / minute / IP).
// Sliding-window log per key. Process-local: with several instances each enforces its own limit.

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the next request would be allowed (0 when allowed). */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string): RateLimitResult;
  reset(): void;
}

export interface RateLimiterOptions {
  limit?: number;
  windowMs?: number;
  now?: () => number;
  /** Upper bound on tracked keys; stale keys are swept when exceeded. */
  maxKeys?: number;
}

export function createRateLimiter(opts: RateLimiterOptions = {}): RateLimiter {
  const limit = opts.limit ?? 30;
  const windowMs = opts.windowMs ?? 60_000;
  const now = opts.now ?? Date.now;
  const maxKeys = opts.maxKeys ?? 10_000;
  const hits = new Map<string, number[]>();

  function sweep(t: number): void {
    for (const [k, arr] of hits) {
      if (arr.length === 0 || arr[arr.length - 1] <= t - windowMs) hits.delete(k);
    }
  }

  return {
    check(key: string): RateLimitResult {
      const t = now();
      if (hits.size > maxKeys) sweep(t);
      const arr = (hits.get(key) ?? []).filter((ts) => ts > t - windowMs);
      if (arr.length >= limit) {
        hits.set(key, arr);
        const retryAfterSeconds = Math.max(1, Math.ceil((arr[0] + windowMs - t) / 1000));
        return { allowed: false, remaining: 0, retryAfterSeconds };
      }
      arr.push(t);
      hits.set(key, arr);
      return { allowed: true, remaining: limit - arr.length, retryAfterSeconds: 0 };
    },
    reset(): void {
      hits.clear();
    },
  };
}

let current: RateLimiter = createRateLimiter();

export function getChartRateLimiter(): RateLimiter {
  return current;
}

/** Test hook: swap the limiter used by /api/chart (pass nothing to restore the default). */
export function setChartRateLimiter(limiter?: RateLimiter): void {
  current = limiter ?? createRateLimiter();
}

/** Client key: first hop of `x-forwarded-for`, else `x-real-ip`, else 'unknown'. */
export function clientKey(headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  const first = xff?.split(',')[0]?.trim();
  if (first) return first;
  const real = headers.get('x-real-ip')?.trim();
  if (real) return real;
  return 'unknown';
}
