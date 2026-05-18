import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"

// POST — initiate a transfer
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: caseId } = await params
  const me = session.user as any
  const { toUserId } = await req.json()

  if (!toUserId) return NextResponse.json({ error: "toUserId required" }, { status: 400 })
  if (toUserId === me.id) return NextResponse.json({ error: "Cannot transfer to yourself" }, { status: 400 })

  // Load the case — access rules vary by role
  const isHOD   = me.role === "HEAD_OF_DEPT"
  const isAdmin  = me.role === "ADMIN"

  const caseRecord = await prisma.case.findFirst({
    where: isAdmin ? { id: caseId }
      : isHOD    ? { id: caseId, institutionId: me.institutionId }
      :              { id: caseId, userId: me.id },
  })
  if (!caseRecord) return NextResponse.json({ error: "Case not found" }, { status: 404 })

  // Verify recipient exists
  const recipient = await prisma.user.findUnique({ where: { id: toUserId } })
  if (!recipient) return NextResponse.json({ error: "Recipient not found" }, { status: 404 })

  // MEMBER: recipient must be in same institution
  if (!isHOD && !isAdmin && recipient.institutionId !== me.institutionId) {
    return NextResponse.json({ error: "Recipient must be in your institution" }, { status: 403 })
  }

  // Cancel any existing pending transfer for this case
  await prisma.caseTransfer.updateMany({
    where: { caseId, status: "PENDING" },
    data:  { status: "DECLINED", resolvedAt: new Date() },
  })

  // HOD and ADMIN: instant transfer
  if (isHOD || isAdmin) {
    const [transfer] = await prisma.$transaction([
      prisma.caseTransfer.create({
        data: {
          caseId,
          fromUserId:  caseRecord.userId,
          toUserId,
          initiatedBy: me.id,
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

  // MEMBER: create pending transfer
  const transfer = await prisma.caseTransfer.create({
    data: {
      caseId,
      fromUserId:  me.id,
      toUserId,
      initiatedBy: me.id,
      status:      "PENDING",
    },
  })
  return NextResponse.json({ instant: false, transfer })
}

// PATCH — recipient accepts or declines
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: caseId } = await params
  const me = session.user as any
  const { action } = await req.json()

  if (action !== "accept" && action !== "decline") {
    return NextResponse.json({ error: "action must be accept or decline" }, { status: 400 })
  }

  const transfer = await prisma.caseTransfer.findFirst({
    where: { caseId, toUserId: me.id, status: "PENDING" },
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
        data:  { userId: me.id },
      }),
    ])
    return NextResponse.json({ accepted: true })
  }

  // decline
  await prisma.caseTransfer.update({
    where: { id: transfer.id },
    data:  { status: "DECLINED", resolvedAt: new Date() },
  })
  return NextResponse.json({ declined: true })
}
