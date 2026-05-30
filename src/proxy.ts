import { NextRequest, NextResponse } from "next/server"
import NextAuth from "next-auth"
import { authConfig } from "@/lib/auth.config"

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

const { auth: nextAuthMiddleware } = NextAuth(authConfig)

export default async function proxy(req: NextRequest) {
  const csrfError = csrfCheck(req)
  if (csrfError) return csrfError
  return (nextAuthMiddleware as any)(req)
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)"],
}
