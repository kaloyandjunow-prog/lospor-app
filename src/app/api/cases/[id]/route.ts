import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { mapPreop, mapIntraop, mapPostop } from "../_mappers"
import { z } from "zod"
import { logAudit } from "@/lib/audit"
import { preopSchema, intraopSchema, postopSchema } from "@/lib/schemas/case"
import { checkPII } from "@/lib/pii-check"

const patchBodySchema = z.object({
  status:  z.enum(["DRAFT", "IN_PROGRESS", "COMPLETE"]).optional(),
  notes:   z.string().max(1000).nullable().optional(),
  preop:   preopSchema.optional(),
  intraop: intraopSchema.optional(),
  postop:  postopSchema.optional(),
})

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = user.id

  const { id } = await params
  const where = user.role === "ADMIN"
    ? { id }
    : user.role === "HEAD_OF_DEPT"
      ? { id, user: { institutionId: user.institutionId } }
      : { id, userId }

  const record = await prisma.case.findFirst({
    where,
    include: { preop: true, intraop: true, postop: true },
  })
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(record)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = user.id

  const { id } = await params

  const existing = await prisma.case.findUnique({
    where: { id },
    select: {
      userId: true, status: true,
      user:   { select: { institutionId: true } },
      intraop: { select: { id: true } },
      postop:  { select: { id: true } },
    },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const isAdmin = user.role === "ADMIN"
  const isHOD   = user.role === "HEAD_OF_DEPT" && existing.user?.institutionId === user.institutionId
  if (existing.userId !== userId && !isAdmin && !isHOD)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (existing.status === "COMPLETE") return NextResponse.json({ error: "Case is finalised" }, { status: 403 })

  try {
    const body = patchBodySchema.parse(await req.json())
    const { preop, intraop, postop, status, notes } = body

    const piiError = checkPII({
      teamNotes:              preop?.teamNotes as string | null,
      difficultAirwayNotes:  preop?.difficultAirwayNotes as string | null,
      familyAnesthesiaDetails: preop?.familyAnesthesiaDetails as string | null,
      complications:         intraop?.complications as string | null,
      notes:                 notes ?? null,
    })
    if (piiError) {
      logAudit(userId, "PII_BLOCKED", id, { error: piiError })
      return NextResponse.json({ error: `${piiError} Please remove identifying information before saving.` }, { status: 400 })
    }

    await prisma.$transaction(async tx => {
      if (preop) {
        await tx.case.update({ where: { id }, data: { preop: { update: mapPreop(preop) } } })
      }
      if (intraop) {
        const op = existing.intraop ? { update: mapIntraop(intraop) } : { create: mapIntraop(intraop) }
        await tx.case.update({ where: { id }, data: { intraop: op } })
      }
      if (postop) {
        const op = existing.postop ? { update: mapPostop(postop) } : { create: mapPostop(postop) }
        await tx.case.update({ where: { id }, data: { postop: op } })
      }
      // Status promotion: intraop save → IN_PROGRESS automatically (drives dashboard "In theatre" label).
      // COMPLETE is never set automatically — only when the client explicitly sends status:"COMPLETE"
      // (the final submit button). This prevents autosave from locking the case mid-edit.
      const newStatus = status === "COMPLETE" ? "COMPLETE"
        : status ?? (intraop && existing.status === "DRAFT" ? "IN_PROGRESS" : undefined)
      if (newStatus) {
        await tx.case.update({ where: { id }, data: { status: newStatus } })
      }
      if (notes !== undefined) {
        const sanitised = notes == null ? null : notes.trim().slice(0, 1000)
        await tx.case.update({ where: { id }, data: { notes: sanitised } })
      }
    })

    const finalStatus = status === "COMPLETE" ? "COMPLETE"
      : status ?? (intraop && existing.status === "DRAFT" ? "IN_PROGRESS" : undefined)
    logAudit(userId, "CASE_UPDATE", id, finalStatus ? { from: existing.status, to: finalStatus } : undefined)

    return NextResponse.json({ id })
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      console.error("[PATCH /api/cases/:id] ZodError:", JSON.stringify(err.issues, null, 2))
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }
    console.error("[PATCH /api/cases/:id]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = user.id

  const { id } = await params

  const existing = await prisma.case.findUnique({
    where: { id },
    select: { userId: true, status: true },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (existing.userId !== userId && user.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (existing.status === "COMPLETE") return NextResponse.json({ error: "Cannot delete a completed case" }, { status: 400 })

  await prisma.case.delete({ where: { id } })
  logAudit(userId, "CASE_DELETE", id)
  return NextResponse.json({ ok: true })
}
