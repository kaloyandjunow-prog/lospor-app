import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import caseEmitter from "@/lib/caseEmitter"

type LogEvent = {
  id?: string
  ts?: string
  type?: string
  name?: string
  dose?: string
  unit?: string
  color?: string
  systolic?: number
  diastolic?: number
  heartRate?: number
  spO2?: number
  etco2?: number
  temp?: number
  infId?: string
  rate?: string
  fluidId?: string
  volume?: string
}

// Item 29: Cap column index to prevent unbounded sparse arrays for malformed timestamps
// or very long cases. 2016 = 7 days × 24h × 12 five-minute intervals per hour.
const MAX_COLS = 2016
function colFor(ev: LogEvent, start: Date) {
  const t = ev.ts ? new Date(ev.ts).getTime() : Date.now()
  return Math.min(Math.max(0, Math.floor((t - start.getTime()) / (5 * 60_000))), MAX_COLS)
}

function projectTimetable(log: LogEvent[], start: Date) {
  const vitals: any[] = []
  const drugs: any[] = []
  const infusions: any[] = []
  const fluids: any[] = []
  const agents: any[] = []
  const clinicalEvents: any[] = []
  const activeInf: Record<string, { startCol: number; ev: LogEvent }> = {}
  const activeFluid: Record<string, { startCol: number; ev: LogEvent }> = {}
  let activeAgent: { name: string; color: string; startCol: number } | null = null
  let maxCol = 0

  const chrono = [...log].sort((a, b) =>
    new Date(a.ts ?? 0).getTime() - new Date(b.ts ?? 0).getTime()
  )

  for (const ev of chrono) {
    const col = colFor(ev, start)
    maxCol = Math.max(maxCol, col)
    if (ev.type === "vital") {
      while (vitals.length <= col) vitals.push({})
      vitals[col] = {
        systolic: ev.systolic,
        diastolic: ev.diastolic,
        heartRate: ev.heartRate,
        spO2: ev.spO2,
        etco2: ev.etco2,
        temp: ev.temp,
      }
    } else if (ev.type === "drug") {
      drugs.push({ colIdx: col, name: ev.name, dose: ev.dose, unit: ev.unit })
    } else if (ev.type === "infusion_start" && ev.infId) {
      activeInf[ev.infId] = { startCol: col, ev }
    } else if (ev.type === "infusion_rate" && ev.infId && activeInf[ev.infId]) {
      activeInf[ev.infId].ev = { ...activeInf[ev.infId].ev, rate: ev.rate }
    } else if (ev.type === "infusion_stop" && ev.infId) {
      const entry = activeInf[ev.infId]
      if (entry) {
        infusions.push({ id: ev.infId, name: entry.ev.name, rate: entry.ev.rate, unit: entry.ev.unit, color: entry.ev.color, startCol: entry.startCol, endCol: col })
        delete activeInf[ev.infId]
      }
    } else if (ev.type === "fluid_start" && ev.fluidId) {
      activeFluid[ev.fluidId] = { startCol: col, ev }
    } else if (ev.type === "fluid_end" && ev.fluidId) {
      const entry = activeFluid[ev.fluidId]
      if (entry) {
        fluids.push({ id: ev.fluidId, name: entry.ev.name, category: "", volume: entry.ev.volume, color: entry.ev.color, startCol: entry.startCol, endCol: col })
        delete activeFluid[ev.fluidId]
      }
    } else if (ev.type === "agent_start" && ev.name) {
      if (activeAgent && activeAgent.name !== ev.name) {
        agents.push({ name: activeAgent.name, color: activeAgent.color, startCol: activeAgent.startCol, endCol: col })
      }
      activeAgent = { name: ev.name, color: ev.color ?? "#a855f7", startCol: col }
    } else if (ev.type === "agent_stop" && activeAgent) {
      agents.push({ name: activeAgent.name, color: activeAgent.color, startCol: activeAgent.startCol, endCol: col })
      activeAgent = null
    } else if ((ev.type === "clinical_event" || ev.type === "event") && (ev as any).label) {
      clinicalEvents.push({ colIdx: col, label: (ev as any).label, color: ev.color ?? "#64748b" })
    }
  }

  const openEnd = maxCol + 1
  for (const [id, { startCol, ev }] of Object.entries(activeInf)) {
    infusions.push({ id, name: ev.name, rate: ev.rate, unit: ev.unit, color: ev.color, startCol, endCol: openEnd })
  }
  for (const [id, { startCol, ev }] of Object.entries(activeFluid)) {
    fluids.push({ id, name: ev.name, category: "", volume: ev.volume, color: ev.color, startCol, endCol: openEnd })
  }
  if (activeAgent) {
    agents.push({ name: activeAgent.name, color: activeAgent.color, startCol: activeAgent.startCol, endCol: openEnd })
  }

  return { vitals, drugs, infusions, fluids, agents, clinicalEvents }
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
  const isHOD   = user.role === "HEAD_OF_DEPT" && existing.user?.institutionId === user.institutionId
  if (existing.userId !== user.id && !isAdmin && !isHOD) {
    return { error: "Forbidden", status: 403 as const }
  }

  return { user, existing }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await authorize(req, id)
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { existing } = auth

  if (existing.status === "COMPLETE") return NextResponse.json({ error: "Case is finalised" }, { status: 403 })

  const event = await req.json()
  const keyEvents = (existing.intraop?.keyEvents as any) ?? {}
  const log: any[] = Array.isArray(keyEvents.log) ? keyEvents.log : []
  log.push(event)
  // Always derive chartStart from first real event timestamp — intraop.startTime is
  // reference-date-encoded (2000-01-01T<HH:MM>Z) and must not be used as a datetime anchor.
  const sorted = [...log].sort((a: any, b: any) => new Date(a.ts ?? 0).getTime() - new Date(b.ts ?? 0).getTime())
  const chartStart = sorted[0]?.ts ? new Date(sorted[0].ts) : new Date()
  const projected = projectTimetable(log, chartStart)

  await prisma.intraoperativeRecord.upsert({
    where:  { caseId: id },
    update: { keyEvents: { ...keyEvents, ...projected, log } },
    create: { caseId: id, startTime: new Date(`2000-01-01T00:00:00.000Z`), keyEvents: { ...projected, log: [event] } },
  })

  if (existing.status === "DRAFT") {
    await prisma.case.update({ where: { id }, data: { status: "IN_PROGRESS" } })
  }

  caseEmitter.emit(id, { type: "event", event })
  return NextResponse.json({ ok: true })
}

// PUT replaces the entire log (used for edit / delete)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await authorize(req, id)
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { existing } = auth

  const { log } = await req.json()
  if (!Array.isArray(log)) return NextResponse.json({ error: "log must be array" }, { status: 400 })

  const keyEvents = (existing.intraop?.keyEvents as any) ?? {}
  // Always derive chartStart from first real event timestamp — intraop.startTime is
  // reference-date-encoded (2000-01-01T<HH:MM>Z) and must not be used as a datetime anchor.
  const sortedLog = [...log].sort((a: any, b: any) => new Date(a.ts ?? 0).getTime() - new Date(b.ts ?? 0).getTime())
  const chartStart = sortedLog[0]?.ts ? new Date(sortedLog[0].ts) : new Date()
  const projected = projectTimetable(log, chartStart)

  await prisma.intraoperativeRecord.update({
    where: { caseId: id },
    data:  { keyEvents: { ...keyEvents, ...projected, log } },
  })

  caseEmitter.emit(id, { type: "log_updated" })
  return NextResponse.json({ ok: true })
}
