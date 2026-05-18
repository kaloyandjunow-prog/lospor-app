import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const { locale } = await req.json()
  const valid = locale === "bg" ? "bg" : "en"
  const res = NextResponse.json({ locale: valid })
  res.cookies.set("locale", valid, { path: "/", maxAge: 60 * 60 * 24 * 365 })
  return res
}
