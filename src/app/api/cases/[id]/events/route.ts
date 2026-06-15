import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@/generated/prisma/client"
import caseEmitter from "@/lib/caseEmitter"
import { checkPII } from "@/lib/pii-check"
import { logAudit } from "@/lib/audit"
import { addEvent, reconcileFullLog, rebuildProjection, type LogEvent } from "@/lib/case-events"
import { z } from "zod"

const CORS = {
  "Access-Control-Allow-Origin":  process.env.CORS_ALLOW_ORIGIN ?? "*",
  "Access-Control-Allow-Methods": "POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age":       "86400",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
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
  return checkPII({
    name:  typeof ev.name === "string" ? ev.name : null,
    label: typeof ev.label === "string" ? ev.label : null,
  })
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
      intraop: { select: { keyEvents: true, startTime: true } },
    },
  })
  if (!existing) return { error: "Not found", status: 404 as const }

  const isAdmin = user.role === "ADMIN"
  // Explicit null guard: a HOD with no institution must never match all cases
  const isHOD   = user.role === "HEAD_OF_DEPT" &&
    !!user.institutionId &&
    existing.user?.institutionId === user.institutionId
  if (existing.userId !== user.id && !isAdmin && !isHOD) {
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
        logAudit(user.id, "CASE_EVENT_ADD", id, { type: event.type, source })
        caseEmitter.emit(id, { type: "event", event })
      }
      return NextResponse.json({ ok: true, id: event.id })
    } catch (e: any) {
      // Serialization failure (P2034) or a unique race (P2002) — retry a few times.
      if ((e?.code === "P2034" || e?.code === "P2002") && attempt < 5) continue
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
  const { user } = auth
  const source = sourceFrom(req)

  const body = await req.json()
  const rawLog = body?.log
  if (!Array.isArray(rawLog)) return NextResponse.json({ error: "log must be array" }, { status: 400 })

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
        await reconcileFullLog(tx, id, user.id, log as unknown as LogEvent[], source)
        await rebuildProjection(tx, id)
      }, SERIALIZABLE)

      logAudit(user.id, "CASE_EVENT_EDIT", id, { count: log.length, source })
      caseEmitter.emit(id, { type: "log_updated" })
      return NextResponse.json({ ok: true })
    } catch (e: any) {
      if ((e?.code === "P2034" || e?.code === "P2002") && attempt < 5) continue
      console.error("[events PUT]", e)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  }
}
