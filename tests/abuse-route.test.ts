import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import type { NextRequest } from "next/server";

let network = "203.0.113.10";
let blockedNamespace = "";
const calls: Array<{ namespace: string; identity: string; limit: number; window: string }> = [];
mock.module("next/server", { namedExports: { NextRequest: Request, NextResponse: { json: Response.json } } });
mock.module("../src/lib/api-guards.ts", { namedExports: {
  clientIp: () => network, isSameOrigin: () => true,
  rejectPreflight: () => new Response(null, { status: 405 }),
} });
mock.module("../src/lib/rate-limit.ts", { namedExports: {
  rateLimitIdentity: (value: string) => `hmac:${value}`,
  fixedWindowLimit: async (namespace: string, identity: string, limit: number, window: string) => {
    calls.push({ namespace, identity, limit, window });
    return namespace === blockedNamespace
      ? { success: false, retryAfterSeconds: 125 }
      : { success: true, retryAfterSeconds: 0 };
  },
} });
const { POST, OPTIONS } = await import("../src/app/api/auth/abuse-check/route.ts");
const request = (flow: "signup" | "reset", email = " USER@example.invalid ") => new Request(
  "https://example.invalid/api/auth/abuse-check",
  { method: "POST", body: JSON.stringify({ flow, email }) },
) as NextRequest;

after(() => { blockedNamespace = ""; });

test("signup uses independent HMAC account and high shared-network ceilings", async () => {
  calls.length = 0;
  assert.equal((await POST(request("signup"))).status, 200);
  assert.deepEqual(calls, [
    { namespace: "auth-abuse:v2:signup:account", identity: "hmac:user@example.invalid", limit: 5, window: "1 h" },
    { namespace: "auth-abuse:v2:signup:network", identity: network, limit: 60, window: "1 h" },
  ]);
});

test("two accounts on one network are isolated and reset has separate counters", async () => {
  calls.length = 0;
  await POST(request("signup", "one@example.invalid"));
  await POST(request("signup", "two@example.invalid"));
  await POST(request("reset", "one@example.invalid"));
  assert.deepEqual(calls.filter(call => call.namespace.endsWith(":account")).map(call => call.namespace), [
    "auth-abuse:v2:signup:account", "auth-abuse:v2:signup:account", "auth-abuse:v2:reset:account",
  ]);
  assert.notEqual(calls[0].identity, calls[2].identity);
  assert.equal(calls.at(-1)?.limit, 100);
});

test("unknown network never becomes one global quota", async () => {
  calls.length = 0; network = "unknown";
  assert.equal((await POST(request("signup"))).status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].namespace, "auth-abuse:v2:signup:account");
  network = "203.0.113.10";
});

test("429 returns exact Retry-After and safe scope without input", async () => {
  calls.length = 0;
  blockedNamespace = "auth-abuse:v2:signup:account";
  const response = await POST(request("signup"));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "125");
  assert.deepEqual(await response.json(), {
    error: "Muitas solicitações. Tente novamente mais tarde.",
    code: "app/rate-limited",
    retryAfterSeconds: 125,
  });
  blockedNamespace = "";
});

test("OPTIONS is rejected without consuming any counter", async () => {
  calls.length = 0;
  assert.equal((await OPTIONS(request("signup"))).status, 405);
  assert.equal(calls.length, 0);
});
