import { NextRequest, NextResponse } from "next/server"
import NextAuth from "next-auth"
import { authConfig } from "@/lib/auth.config"

// ── CORS preflight handler ────────────────────────────────────────────────────
// Handles OPTIONS for every /api/* route centrally so individual route files
// don't each need their own OPTIONS export. Bearer-token APIs require a
// preflight because Authorization is a non-simple header.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  process.env.CORS_ALLOW_ORIGIN ?? "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  // x-lospor-* are the conflict-detection timestamp headers sent by the mobile PATCH requests
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-lospor-preop-updated-at, x-lospor-postop-updated-at, x-lospor-updated-at",
  "Access-Control-Max-Age":       "86400",
}

function handleCorsOptions(req: NextRequest): NextResponse | null {
  if (req.method !== "OPTIONS") return null
  if (!req.nextUrl.pathname.startsWith("/api/")) return null
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}
// ─────────────────────────────────────────────────────────────────────────────

const STATE_CHANGING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"])

function appOrigin(): string | null {
  const raw = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? null
  if (!raw) return null
  try { return new URL(raw).origin } catch { return null }
}

function csrfCheck(req: NextRequest): NextResponse | null {
  if (!STATE_CHANGING_METHODS.has(req.method)) return null
  if ((req.headers.get("authorization") ?? "").startsWith("Bearer ")) return null
  if (req.method === "OPTIONS") return null

  const expected = appOrigin()
  if (!expected) {
    console.warn("[proxy] CSRF origin check skipped: NEXTAUTH_URL and NEXT_PUBLIC_APP_URL are both unset.")
    return null
  }

  const origin = req.headers.get("origin")
  if (!origin) {
    const referer = req.headers.get("referer")
    if (referer) {
      try { if (new URL(referer).origin === expected) return null } catch { /* fall through */ }
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  return origin !== expected ? NextResponse.json({ error: "Forbidden" }, { status: 403 }) : null
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

export default async function proxy(req: NextRequest) {
  // 1. CORS OPTIONS preflight — must be first so it applies to every /api/* route
  const corsOptions = handleCorsOptions(req)
  if (corsOptions) return corsOptions

  // 2. API routes pass through; CSRF + auth apply only to web-app page routes
  if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.next()

  const redirect = mobileRedirect(req)
  if (redirect) return redirect

  const csrfError = csrfCheck(req)
  if (csrfError) return csrfError

  return (nextAuthMiddleware as any)(req)
}

export const config = {
  // Include /api/* now (for CORS preflight handling), still exclude static assets
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)"],
}
