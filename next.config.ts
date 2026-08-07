import type { NextConfig } from "next";

// Nonce-based CSP was tried via middleware/proxy first, but Next.js only
// injects the nonce into script tags on DYNAMICALLY rendered pages — every
// page in this app is statically prerendered (for performance/CDN caching),
// so no nonce ever reached the actual <script> tags and the CSP silently
// blocked every chunk, including Next's own hydration bootstrap. Verified
// against Next's own docs (nonces require opting every page into dynamic
// rendering) and by inspecting the rendered HTML. A static CSP declared here
// is the documented alternative for statically-rendered apps.
const isDev = process.env.NODE_ENV === "development";

const csp = [
  "default-src 'self'",
  // 'unsafe-eval' is required in dev only (React's dev-mode error-stack
  // reconstruction uses eval); neither React nor Next.js use eval in
  // production. 'unsafe-inline' stays for scripts because Next's inline
  // hydration/RSC bootstrap payload has no nonce/hash to allowlist against
  // on static pages — framer-motion and inline `style={{...}}` need it for
  // style-src the same way.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.googleapis.com https://*.google.com https://*.gstatic.com https://firebasestorage.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.upstash.io",
  "frame-src 'self' https://*.firebaseapp.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Nothing in this app frames itself or is meant to be framed by anyone —
  // the one <iframe> in the app (email preview) uses srcDoc for local
  // content, unrelated to who may frame *this* app. 'none' is strictly
  // tighter than 'self' and matches X-Frame-Options below.
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

// Canonical origin for this deployment. Vercel's edge cache adds
// "Access-Control-Allow-Origin: *" to cached/prerendered pages by default —
// confirmed live on https://fluxocriticos.vercel.app/ and /login, neither
// of which this app ever set — so it's declared explicitly here to
// override the platform default with the app's real origin instead of a
// wildcard. Override via NEXT_PUBLIC_SITE_URL if a custom domain is added.
const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL || "https://fluxocriticos.vercel.app";

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Access-Control-Allow-Origin", value: siteOrigin },
  // 'credentialless' (not 'require-corp') so cross-origin assets that don't
  // send CORP/CORS headers — Firebase Storage images, Google avatar URLs —
  // still load; 'require-corp' would silently break those.
  { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
