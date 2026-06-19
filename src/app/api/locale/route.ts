import { NextRequest, NextResponse } from "next/server"

const CORS = {
  "Access-Control-Allow-Origin":  process.env.CORS_ALLOW_ORIGIN ?? (process.env.NODE_ENV === "production" && process.env.VERCEL_ENV === "production" ? (() => { throw new Error("CORS_ALLOW_ORIGIN must be set in production") })() : "*"),
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age":       "86400",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(req: NextRequest) {
  const { locale } = await req.json()
  const valid = locale === "bg" ? "bg" : "en"
  const res = NextResponse.json({ locale: valid })
  res.cookies.set("locale", valid, { path: "/", maxAge: 60 * 60 * 24 * 365 })
  return res
}
