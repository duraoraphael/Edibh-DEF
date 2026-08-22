import { NextRequest, NextResponse } from "next/server";

function contentSecurityPolicy(nonce: string, secureRequest: boolean): string {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // React and Framer Motion set style attributes at runtime.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://firebasestorage.googleapis.com https://lh3.googleusercontent.com",
    "font-src 'self' data:",
    "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://firebasestorage.googleapis.com https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com",
    "frame-src 'self' https://*.firebaseapp.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(secureRequest ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const secureRequest = request.nextUrl.protocol === "https:" || forwardedProto === "https";
  const csp = contentSecurityPolicy(nonce, secureRequest);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [{
    source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
    missing: [
      { type: "header", key: "next-router-prefetch" },
      { type: "header", key: "purpose", value: "prefetch" },
    ],
  }],
};
