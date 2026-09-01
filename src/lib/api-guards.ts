import { NextResponse, type NextRequest } from "next/server";
import { isIP } from "node:net";

export function clientIp(req: NextRequest): string {
  const vercelIp = req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  const localIp = process.env.NODE_ENV !== "production" ? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() : "";
  const raw = (vercelIp || localIp || "unknown").replace(/^\[|\]$/g, "");
  return isIP(raw) ? raw.toLowerCase() : "unknown";
}

/**
 * Rejects requests whose Origin (or, absent that, Referer) header doesn't
 * match this deployment's own host. Both API routes here are same-origin
 * fetch-only by design (no third party is meant to call them), so this is
 * defense-in-depth against CSRF/cross-site abuse on top of the browser's
 * own CORS enforcement (which already blocks reading the response, but not
 * the state-changing side effect of a request that reaches the handler).
 */
export function isSameOrigin(req: NextRequest): boolean {
  const host = req.headers.get("host");
  if (!host) return false;

  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  // Fall back to Referer when Origin is absent (some same-origin requests
  // legitimately omit it). If NEITHER header is present, fail closed: a real
  // same-origin fetch() from this app's own client code always sends at
  // least one of them, so their total absence means the request did not
  // originate from the browser running this app — never treat that as
  // authorized.
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).host === host;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Explicit preflight/OPTIONS response for same-origin-only API routes: no
 * Access-Control-Allow-Origin is ever set, so a cross-origin preflight fails
 * closed (the browser won't send the follow-up request) instead of relying
 * on Next's generic 405 for an unhandled method.
 */
export function rejectPreflight(req: NextRequest): NextResponse {
  return NextResponse.json(
    { error: isSameOrigin(req) ? "método não suportado" : "origem não permitida" },
    { status: isSameOrigin(req) ? 405 : 403 }
  );
}

/** Verify a Firebase ID token without introducing an Admin credential. */
export async function authenticateFirebaseRequest(req: NextRequest): Promise<string | null> {
  const token = firebaseBearerToken(req);
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!token || !apiKey) return null;
  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken: token }),
        cache: "no-store",
      }
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as { users?: Array<{ localId?: string }> };
    return payload.users?.[0]?.localId || null;
  } catch {
    return null;
  }
}

export async function firebaseRequestRole(req: NextRequest, userId: string): Promise<string | null> {
  const token = firebaseBearerToken(req);
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!token || !projectId) return null;
  try {
    const response = await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/users/${encodeURIComponent(userId)}`, {
      headers: { authorization: `Bearer ${token}` }, cache: "no-store",
    });
    if (!response.ok) return null;
    const document = (await response.json()) as { fields?: { role?: { stringValue?: string } } };
    return document.fields?.role?.stringValue || null;
  } catch { return null; }
}

export function firebaseBearerToken(req: NextRequest): string | null {
  return req.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/)?.[1] || null;
}
