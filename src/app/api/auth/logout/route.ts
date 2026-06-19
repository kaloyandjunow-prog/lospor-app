import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { revokeToken } from "@/lib/token-blocklist"

const CORS = {
  "Access-Control-Allow-Origin":  process.env.CORS_ALLOW_ORIGIN ?? (process.env.NODE_ENV === "production" && process.env.VERCEL_ENV === "production" ? (() => { throw new Error("CORS_ALLOW_ORIGIN must be set in production") })() : "*"),
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age":       "86400",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

// POST /api/auth/logout — revokes the caller's bearer token server-side so a
// lost/stolen device's token stops working immediately instead of staying valid
// for the rest of its 8h lifetime. Idempotent: always returns ok.
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (user?.jti) {
    // Token TTL is 8h; block the jti until at least then so it can't be replayed.
    await revokeToken(user.jti, new Date(Date.now() + 8 * 60 * 60 * 1000))
  }
  return NextResponse.json({ ok: true }, { headers: CORS })
}
