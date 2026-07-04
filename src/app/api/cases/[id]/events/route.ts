import { NextRequest, NextResponse, after } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@/generated/prisma/client"
import caseEmitter from "@/lib/caseEmitter"
import { checkEventPII } from "@/lib/clinical-pii"
import { logAudit } from "@/lib/audit"
import { addEvent, reconcileFullLog, rebuildProjection, type LogEvent } from "@/lib/case-events"
import { canAccessCase } from "@/lib/access-control"
import { corsHeaders } from "@/lib/cors"
import { z } from "zod"

const CORS = (req: NextRequest) => corsHeaders(req, "POST, PUT, OPTIONS")

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: CORS(req) })
}

// Permissive event schema — known fields typed, unknown ones (color, infId,
// fluidId, etc.) passed through so the timetable projection still sees them.
const eventSchema = z.object({
  id:        z.string().optional(),
  ts:        z.string().optional(),
  type:      z.string().min(1).max(64),
  name:      z.string().max(200).optional(),
  label:     z.string().max(200).optional(),
  dose:      z.union([z.string(), z.number()]).optional(),
  unit:      z.string().max(40).optional(),
  rate:      z.union([z.string(), z.number()]).optional(),
  volume:    z.union([z.string(), z.number()]).optional(),
}).passthrough()

// Free-text fields a user can type — these get the same PII guard as the rest of
// the clinical write paths. Vitals/numbers are not user prose, so they're skipped.
function piiForEvent(ev: { name?: unknown; label?: unknown }): string | null {
  return checkEventPII(ev)
}

const ALLOWED_SOURCES = new Set(["web", "mobile", "ai", "import"])
function sourceFrom(req: NextRequest): string {
  const s = req.headers.get("x-lospor-source") ?? ""
  if (ALLOWED_SOURCES.has(s)) return s
  // Infer from auth style when the client doesn't tag itself: the mobile app uses
  // a Bearer token, the web app uses a cookie session.
  const authz = req.headers.get("authorization") ?? ""
  return authz.startsWith("Bearer ") ? "mobile" : "web"
}

async function authorize(req: NextRequest, id: string) {
  const user = await getAuthUser(req)
  if (!user?.id) return { error: "Unauthorized", status: 401 as const }

  const existing = await prisma.case.findUnique({
    where: { id },
    select: {
      userId: true, status: true,
      user:    { select: { institutionId: true } },
      intraop: { select: { keyEvents: true, startTime: true, updatedAt: true } },
    },
  })
  if (!existing) return { error: "Not found", status: 404 as const }

  if (!canAccessCase(user, existing)) {
    return { error: "Forbidden", status: 403 as const }
  }

  return { user, existing }
}

const SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } as const

// POST — append one event. The CaseEvent rows are the source of truth; the
// keyEvents cache is rebuilt from them so every existing reader is unchanged.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await authorize(req, id)
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { user, existing } = auth

  if (existing.status === "COMPLETE") return NextResponse.json({ error: "Case is finalised" }, { status: 403 })

  let event: z.infer<typeof eventSchema>
  try {
    event = eventSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 })
  }
  if (!event.id) event.id = crypto.randomUUID()

  const piiError = piiForEvent(event)
  if (piiError) {
    return NextResponse.json({ error: `${piiError} Please remove identifying information before saving.` }, { status: 400 })
  }

  // Resolve Drug.id from ATC code when a drug event arrives without one
  if (event.type === "drug" && event.atcCode && !event.drugId) {
    const drug = await prisma.drug.findFirst({ where: { atcCode: String(event.atcCode) }, select: { id: true } })
    if (drug) event.drugId = drug.id
  }

  const source = sourceFrom(req)

  for (let attempt = 0; ; attempt++) {
    try {
      const added = await prisma.$transaction(async tx => {
        const a = await addEvent(tx, id, user.id, event as unknown as LogEvent, source)
        await rebuildProjection(tx, id)
        return a
      }, SERIALIZABLE)

      if (existing.status === "DRAFT") {
        await prisma.case.update({ where: { id }, data: { status: "IN_PROGRESS" } })
      }
      if (added) {
        after(() => logAudit(user.id, "CASE_EVENT_ADD", id, { type: event.type, source }))
        caseEmitter.emit(id, { type: "event", event })
      }
      const intraop = await prisma.intraoperativeRecord.findUnique({ where: { caseId: id }, select: { updatedAt: true } })
      return NextResponse.json({ ok: true, id: event.id, intraopUpdatedAt: intraop?.updatedAt })
    } catch (e: unknown) {
      // Serialization failure (P2034) or a unique race (P2002) — retry a few times.
      if ((e && typeof e === "object" && "code" in e && (e.code === "P2034" || e.code === "P2002")) && attempt < 5) continue
      console.error("[events POST]", e)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  }
}

