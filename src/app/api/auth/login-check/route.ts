import { NextRequest, NextResponse } from "next/server";
import { checkLoginRateLimit } from "@/lib/rate-limit";
import { isSameOrigin, rejectPreflight } from "@/lib/api-guards";

export const OPTIONS = rejectPreflight;

/**
 * Called by the client immediately before attempting Firebase sign-in.
 * Enforces brute-force protection server-side (Upstash Redis) since the
 * actual Firebase Auth call happens client-side and can't be rate-limited
 * there. Not a bypass-proof gate on its own — Firebase Auth has its own
 * abuse throttling — but stops naive credential-stuffing against this app.
 */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "origem não permitida" }, { status: 403 });
  }

  let email: unknown;
  try {
    const body = await req.json();
    email = body?.email;
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }
  if (typeof email !== "string" || !email.trim()) {
    return NextResponse.json({ error: "email obrigatório" }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const result = await checkLoginRateLimit(ip, email);

  if (!result.success) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente novamente em instantes." },
      { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } }
    );
  }

  return NextResponse.json({ ok: true });
}
