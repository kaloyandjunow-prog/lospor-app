import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"

// POST — initiate a transfer
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: caseId } = await params
  const { toUserId } = await req.json()

  if (!toUserId) return NextResponse.json({ error: "toUserId required" }, { status: 400 })
  if (toUserId === user.id) return NextResponse.json({ error: "Cannot transfer to yourself" }, { status: 400 })

  const isHOD   = user.role === "HEAD_OF_DEPT"
  const isAdmin = user.role === "ADMIN"

  const caseRecord = await prisma.case.findFirst({
    where: isAdmin ? { id: caseId }
      : isHOD      ? { id: caseId, user: { institutionId: user.institutionId } }
      : { id: caseId, userId: user.id },
  })
  if (!caseRecord) return NextResponse.json({ error: "Case not found" }, { status: 404 })

  const recipient = await prisma.user.findUnique({ where: { id: toUserId } })
  if (!recipient) return NextResponse.json({ error: "Recipient not found" }, { status: 404 })

  if (!isAdmin && recipient.institutionId !== user.institutionId) {
    return NextResponse.json({ error: "Recipient must be in your institution" }, { status: 403 })
  }

  await prisma.caseTransfer.updateMany({
    where: { caseId, status: "PENDING" },
    data:  { status: "DECLINED", resolvedAt: new Date() },
  })

  if (isHOD || isAdmin) {
    const [transfer] = await prisma.$transaction([
      prisma.caseTransfer.create({
        data: {
          caseId,
          fromUserId:  caseRecord.userId,
          toUserId,
          initiatedBy: user.id,
          status:      "ACCEPTED",
          resolvedAt:  new Date(),
        },
      }),
      prisma.case.update({
        where: { id: caseId },
        data:  { userId: toUserId },
      }),
    ])
    return NextResponse.json({ instant: true, transfer })
  }

  const transfer = await prisma.caseTransfer.create({
    data: {
      caseId,
      fromUserId:  user.id,
      toUserId,
      initiatedBy: user.id,
      status:      "PENDING",
    },
  })
  return NextResponse.json({ instant: false, transfer })
}

// PATCH — recipient accepts or declines
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: caseId } = await params
  const { action } = await req.json()

  if (action !== "accept" && action !== "decline") {
    return NextResponse.json({ error: "action must be accept or decline" }, { status: 400 })
  }

  const transfer = await prisma.caseTransfer.findFirst({
    where: { caseId, toUserId: user.id, status: "PENDING" },
  })
  if (!transfer) return NextResponse.json({ error: "No pending transfer found" }, { status: 404 })

  if (action === "accept") {
    await prisma.$transaction([
      prisma.caseTransfer.update({
        where: { id: transfer.id },
        data:  { status: "ACCEPTED", resolvedAt: new Date() },
      }),
      prisma.case.update({
        where: { id: caseId },
        data:  { userId: user.id },
      }),
    ])
    return NextResponse.json({ accepted: true })
  }

  await prisma.caseTransfer.update({
    where: { id: transfer.id },
    data:  { status: "DECLINED", resolvedAt: new Date() },
  })
  return NextResponse.json({ declined: true })
}
