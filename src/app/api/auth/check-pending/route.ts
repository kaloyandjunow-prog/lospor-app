import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email") ?? ""
  const start = Date.now()

  const user = email
    ? await prisma.user.findUnique({
        where: { email },
        select: { approvedAt: true, deletedAt: true },
      })
    : null

  const pending = !!(user && !user.approvedAt && !user.deletedAt)

  // Constant-time floor: always respond after at least 200ms to prevent
  // timing-based email enumeration (DB miss is faster than DB hit).
  const elapsed = Date.now() - start
  if (elapsed < 200) await new Promise(r => setTimeout(r, 200 - elapsed))

  return NextResponse.json({ pending })
}
