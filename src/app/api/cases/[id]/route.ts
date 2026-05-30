import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { mapPreop, mapIntraop, mapPostop } from "../_mappers"
import { z } from "zod"
import { logAudit } from "@/lib/audit"
import caseEmitter from "@/lib/caseEmitter"
import { preopSchema, intraopSchema, postopSchema } from "@/lib/schemas/case"
import { checkPII } from "@/lib/pii-check"

const patchBodySchema = z.object({
  status:  z.enum(["DRAFT", "IN_PROGRESS", "AWAITING_REVIEW", "COMPLETE"]).optional(),
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
      preop:  true,
      intraop: { select: { id: true } },
      postop:  true,
    },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const isAdmin = user.role === "ADMIN"
  // Explicit null guards: a HOD with no institution must never match all cases
  const isHOD   = user.role === "HEAD_OF_DEPT" &&
    !!user.institutionId &&
    user.institutionId === existing.user?.institutionId
  if (existing.userId !== userId && !isAdmin && !isHOD)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (existing.status === "COMPLETE") return NextResponse.json({ error: "Case is finalised" }, { status: 403 })

  try {
    const body = patchBodySchema.parse(await req.json())
    const { preop, intraop, postop, status, notes } = body
    const preopBase = req.headers.get("x-lospor-preop-updated-at")
    const postopBase = req.headers.get("x-lospor-postop-updated-at")
    const forceUpdate = req.headers.get("x-lospor-force-update") === "true" ||
      (body as any).forceUpdate === true

    if (!forceUpdate && preop && preopBase && existing.preop?.updatedAt && existing.preop.updatedAt.getTime() > new Date(preopBase).getTime()) {
      return NextResponse.json({
        error: "conflict",
        section: "preop",
        serverVersion: existing.preop,
      }, { status: 409 })
    }
    if (!forceUpdate && postop && postopBase && existing.postop?.updatedAt && existing.postop.updatedAt.getTime() > new Date(postopBase).getTime()) {
      return NextResponse.json({
        error: "conflict",
        section: "postop",
        serverVersion: existing.postop,
      }, { status: 409 })
    }

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
      // Status transition rules:
      //   1. Explicit status in payload → use as-is (e.g., final submit sends "COMPLETE")
      //   2. No explicit status + intraop data + current DRAFT → promote to IN_PROGRESS
      //   3. No explicit status + postop data + current IN_PROGRESS → promote to AWAITING_REVIEW
      //      (postop alone on a DRAFT case does not auto-advance; requires intraop pass first)
      //   4. Never implicitly demote a status (no COMPLETE→DRAFT regression from an edit)
      //   COMPLETE is never set automatically — only when the client explicitly sends status:"COMPLETE"
      //   (the final submit button). This prevents autosave from locking the case mid-edit.
      let newStatus: string | undefined
      if (status !== undefined) {
        newStatus = status
      } else if (intraop && existing.status === "DRAFT") {
        newStatus = "IN_PROGRESS"
      } else if (postop && existing.status === "IN_PROGRESS") {
        newStatus = "AWAITING_REVIEW"
      }
      // Never demote: if computed status is lower than current, skip
      const statusOrder: Record<string, number> = { DRAFT: 0, IN_PROGRESS: 1, AWAITING_REVIEW: 2, COMPLETE: 3 }
      if (newStatus && statusOrder[newStatus] !== undefined && statusOrder[existing.status] !== undefined) {
        if (statusOrder[newStatus] < statusOrder[existing.status]) newStatus = undefined
      }
      if (newStatus) {
        await tx.case.update({
          where: { id },
          data: {
            status: newStatus as any,
            // Record when the case was finalized so the undo window can be enforced
            ...(newStatus === "COMPLETE" ? { finalizedAt: new Date() } : {}),
          },
        })
      }
      if (notes !== undefined) {
        const sanitised = notes == null ? null : notes.trim().slice(0, 1000)
        await tx.case.update({ where: { id }, data: { notes: sanitised } })
      }
    })

    // Recompute finalStatus outside the transaction for logging (mirrors transaction logic above)
    let finalStatus: string | undefined
    if (status !== undefined) {
      finalStatus = status
    } else if (intraop && existing.status === "DRAFT") {
      finalStatus = "IN_PROGRESS"
    } else if (postop && existing.status === "IN_PROGRESS") {
      finalStatus = "AWAITING_REVIEW"
    }
    const statusOrder: Record<string, number> = { DRAFT: 0, IN_PROGRESS: 1, AWAITING_REVIEW: 2, COMPLETE: 3 }
    if (finalStatus && statusOrder[finalStatus] !== undefined && statusOrder[existing.status] !== undefined) {
      if (statusOrder[finalStatus] < statusOrder[existing.status]) finalStatus = undefined
    }
    logAudit(userId, "CASE_UPDATE", id, finalStatus ? { from: existing.status, to: finalStatus } : undefined)
    caseEmitter.emit(id, {
      type: "case_updated",
      sections: {
        preop: Boolean(preop),
        intraop: Boolean(intraop),
        postop: Boolean(postop),
        status: Boolean(finalStatus),
        notes: notes !== undefined,
      },
    })

    const updated = await prisma.case.findUnique({
      where: { id },
      select: {
        updatedAt: true,
        finalizedAt: true,
        preop:  { select: { updatedAt: true } },
        postop: { select: { updatedAt: true } },
      },
    })

    return NextResponse.json({
      id,
      updatedAt: updated?.updatedAt,
      finalizedAt: updated?.finalizedAt,
      preopUpdatedAt: updated?.preop?.updatedAt,
      postopUpdatedAt: updated?.postop?.updatedAt,
    })
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
  caseEmitter.emit(id, { type: "case_deleted" })
  return NextResponse.json({ ok: true })
}
