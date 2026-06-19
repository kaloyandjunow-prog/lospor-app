import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { logAudit } from "@/lib/audit"

const CORS = {
  "Access-Control-Allow-Origin":  process.env.CORS_ALLOW_ORIGIN ?? (process.env.NODE_ENV === "production" && process.env.VERCEL_ENV === "production" ? (() => { throw new Error("CORS_ALLOW_ORIGIN must be set in production") })() : "*"),
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age":       "86400",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params

  const updated = await prisma.user.update({
    where: { id },
    data:  { approvedAt: new Date() },
    select: { id: true, email: true, name: true },
  })

  logAudit(user.id, "USER_APPROVE", id)
  return NextResponse.json(updated)
}
