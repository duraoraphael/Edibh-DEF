import { NextRequest, NextResponse } from "next/server";
import { clientIp, isSameOrigin, rejectPreflight } from "@/lib/api-guards";
import { fixedWindowLimit, rateLimitIdentity } from "@/lib/rate-limit";
import { normalizeEmail } from "@/lib/auth-errors";

export const OPTIONS = rejectPreflight;

// The account quota stops repeated work against one address. The network
// quota is deliberately only a broad emergency ceiling: many legitimate
// employees can share one corporate public IP.
export const policies = {
  signup: { account: 5, network: 60, window: "1 h" as const },
  reset: { account: 5, network: 100, window: "1 h" as const },
};

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "origem não permitida" }, { status: 403 });
  if (Number(req.headers.get("content-length") || 0) > 4096) return NextResponse.json({ error: "corpo inválido" }, { status: 413 });
  let flow: keyof typeof policies; let email: string;
  try { const body = await req.json(); flow = body?.flow; email = typeof body?.email === "string" ? normalizeEmail(body.email) : ""; }
  catch { return NextResponse.json({ error: "corpo inválido" }, { status: 400 }); }
  if (!Object.hasOwn(policies, flow) || !email || email.length > 254) return NextResponse.json({ error: "solicitação inválida" }, { status: 400 });
  const identity = rateLimitIdentity(email);
  if (!identity) return NextResponse.json({ error: "serviço temporariamente indisponível" }, { status: 503, headers: { "Retry-After": "60" } });
  const policy = policies[flow];
  const network = clientIp(req);
  const checks = [
    { scope: "account", promise: fixedWindowLimit(`auth-abuse:v2:${flow}:account`, identity, policy.account, policy.window) },
    // Never collapse every request without a usable Vercel IP into one
    // global "unknown" bucket. The HMAC account quota remains mandatory.
    ...(network === "unknown" ? [] : [{ scope: "network", promise: fixedWindowLimit(`auth-abuse:v2:${flow}:network`, network, policy.network, policy.window) }]),
  ];
  const results = await Promise.all(checks.map(async check => ({ scope: check.scope, result: await check.promise })));
  const blocked = results.find(({ result }) => !result.success);
  if (blocked) {
    const { result, scope } = blocked;
    const status = result.unavailable ? 503 : 429;
    console.warn("auth.abuse.blocked", { flow, scope, status, retryAfterSeconds: result.retryAfterSeconds });
    return NextResponse.json(
      {
        error: result.unavailable ? "serviço temporariamente indisponível" : "Muitas solicitações. Tente novamente mais tarde.",
        code: result.unavailable ? "auth/service-unavailable" : "app/rate-limited",
        retryAfterSeconds: result.retryAfterSeconds,
      },
      { status, headers: { "Retry-After": String(result.retryAfterSeconds), "Cache-Control": "no-store" } }
    );
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
