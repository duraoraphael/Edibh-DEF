import { createHmac } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const hashSecret = process.env.RATE_LIMIT_HASH_SECRET;
export const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

export interface RateLimitResult { success: boolean; retryAfterSeconds: number; unavailable?: boolean }
type MemoryEntry = { count: number; reset: number };
const memory = new Map<string, MemoryEntry>();

function protectedIdentity(value: string): string {
  const key = hashSecret || (process.env.NODE_ENV === "production" ? "" : "development-only-rate-limit-key");
  if (!key) throw new Error("RATE_LIMIT_HASH_SECRET is not configured");
  return createHmac("sha256", key).update(value.trim().toLowerCase()).digest("hex");
}

export function rateLimitIdentity(value: string): string | null {
  try { return protectedIdentity(value); } catch { return null; }
}

function memoryLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  const current = memory.get(key);
  const entry = !current || current.reset <= now ? { count: 1, reset: now + windowSeconds * 1000 } : { count: current.count + 1, reset: current.reset };
  memory.set(key, entry);
  return { success: entry.count <= limit, retryAfterSeconds: entry.count <= limit ? 0 : Math.max(1, Math.ceil((entry.reset - now) / 1000)) };
}

export async function fixedWindowLimit(namespace: string, identity: string, limit: number, window: `${number} s` | `${number} m` | `${number} h`): Promise<RateLimitResult> {
  if (!redis) {
    if (process.env.NODE_ENV === "production") return { success: false, retryAfterSeconds: 60, unavailable: true };
    const match = /^(\d+) ([smh])$/.exec(window);
    const seconds = match ? Number(match[1]) * ({ s: 1, m: 60, h: 3600 }[match[2]] || 1) : 60;
    return memoryLimit(`${namespace}:${identity}`, limit, seconds);
  }
  const limiter = new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(limit, window), prefix: `rl:${namespace}` });
  const result = await limiter.limit(identity);
  return { success: result.success, retryAfterSeconds: result.success ? 0 : Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)) };
}

const LOGIN_LOCK_SECONDS = 15 * 60;
const LOGIN_MAX_FAILURES = 5;

export async function checkLoginLock(ip: string, email: string): Promise<RateLimitResult> {
  let account: string;
  try { account = protectedIdentity(email); } catch { return { success: false, retryAfterSeconds: 60, unavailable: true }; }
  const keys = [`rl:login:acct:${account}`, `rl:login:pair:${ip}:${account}`];
  if (!redis) {
    if (process.env.NODE_ENV === "production") return { success: false, retryAfterSeconds: 60, unavailable: true };
    const active = keys.map((key) => memory.get(key)).filter((v) => v && v.reset > Date.now() && v.count >= LOGIN_MAX_FAILURES) as MemoryEntry[];
    return active.length ? { success: false, retryAfterSeconds: Math.max(...active.map((v) => Math.ceil((v.reset - Date.now()) / 1000))) } : { success: true, retryAfterSeconds: 0 };
  }
  const counts = await Promise.all(keys.map((key) => redis.get<number>(key)));
  const lockedKeys = keys.filter((_, index) => (counts[index] || 0) >= LOGIN_MAX_FAILURES);
  if (!lockedKeys.length) return { success: true, retryAfterSeconds: 0 };
  const ttls = await Promise.all(lockedKeys.map((key) => redis.ttl(key)));
  const retry = Math.max(1, ...ttls);
  return retry > 0 ? { success: false, retryAfterSeconds: retry } : { success: true, retryAfterSeconds: 0 };
}

export async function recordLoginFailure(ip: string, email: string): Promise<RateLimitResult> {
  let account: string;
  try { account = protectedIdentity(email); } catch { return { success: false, retryAfterSeconds: 60, unavailable: true }; }
  const keys = [`rl:login:acct:${account}`, `rl:login:pair:${ip}:${account}`];
  if (!redis) {
    if (process.env.NODE_ENV === "production") return { success: false, retryAfterSeconds: 60, unavailable: true };
    const results = keys.map((key) => memoryLimit(key, LOGIN_MAX_FAILURES - 1, LOGIN_LOCK_SECONDS));
    return results.find((r) => !r.success) || { success: true, retryAfterSeconds: 0 };
  }
  const counts = await Promise.all(keys.map(async (key) => { const count = await redis.incr(key); if (count === 1) await redis.expire(key, LOGIN_LOCK_SECONDS); return count; }));
  if (counts.some((count) => count >= LOGIN_MAX_FAILURES)) {
    const ttls = await Promise.all(keys.map((key) => redis.ttl(key)));
    return { success: false, retryAfterSeconds: Math.max(1, ...ttls) };
  }
  return { success: true, retryAfterSeconds: 0 };
}

export async function clearLoginFailures(ip: string, email: string): Promise<void> {
  const account = protectedIdentity(email);
  const keys = [`rl:login:acct:${account}`, `rl:login:pair:${ip}:${account}`];
  if (redis) await redis.del(...keys); else keys.forEach((key) => memory.delete(key));
}
