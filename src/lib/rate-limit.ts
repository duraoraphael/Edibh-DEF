import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Server-only Upstash-backed rate limiters for the login endpoint. Two
 * layers: a tight one keyed by IP+email (stops brute-forcing a single
 * account) and a looser one keyed by IP alone (stops one attacker sweeping
 * many accounts from the same source). Both fail OPEN (allow the request)
 * when Upstash isn't configured, so local/dev environments without the env
 * vars keep working — production must set UPSTASH_REDIS_REST_URL /
 * UPSTASH_REDIS_REST_TOKEN for this protection to actually apply.
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

export interface RateLimitResult {
  success: boolean;
  retryAfterSeconds: number;
}

export async function checkLoginRateLimit(ip: string, email: string): Promise<RateLimitResult> {
  if (!perAccountLimiter || !perIpLimiter) {
    // Not configured — allow, but this is a production misconfiguration.
    return { success: true, retryAfterSeconds: 0 };
  }
  const normalizedEmail = email.trim().toLowerCase();
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
