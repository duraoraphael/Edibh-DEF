import { NextRequest, NextResponse } from "next/server";
import { clientIp, isSameOrigin, rejectPreflight } from "@/lib/api-guards";
import { checkLoginLock, clearLoginFailures, fixedWindowLimit, recordLoginFailure } from "@/lib/rate-limit";

export const OPTIONS = rejectPreflight;

function limited(retryAfterSeconds: number, unavailable = false) {
  return NextResponse.json(
    { error: unavailable ? "serviço temporariamente indisponível" : "Muitas tentativas. Tente novamente mais tarde." },
    { status: unavailable ? 503 : 429, headers: { "Retry-After": String(retryAfterSeconds), "Cache-Control": "no-store" } }
  );
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "origem não permitida" }, { status: 403 });
  if (Number(req.headers.get("content-length") || 0) > 16_384) return NextResponse.json({ error: "corpo inválido" }, { status: 413 });
  let email: string;
  let password: string;
  try {
    const body = await req.json();
    email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    password = typeof body?.password === "string" ? body.password : "";
  } catch { return NextResponse.json({ error: "corpo inválido" }, { status: 400 }); }
  if (!email || email.length > 254 || !password || password.length > 1024) return NextResponse.json({ error: "credenciais inválidas" }, { status: 400 });

  const ip = clientIp(req);
  const ipLimit = await fixedWindowLimit("login:ip", ip, 30, "15 m");
  if (!ipLimit.success) return limited(ipLimit.retryAfterSeconds, ipLimit.unavailable);
  const lock = await checkLoginLock(ip, email);
  if (!lock.success) return limited(lock.retryAfterSeconds, lock.unavailable);
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) return limited(60, true);
  try {
    const provider = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: false }), cache: "no-store",
    });
    if (!provider.ok) {
      const failure = await recordLoginFailure(ip, email);
      if (!failure.success) return limited(failure.retryAfterSeconds, failure.unavailable);
      return NextResponse.json({ error: "credenciais inválidas" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    await clearLoginFailures(ip, email);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return limited(60, true); }
}
