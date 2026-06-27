import { NextRequest, NextResponse } from "next/server"
import type { NextFetchEvent, NextMiddleware } from "next/server"
import NextAuth, { type NextAuthRequest } from "next-auth"
import { authConfig } from "@/lib/auth.config"
import { corsHeaders } from "@/lib/cors"
import { validateCookieWriteOrigin } from "@/lib/csrf"

// ── CORS preflight handler ────────────────────────────────────────────────────
// Handles OPTIONS for every /api/* route centrally so individual route files
// don't each need their own OPTIONS export. Bearer-token APIs require a
// preflight because Authorization is a non-simple header.
// x-lospor-* are conflict-detection timestamp + sync headers sent by mobile/PWA;
// x-idempotency-key / x-lospor-source are sent by the intraop event endpoints.
const CORS_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
const CORS_REQUEST_HEADERS = "Content-Type, Authorization, x-lospor-preop-updated-at, x-lospor-postop-updated-at, x-lospor-intraop-updated-at, x-lospor-updated-at, x-lospor-force-update, x-lospor-source, x-idempotency-key"

function handleCorsOptions(req: NextRequest): NextResponse | null {
  if (req.method !== "OPTIONS") return null
  if (!req.nextUrl.pathname.startsWith("/api/")) return null
  return new NextResponse(null, { status: 204, headers: corsHeaders(CORS_METHODS, CORS_REQUEST_HEADERS) })
}
// ─────────────────────────────────────────────────────────────────────────────

function csrfCheck(req: NextRequest): NextResponse | null {
  if (req.method === "OPTIONS") return null
  const result = validateCookieWriteOrigin(req)
  if (result === "skip") {
    console.warn("[proxy] CSRF origin check skipped: NEXTAUTH_URL and NEXT_PUBLIC_APP_URL are both unset.")
    return null
  }
  return result === "fail" ? NextResponse.json({ error: "Forbidden" }, { status: 403 }) : null
}

// ── Mobile PWA redirect ───────────────────────────────────────────────────────
// Only active when MOBILE_PWA_URL is set in env (not set in local dev by default).
// Set MOBILE_PWA_URL=http://192.168.x.x:3001 in .env.local to test locally.

const MOBILE_PWA_URL = process.env.MOBILE_PWA_URL

const MOBILE_BYPASS = [
  /^\/api\//,
  /^\/_next\//,
  /^\/icons\//,
  /^\/manifest/,
  /^\/sw\.js/,
  /^\/offline/,
  /\.(png|jpg|svg|webp|ico|json|txt|xml)$/,
]

function isMobileBrowser(ua: string): boolean {
  return /android|iphone|ipad|ipod|mobile|blackberry|windows phone/i.test(ua)
}

function mobileRedirect(req: NextRequest): NextResponse | null {
  if (!MOBILE_PWA_URL) return null
  const { pathname } = req.nextUrl
  if (MOBILE_BYPASS.some(r => r.test(pathname))) return null
  const isRootish = pathname === "/" || pathname.startsWith("/cases") || pathname.startsWith("/dashboard")
  if (!isRootish) return null
  const ua = req.headers.get("user-agent") ?? ""
  if (!isMobileBrowser(ua)) return null
  const destination = `${MOBILE_PWA_URL}${pathname}${req.nextUrl.search}`
  return NextResponse.redirect(destination, { status: 302 })
}
// ─────────────────────────────────────────────────────────────────────────────

const { auth: nextAuthMiddleware } = NextAuth(authConfig)

export default async function proxy(req: NextRequest, event: NextFetchEvent) {
  // 1. CORS OPTIONS preflight — must be first so it applies to every /api/* route
  const corsOptions = handleCorsOptions(req)
  if (corsOptions) return corsOptions

  // 2. API routes pass through after rejecting cross-site cookie-authenticated writes.
  if (req.nextUrl.pathname.startsWith("/api/")) {
    const csrfError = csrfCheck(req)
    if (csrfError) return csrfError
    return NextResponse.next()
  }

  const redirect = mobileRedirect(req)
  if (redirect) return redirect

  const csrfError = csrfCheck(req)
  if (csrfError) return csrfError

  // `auth()`'s public type is a 5-overload union that's ambiguous for plain
  // (request, event) calls — pin the exact signature NextAuth actually uses
  // for middleware mode (NextAuthRequest + NextFetchEvent) instead of
  // widening the whole call to `any`. NextAuth populates the `auth` field on
  // the request internally; callers don't pre-populate it.
  const middleware = nextAuthMiddleware as unknown as (request: NextAuthRequest, event: NextFetchEvent) => ReturnType<NextMiddleware>
  return middleware(req as NextAuthRequest, event)
}

export const config = {
  // Include /api/* now (for CORS preflight handling), still exclude static assets
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)"],
}
