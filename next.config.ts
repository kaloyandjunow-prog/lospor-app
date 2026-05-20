import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts")
const isDev = process.env.NODE_ENV !== "production"

const nextConfig: NextConfig = {
  // Allow the local network IP so HMR and JS hydration work when accessed from the LAN
  ...(isDev ? { allowedDevOrigins: ["192.168.0.105"] } : {}),

  async headers() {
    return [{
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
          `connect-src 'self'${isDev ? " ws://192.168.0.105:3000 ws://localhost:3000" : ""}`,
          "form-action 'self'",
          "base-uri 'self'",
          "frame-ancestors 'none'",
        ].join("; ") },
      ],
    }]
  },
}

export default withNextIntl(nextConfig)
