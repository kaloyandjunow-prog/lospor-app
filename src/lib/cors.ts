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

export function allowedCorsOrigin(): string {
  const configuredList = process.env.CORS_ALLOW_ORIGINS?.split(",").map(origin => origin.trim()).filter(Boolean) ?? []
  const configured = configuredList[0] ?? process.env.CORS_ALLOW_ORIGIN?.trim()
  if (configured) return configured
  if (process.env.NODE_ENV === "production" && process.env.VERCEL_ENV === "production") {
    throw new Error("CORS_ALLOW_ORIGIN or CORS_ALLOW_ORIGINS must be set in production")
  }
  return "*"
}

export function corsHeaders(methods = "GET, POST, PATCH, PUT, DELETE, OPTIONS", headers = DEFAULT_HEADERS) {
  return {
    "Access-Control-Allow-Origin":  allowedCorsOrigin(),
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": headers,
    "Access-Control-Max-Age":       "86400",
  }
}
