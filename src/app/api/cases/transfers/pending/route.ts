import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userId = (session.user as any).id

  const pending = await prisma.caseTransfer.findMany({
    where: { toUserId: userId, status: "PENDING" },
    include: {
      case: {
        include: { preop: { select: { plannedProcedure: true, diagnosis: true } } },
      },
      fromUser: { select: { name: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(pending)
}
