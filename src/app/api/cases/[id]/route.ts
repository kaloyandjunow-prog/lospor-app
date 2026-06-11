import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { mapPreop, mapPreopUpdate, mapIntraop, mapIntraopUpdate, mapPostop, mapPostopUpdate } from "../_mappers"
import { z } from "zod"
import { logAudit } from "@/lib/audit"
import caseEmitter from "@/lib/caseEmitter"
import { preopSchema, intraopSchema, postopSchema } from "@/lib/schemas/case"
import { checkPII } from "@/lib/pii-check"

const CORS = {
  "Access-Control-Allow-Origin":  process.env.CORS_ALLOW_ORIGIN ?? "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-lospor-preop-updated-at, x-lospor-postop-updated-at, x-lospor-updated-at",
  "Access-Control-Max-Age":       "86400",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

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
      intraop: { select: { id: true, keyEvents: true } },
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

    // Helper: compute the next status once, reused by both transaction and audit log
    function computeNextStatus(currentStatus: string): string | undefined {
      const statusOrder: Record<string, number> = { DRAFT: 0, IN_PROGRESS: 1, AWAITING_REVIEW: 2, COMPLETE: 3 }
      let next: string | undefined
      if (status !== undefined) {
        next = status
      } else if (intraop && currentStatus === "DRAFT" && intraop.startTime) {
        next = "IN_PROGRESS"
      } else if (postop && currentStatus === "IN_PROGRESS") {
        next = "AWAITING_REVIEW"
      }
      if (next && statusOrder[next] !== undefined && statusOrder[currentStatus] !== undefined) {
        if (statusOrder[next] < statusOrder[currentStatus]) next = undefined
      }
      return next
    }

    // Sentinel used to surface a conflict detected inside the transaction
    class ConflictError extends Error {
      constructor(readonly section: "preop" | "postop", readonly serverVersion: unknown) { super("conflict") }
    }

    let finalStatus: string | undefined
    try {
      await prisma.$transaction(async tx => {
        // Re-read timestamps inside the transaction so the conflict check is
        // atomic with the write — this eliminates the race window that existed
        // between the outer read and the transaction start.
        const fresh = await tx.case.findUnique({
          where: { id },
          select: { status: true, preop: { select: { updatedAt: true } }, postop: { select: { updatedAt: true } } },
        })
        if (!forceUpdate && preop && preopBase && fresh?.preop?.updatedAt &&
            fresh.preop.updatedAt.getTime() > new Date(preopBase).getTime()) {
          throw new ConflictError("preop", fresh.preop)
        }
        if (!forceUpdate && postop && postopBase && fresh?.postop?.updatedAt &&
            fresh.postop.updatedAt.getTime() > new Date(postopBase).getTime()) {
          throw new ConflictError("postop", fresh.postop)
        }

        if (preop) {
          // Partial update: only touch fields present in the payload, so a stale
          // or partial save never wipes existing preop data. Create still uses
          // the full mapPreop (with defaults) for brand-new records.
          const op = existing.preop ? { update: mapPreopUpdate(preop) } : { create: mapPreop(preop) }
          await tx.case.update({ where: { id }, data: { preop: op } })
        }
        if (intraop) {
          let effectiveIntraop = intraop
          if ("timetableData" in intraop && intraop.timetableData) {
            const existingKev = (existing.intraop?.keyEvents as any) ?? {}
            const existingLog: any[] = Array.isArray(existingKev.log) ? existingKev.log : []
            // Convert web-added clinicalEvents to log entries so mobile can see them
            const webCEs: any[] = (intraop.timetableData as any)?.clinicalEvents ?? []
            const logLabels = new Set(existingLog.filter((e: any) => e.type === "clinical_event" || e.type === "event").map((e: any) => e.label))
            let mergedLog = existingLog
            if (webCEs.length > 0 && existingLog.length > 0) {
              const sortedLog = [...existingLog].sort((a: any, b: any) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
              const chartStartMs = sortedLog[0]?.ts ? new Date(sortedLog[0].ts).getTime() : null
              if (chartStartMs) {
                const newEntries = webCEs
                  .filter((ce: any) => !logLabels.has(ce.label))
                  .map((ce: any) => ({
                    id: `web-${ce.colIdx}-${ce.label}`,
                    ts: new Date(chartStartMs + ce.colIdx * 5 * 60_000).toISOString(),
                    type: "clinical_event",
                    label: ce.label,
                    color: ce.color,
                  }))
                if (newEntries.length > 0) mergedLog = [...existingLog, ...newEntries]
              }
            }
            effectiveIntraop = { ...intraop, timetableData: { ...intraop.timetableData, log: mergedLog } }
          }
          const op = existing.intraop ? { update: mapIntraopUpdate(effectiveIntraop) } : { create: mapIntraop(effectiveIntraop) }
          await tx.case.update({ where: { id }, data: { intraop: op } })
        }
        if (postop) {
          // Partial update for existing records (see mapPreopUpdate rationale)
          const op = existing.postop ? { update: mapPostopUpdate(postop) } : { create: mapPostop(postop) }
          await tx.case.update({ where: { id }, data: { postop: op } })
        }

        // Status transition rules:
        //   1. Explicit status in payload → use as-is (e.g., final submit sends "COMPLETE")
        //   2. No explicit status + intraop data + current DRAFT → promote to IN_PROGRESS
        //   3. No explicit status + postop data + current IN_PROGRESS → promote to AWAITING_REVIEW
        //   4. Never implicitly demote a status
        //   COMPLETE is never set automatically — only on explicit client send
        const currentStatus = fresh?.status ?? existing.status
        finalStatus = computeNextStatus(currentStatus)
        if (finalStatus) {
          await tx.case.update({
            where: { id },
            data: {
              status: finalStatus as any,
              ...(finalStatus === "COMPLETE" ? { finalizedAt: new Date() } : {}),
            },
          })
        }
        if (notes !== undefined) {
          const sanitised = notes == null ? null : notes.trim().slice(0, 1000)
          await tx.case.update({ where: { id }, data: { notes: sanitised } })
        }
      })
    } catch (err) {
      if (err instanceof ConflictError) {
        return NextResponse.json({ error: "conflict", section: err.section, serverVersion: err.serverVersion }, { status: 409 })
      }
      throw err
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
