import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { logAudit } from "@/lib/audit"

// POST — undo finalization within a 5-minute window
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const caseRecord = await prisma.case.findUnique({
    where: { id },
    select: {
      userId: true,
      status: true,
      finalizedAt: true,
      user: { select: { institutionId: true } },
    },
  })
  if (!caseRecord) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Authorization: case owner, HOD of the same institution, or ADMIN
  const isAdmin = user.role === "ADMIN"
  const isHOD   = user.role === "HEAD_OF_DEPT" &&
    !!user.institutionId &&
    user.institutionId === caseRecord.user?.institutionId
  const isOwner = caseRecord.userId === user.id

  if (!isOwner && !isAdmin && !isHOD) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (caseRecord.status !== "COMPLETE") {
    return NextResponse.json({ error: "Case is not finalized" }, { status: 400 })
  }

  if (!caseRecord.finalizedAt) {
    return NextResponse.json({ error: "Undo window expired" }, { status: 403 })
  }

  const UNDO_WINDOW_MS = 5 * 60 * 1000
  if (Date.now() - caseRecord.finalizedAt.getTime() >= UNDO_WINDOW_MS) {
    return NextResponse.json({ error: "Undo window expired" }, { status: 403 })
  }

  const updated = await prisma.case.update({
    where: { id },
    data: { status: "IN_PROGRESS", finalizedAt: null },
  })

  logAudit(user.id, "CASE_UNFINALIZED", id, { by: user.id })

  return NextResponse.json(updated)
}
