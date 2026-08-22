import { NextRequest, NextResponse } from "next/server";
import { clientIp, isSameOrigin, rejectPreflight } from "@/lib/api-guards";
import { fixedWindowLimit, rateLimitIdentity } from "@/lib/rate-limit";

export const OPTIONS = rejectPreflight;
const policies = { signup: { ip: 5, account: 3, window: "1 h" as const }, reset: { ip: 10, account: 3, window: "1 h" as const } };

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "origem não permitida" }, { status: 403 });
  if (Number(req.headers.get("content-length") || 0) > 4096) return NextResponse.json({ error: "corpo inválido" }, { status: 413 });
  let flow: keyof typeof policies; let email: string;
  try { const body = await req.json(); flow = body?.flow; email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""; }
  catch { return NextResponse.json({ error: "corpo inválido" }, { status: 400 }); }
  if (!(flow in policies) || !email || email.length > 254) return NextResponse.json({ error: "solicitação inválida" }, { status: 400 });
  const identity = rateLimitIdentity(email);
  if (!identity) return NextResponse.json({ error: "serviço temporariamente indisponível" }, { status: 503, headers: { "Retry-After": "60" } });
  const policy = policies[flow];
  const results = await Promise.all([fixedWindowLimit(`${flow}:ip`, clientIp(req), policy.ip, policy.window), fixedWindowLimit(`${flow}:account`, identity, policy.account, policy.window)]);
  const blocked = results.find((result) => !result.success);
  if (blocked) return NextResponse.json({ error: blocked.unavailable ? "serviço temporariamente indisponível" : "Muitas solicitações. Tente novamente mais tarde." }, { status: blocked.unavailable ? 503 : 429, headers: { "Retry-After": String(blocked.retryAfterSeconds), "Cache-Control": "no-store" } });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