// PUT — the client sends its full desired log (after an edit/delete). We
// reconcile it into append-only versioned rows: changes supersede, removals
// tombstone. History is never lost.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await authorize(req, id)
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { user, existing } = auth
  if (existing.status === "COMPLETE") return NextResponse.json({ error: "Case is finalised" }, { status: 403 })
  const source = sourceFrom(req)

  const body = await req.json()
  const rawLog = body?.log
  if (!Array.isArray(rawLog)) return NextResponse.json({ error: "log must be array" }, { status: 400 })
  const intraopBase = req.headers.get("x-lospor-intraop-updated-at")
  if (intraopBase && Number.isNaN(new Date(intraopBase).getTime())) {
    return NextResponse.json({ error: "Invalid intraop conflict timestamp" }, { status: 400 })
  }
  if (!intraopBase && existing.intraop?.updatedAt) {
    return NextResponse.json({
      error: "conflict",
      section: "intraop",
      reason: "missing_conflict_timestamp",
      serverVersion: { updatedAt: existing.intraop.updatedAt },
    }, { status: 409 })
  }
  if (intraopBase && existing.intraop?.updatedAt && existing.intraop.updatedAt.getTime() > new Date(intraopBase).getTime()) {
    return NextResponse.json({ error: "conflict", section: "intraop", serverVersion: { updatedAt: existing.intraop.updatedAt } }, { status: 409 })
  }

  // Validate + PII-check every entry before it becomes the working set.
  let log: z.infer<typeof eventSchema>[]
  try {
    log = rawLog.map(e => eventSchema.parse(e))
  } catch {
    return NextResponse.json({ error: "Invalid event in log" }, { status: 400 })
  }
  for (const ev of log) {
    const piiError = piiForEvent(ev)
    if (piiError) {
      return NextResponse.json({ error: `${piiError} Please remove identifying information before saving.` }, { status: 400 })
    }
  }

  for (let attempt = 0; ; attempt++) {
    try {
      await prisma.$transaction(async tx => {
        if (intraopBase) {
          const fresh = await tx.intraoperativeRecord.findUnique({ where: { caseId: id }, select: { updatedAt: true } })
          if (fresh?.updatedAt && fresh.updatedAt.getTime() > new Date(intraopBase).getTime()) {
            throw new Error("INTRAOP_CONFLICT")
          }
        }
        await reconcileFullLog(tx, id, user.id, log as unknown as LogEvent[], source)
        await rebuildProjection(tx, id)
      }, SERIALIZABLE)

      after(() => logAudit(user.id, "CASE_EVENT_EDIT", id, { count: log.length, source }))
      caseEmitter.emit(id, { type: "log_updated" })
      const intraop = await prisma.intraoperativeRecord.findUnique({ where: { caseId: id }, select: { updatedAt: true } })
      return NextResponse.json({ ok: true, intraopUpdatedAt: intraop?.updatedAt })
    } catch (e: unknown) {
      if (e instanceof Error && e.message === "INTRAOP_CONFLICT") {
        const intraop = await prisma.intraoperativeRecord.findUnique({ where: { caseId: id }, select: { updatedAt: true } })
        return NextResponse.json({
          error: "conflict",
          section: "intraop",
          serverVersion: intraop?.updatedAt ? { updatedAt: intraop.updatedAt } : undefined,
        }, { status: 409 })
      }
      if ((e && typeof e === "object" && "code" in e && (e.code === "P2034" || e.code === "P2002")) && attempt < 5) continue
      console.error("[events PUT]", e)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  }
}
