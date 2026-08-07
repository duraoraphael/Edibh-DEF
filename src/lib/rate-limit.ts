import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Rate limiters for the login endpoint. Two layers: a tight one keyed by
 * IP+email (stops brute-forcing a single account) and a looser one keyed by
 * IP alone (stops one attacker sweeping many accounts from the same
 * source).
 *
 * Backed by Upstash Redis when configured (accurate across every
 * serverless instance/region). When it's NOT configured, this used to fail
 * OPEN — confirmed in production (Vercel) by sending the same login-check
 * request 7 times in a row and getting HTTP 200 every time, no throttling
 * at all. That's a real, live gap, not a theoretical one, so the fallback
 * below is an in-memory sliding window instead: per serverless instance
 * (not perfectly accurate across regions/cold starts, since each instance
 * has its own memory), but it actually blocks a burst from the same
 * instance instead of doing nothing. Set UPSTASH_REDIS_REST_URL /
 * UPSTASH_REDIS_REST_TOKEN in Vercel for the accurate, distributed version.
 */

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = url && token ? new Redis({ url, token }) : null;

const perAccountLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "60 s"),
      prefix: "ratelimit:login:account",
    })
  : null;

const perIpLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, "10 m"),
      prefix: "ratelimit:login:ip",
    })
  : null;

interface MemoryLimitConfig {
  limit: number;
  windowMs: number;
}

const MEMORY_ACCOUNT_LIMIT: MemoryLimitConfig = { limit: 5, windowMs: 60_000 };
const MEMORY_IP_LIMIT: MemoryLimitConfig = { limit: 20, windowMs: 600_000 };

// Module-scope Map: persists for the lifetime of a warm serverless
// instance, reset on cold start. Bounded via periodic sweep so it can't
// grow unbounded under sustained traffic.
const memoryHits = new Map<string, number[]>();

function checkMemoryLimit(key: string, { limit, windowMs }: MemoryLimitConfig): { success: boolean; resetAt: number } {
  const now = Date.now();
  const windowStart = now - windowMs;

  if (memoryHits.size > 10_000) {
    for (const [k, hits] of memoryHits) {
      if (hits.every((t) => t <= windowStart)) memoryHits.delete(k);
    }
  }

  const hits = (memoryHits.get(key) || []).filter((t) => t > windowStart);
  hits.push(now);
  memoryHits.set(key, hits);

  return { success: hits.length <= limit, resetAt: hits[0] + windowMs };
}

export interface RateLimitResult {
  success: boolean;
  retryAfterSeconds: number;
}

export async function checkLoginRateLimit(ip: string, email: string): Promise<RateLimitResult> {
  const normalizedEmail = email.trim().toLowerCase();

  if (perAccountLimiter && perIpLimiter) {
    const [ipResult, accountResult] = await Promise.all([
      perIpLimiter.limit(`ip:${ip}`),
      perAccountLimiter.limit(`acct:${ip}:${normalizedEmail}`),
    ]);
    const blocked = !ipResult.success || !accountResult.success;
    const reset = Math.max(ipResult.reset, accountResult.reset);
    return {
      success: !blocked,
      retryAfterSeconds: blocked ? Math.max(1, Math.ceil((reset - Date.now()) / 1000)) : 0,
    };
  }

  const ipResult = checkMemoryLimit(`ip:${ip}`, MEMORY_IP_LIMIT);
  const accountResult = checkMemoryLimit(`acct:${ip}:${normalizedEmail}`, MEMORY_ACCOUNT_LIMIT);
  const blocked = !ipResult.success || !accountResult.success;
  const reset = Math.max(ipResult.resetAt, accountResult.resetAt);
  return {
    success: !blocked,
    retryAfterSeconds: blocked ? Math.max(1, Math.ceil((reset - Date.now()) / 1000)) : 0,
  };
}
