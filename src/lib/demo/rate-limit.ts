type RateBucket = {
  count: number;
  resetAt: number;
};

type RateState = {
  buckets: Map<string, RateBucket>;
};

const globalState = globalThis as typeof globalThis & {
  __bmDemoRateState?: RateState;
};

const state: RateState = globalState.__bmDemoRateState ?? {
  buckets: new Map<string, RateBucket>(),
};

globalState.__bmDemoRateState = state;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Small in-process fixed-window limiter. For multi-instance deployments this
 * must be replaced by a shared store (for example Redis or a database table);
 * see docs/DEMO_SYSTEM.md.
 */
export function consumeRateLimit(
  key: string,
  options: { limit: number; windowMs: number; now?: number }
): RateLimitResult {
  const now = options.now ?? Date.now();
  const existing = state.buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    state.buckets.set(key, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    return {
      allowed: true,
      remaining: options.limit - 1,
      retryAfterSeconds: 0,
    };
  }

  if (existing.count >= options.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: options.limit - existing.count,
    retryAfterSeconds: 0,
  };
}
