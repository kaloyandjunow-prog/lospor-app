import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"

const CORS = { "Access-Control-Allow-Origin": process.env.CORS_ALLOW_ORIGIN ?? "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Max-Age": "86400" }
export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS }) }

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
