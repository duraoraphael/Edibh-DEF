import { NextRequest, NextResponse } from "next/server";
import { clientIp, isSameOrigin, rejectPreflight } from "@/lib/api-guards";
import { fixedWindowLimit, rateLimitIdentity } from "@/lib/rate-limit";
import { normalizeEmail } from "@/lib/auth-errors";

export const OPTIONS = rejectPreflight;

/** Rate-limit attempts here; the browser authenticates exactly once with Firebase. */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ code: "auth/request-rejected" }, { status: 403 });
  if (Number(req.headers.get("content-length") || 0) > 4096) return NextResponse.json({ code: "auth/invalid-email" }, { status: 413 });
  let email: string;
  try {
    const body = await req.json();
    email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  } catch { return NextResponse.json({ code: "auth/invalid-email" }, { status: 400 }); }
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ code: "auth/invalid-email" }, { status: 400 });
  try {
    const identity = rateLimitIdentity(email);
    if (!identity) throw new Error("limiter-unavailable");
    const results = await Promise.all([
      fixedWindowLimit("login:v2:ip", clientIp(req), 30, "15 m"),
      fixedWindowLimit("login:v2:account", identity, 10, "15 m"),
    ]);
    const blocked = results.find(result => !result.success);
    if (blocked) {
      const code = blocked.unavailable ? "auth/service-unavailable" : "auth/too-many-requests";
      console.error("auth.gate.failed", { operation: "login.limit", code });
      return NextResponse.json({ code }, { status: blocked.unavailable ? 503 : 429, headers: { "Retry-After": String(blocked.retryAfterSeconds), "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("auth.gate.failed", { operation: "login.limit", code: "auth/service-unavailable" });
    return NextResponse.json({ code: "auth/service-unavailable" }, { status: 503, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
  }
}
