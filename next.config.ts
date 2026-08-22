import type { NextConfig } from "next";

// Canonical origin for this deployment. Vercel's edge cache adds
// "Access-Control-Allow-Origin: *" to cached/prerendered pages by default —
// confirmed live on https://fluxocriticos.vercel.app/ and /login, neither
// of which this app ever set — so it's declared explicitly here to
// override the platform default with the app's real origin instead of a
// wildcard. Override via NEXT_PUBLIC_SITE_URL if a custom domain is added.
const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL || "https://fluxocriticos.vercel.app";

// The Firebase Web config is public by design. Accept the legacy FIREBASE_*
// names already configured in Vercel and expose them under the static
// NEXT_PUBLIC_* names required by the browser bundle. This does not expose
// Firebase Admin credentials; none are used here.
const firebasePublicEnv = {
  NEXT_PUBLIC_FIREBASE_API_KEY:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || "",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN || "",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || "",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID || "",
  NEXT_PUBLIC_FIREBASE_APP_ID:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID || "",
};

const securityHeaders = [
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
  productionBrowserSourceMaps: false,
  env: firebasePublicEnv,
  // The email route reads these immutable assets at runtime. Explicit tracing
  // guarantees they are packaged with the Vercel serverless function.
  outputFileTracingIncludes: {
    "/api/email/send": ["./public/logo-cim-email.png", "./public/petrobras.png"],
  },
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
