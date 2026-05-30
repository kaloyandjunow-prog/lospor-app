import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const pending = await prisma.caseTransfer.findMany({
    where: { toUserId: user.id, status: "PENDING" },
    include: {
      case: {
        include: { preop: { select: { plannedProcedure: true, diagnosis: true } } },
      },
      fromUser: { select: { name: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(
    pending.map((transfer) => ({
      ...transfer,
      procedureName: transfer.case.preop?.plannedProcedure ?? transfer.case.preop?.diagnosis ?? null,
    }))
  )
}
