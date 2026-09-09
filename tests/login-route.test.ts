import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import type { NextRequest } from "next/server";
let result = { success: true, retryAfterSeconds: 0, unavailable: false };
let calls: string[] = [];
mock.module("next/server", { namedExports: { NextRequest: Request, NextResponse: { json: Response.json } } });
mock.module("../src/lib/api-guards.ts", { namedExports: { clientIp: () => "test-ip", isSameOrigin: () => true, rejectPreflight: () => {} } });
mock.module("../src/lib/rate-limit.ts", { namedExports: {
  fixedWindowLimit: async (key: string) => { calls.push(key); return result; }, rateLimitIdentity: () => "hashed-identity",
} });
const { POST } = await import("../src/app/api/auth/login-check/route.ts");
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Gate must never authenticate or call Firebase"); };
after(() => { globalThis.fetch = realFetch; });
const request = () => new Request("https://example.invalid/api/auth/login-check", { method: "POST", body: JSON.stringify({ email: " TEST@example.invalid " }) }) as NextRequest;
test("login gate checks IP and account without password or a second Firebase authentication", async () => {
  calls = [];
  assert.equal((await POST(request())).status, 200);
  assert.deepEqual(calls.sort(), ["login:v2:account", "login:v2:ip"]);
});
test("login gate returns exact limit code and Retry-After", async () => {
  result = { success: false, retryAfterSeconds: 123, unavailable: false };
  const response = await POST(request());
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "123");
  assert.equal((await response.json()).code, "auth/too-many-requests");
});
test("missing limiter fails closed with service-unavailable, not invalid credentials", async () => {
  result = { success: false, retryAfterSeconds: 60, unavailable: true };
  const response = await POST(request());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "auth/service-unavailable");
});
