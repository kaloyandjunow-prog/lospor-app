import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"
import withPWAInit from "@ducanh2912/next-pwa"

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts")
const isDev = process.env.NODE_ENV !== "production"
// In production set CORS_ALLOW_ORIGIN to the PWA/mobile origin (e.g. https://app.lospor.eu).
// Dev defaults to * so the local PWA on :3001 can reach the API on :3000.
const corsOrigin = isDev ? "*" : (process.env.CORS_ALLOW_ORIGIN ?? "*")

const withPWA = withPWAInit({
  dest: "public",
  disable: isDev,      // skip SW in dev to avoid stale-cache surprises
  reloadOnOnline: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: false,
  workboxOptions: {
    // Never cache API routes — clinical data must always be fresh
    runtimeCaching: [
      {
        urlPattern: /^\/api\//,
        handler: "NetworkOnly",
      },
      {
        urlPattern: /\/_next\/static\/.*/,
        handler: "CacheFirst",
        options: {
          cacheName: "next-static",
          expiration: { maxEntries: 128, maxAgeSeconds: 7 * 24 * 60 * 60 },
        },
      },
      {
        urlPattern: /\.(png|jpg|jpeg|svg|webp|ico|woff2?)$/,
        handler: "CacheFirst",
        options: {
          cacheName: "static-assets",
          expiration: { maxEntries: 64, maxAgeSeconds: 30 * 24 * 60 * 60 },
        },
      },
    ],
  },
})

const nextConfig: NextConfig = {
  // Allow the local network IP so HMR and JS hydration work when accessed from the LAN
  ...(isDev ? { allowedDevOrigins: ["192.168.0.107"] } : {}),

  async headers() {
    return [
    {
      // CORS for React Native mobile app — bearer token auth still required on all routes
      source: "/api/:path*",
      headers: [
        { key: "Access-Control-Allow-Origin",  value: corsOrigin },
        { key: "Access-Control-Allow-Methods", value: "GET, POST, PATCH, DELETE, OPTIONS" },
        { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization, x-lospor-preop-updated-at, x-lospor-postop-updated-at, x-lospor-updated-at" },
      ],
    },
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options",        value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy",        value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy",     value: "camera=(), microphone=(), geolocation=()" },
        { key: "Content-Security-Policy", value: [
          "default-src 'self'",
          // Dev mode webpack bundles use eval() for source maps — stripped in production builds
          `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          // Dev HMR uses ws: on the same host; production only needs self
          `connect-src 'self'${isDev ? " ws://192.168.0.107:3000 ws://localhost:3000" : ""}`,
          "form-action 'self'",
          "base-uri 'self'",
          "frame-ancestors 'none'",
        ].join("; ") },
      ],
    }]
  },
}

// Sentry webpack plugin (source-map upload) is wired in sentry.*.config.ts.
// withSentryConfig is intentionally NOT used here — it breaks Next.js 16 Turbopack's
// catch-all route handling (NextAuth [...nextauth] returns 404).
// To enable Sentry in production, set NEXT_PUBLIC_SENTRY_DSN in Vercel env vars.
export default withNextIntl(withPWA(nextConfig))
