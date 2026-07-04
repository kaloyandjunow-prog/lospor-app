const DEFAULT_HEADERS = [
  "Content-Type",
  "Authorization",
  "x-lospor-preop-updated-at",
  "x-lospor-postop-updated-at",
  "x-lospor-intraop-updated-at",
  "x-lospor-updated-at",
  "x-lospor-force-update",
  "x-lospor-source",
  "x-idempotency-key",
].join(", ")

function allowlist(): string[] {
  const list = process.env.CORS_ALLOW_ORIGINS?.split(",").map(origin => origin.trim()).filter(Boolean) ?? []
  const single = process.env.CORS_ALLOW_ORIGIN?.trim()
  if (single && !list.includes(single)) list.push(single)
  return list
}

// Returns the Access-Control-Allow-Origin value for a request. When the
// request's Origin is on the allowlist it is reflected back (this is what
// makes a multi-origin CORS_ALLOW_ORIGINS actually work — the browser
// requires an exact match, so a static first-entry header would break every
// origin except the first). Unknown or absent origins fall back to the first
// configured entry, preserving the pre-v4.0.1 behaviour.
export function allowedCorsOrigin(requestOrigin?: string | null): string {
  const list = allowlist()
  if (requestOrigin && list.includes(requestOrigin)) return requestOrigin
  if (list.length > 0) return list[0]
  if (process.env.NODE_ENV === "production" && process.env.VERCEL_ENV === "production") {
    throw new Error("CORS_ALLOW_ORIGIN or CORS_ALLOW_ORIGINS must be set in production")
  }
  return "*"
}

// Pass the incoming request (or null for a static fallback) so the allowed
// origin can be reflected per request. `Vary: Origin` tells caches the
// response differs by requesting origin.
export function corsHeaders(req?: { headers: { get(name: string): string | null } } | null, methods = "GET, POST, PATCH, PUT, DELETE, OPTIONS", headers = DEFAULT_HEADERS) {
  return {
    "Access-Control-Allow-Origin":  allowedCorsOrigin(req?.headers.get("origin")),
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": headers,
    "Access-Control-Max-Age":       "86400",
    "Vary":                         "Origin",
  }
}
