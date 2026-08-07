import { NextResponse, type NextRequest } from "next/server";

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

  // Non-browser or same-origin navigations may omit Origin; fall back to
  // Referer. If neither header is present, treat as same-origin (e.g. some
  // same-site requests legitimately omit both) rather than break normal use.
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).host === host;
    } catch {
      return false;
    }
  }

  return true;
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
