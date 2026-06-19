import { Prisma } from "@/generated/prisma/client"

// ─────────────────────────────────────────────────────────────────────────────
// Phase E: CaseEvent rows are the source of truth for the intraop chart.
//
// Writes go through here: each add/edit/delete becomes append-only versioned
// rows (nothing is ever hard-deleted — edits supersede, deletes tombstone), then
// the legacy IntraoperativeRecord.keyEvents blob is REBUILT from the live rows as
// a cache. Every existing reader (web/mobile chart, printout, OMOP export) keeps
// reading keyEvents unchanged — only the thing that fills it changed.
// ─────────────────────────────────────────────────────────────────────────────

type Tx = Prisma.TransactionClient

export type LogEvent = {
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
  label?: string
  value?: string
  atcCode?: string
  drugId?: string
  drugRoute?: string
}

// ─── Projection (moved verbatim from the events route) ───────────────────────
const MAX_COLS = 2016
function colFor(ev: LogEvent, start: Date) {
  const t = ev.ts ? new Date(ev.ts).getTime() : Date.now()
  return Math.min(Math.max(0, Math.floor((t - start.getTime()) / (5 * 60_000))), MAX_COLS)
}

export function projectTimetable(log: LogEvent[], start: Date) {
  const vitals: any[] = []
  const drugs: any[] = []
  const infusions: any[] = []
  const fluids: any[] = []
  const agents: any[] = []
  const clinicalEvents: any[] = []
  const activeInf: Record<string, { startCol: number; ev: LogEvent; initialRate?: string; rateChanges: { col: number; rate?: string; unit?: string }[] }> = {}
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
      // Track the initial rate and each subsequent rate change as segments so the
      // bar/pill can show the correct rate at any column (matches the mobile
      // local projection). Without this the chart only ever sees one rate.
      activeInf[ev.infId] = { startCol: col, ev, initialRate: ev.rate, rateChanges: [] }
    } else if (ev.type === "infusion_rate" && ev.infId && activeInf[ev.infId]) {
      const entry = activeInf[ev.infId]
      entry.rateChanges.push({ col, rate: ev.rate, unit: ev.unit ?? entry.ev.unit })
      entry.ev = { ...entry.ev, rate: ev.rate }
    } else if (ev.type === "infusion_stop" && ev.infId) {
      const entry = activeInf[ev.infId]
      if (entry) {
        // Base rate is the INITIAL rate (so cells before the first change show it);
        // rateChanges carry the later segments.
        infusions.push({ id: ev.infId, name: entry.ev.name, rate: entry.initialRate, unit: entry.ev.unit, color: entry.ev.color, startCol: entry.startCol, endCol: col, rateChanges: entry.rateChanges.length ? entry.rateChanges : undefined })
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
  for (const [id, { startCol, ev, initialRate, rateChanges }] of Object.entries(activeInf)) {
    infusions.push({ id, name: ev.name, rate: initialRate, unit: ev.unit, color: ev.color, startCol, endCol: openEnd, rateChanges: rateChanges.length ? rateChanges : undefined })
  }
  for (const [id, { startCol, ev }] of Object.entries(activeFluid)) {
    fluids.push({ id, name: ev.name, category: "", volume: ev.volume, color: ev.color, startCol, endCol: openEnd })
  }
  if (activeAgent) {
    agents.push({ name: activeAgent.name, color: activeAgent.color, startCol: activeAgent.startCol, endCol: openEnd })
  }

  return { vitals, drugs, infusions, fluids, agents, clinicalEvents }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function chartStartFrom(log: LogEvent[]): Date {
  const sorted = [...log].sort((a, b) => new Date(a.ts ?? 0).getTime() - new Date(b.ts ?? 0).getTime())
  return sorted[0]?.ts ? new Date(sorted[0].ts) : new Date()
}

// Stable, order-independent comparison so a resend of an unchanged event is a
// no-op (idempotent) while a genuine edit is detected as different.
function stable(v: any): any {
  if (Array.isArray(v)) return v.map(stable)
  if (v && typeof v === "object") {
    return Object.keys(v).sort().reduce((acc, k) => { acc[k] = stable(v[k]); return acc }, {} as any)
  }
  return v
}
function sameContent(a: any, b: any): boolean {
  const sa = { ...(a ?? {}) }; const sb = { ...(b ?? {}) }
  delete (sa as any).syncStatus; delete (sb as any).syncStatus
  return JSON.stringify(stable(sa)) === JSON.stringify(stable(sb))
}

function inferSource(id: unknown): string {
  return typeof id === "string" && id.startsWith("web-") ? "web" : "mobile"
}

function buildRow(
  caseId: string,
  userId: string | null,
  ev: LogEvent,
  version: number,
  status: string,
  idempotencyKey: string,
  source: string,
) {
  const primary = ev.dose ?? (ev as any).value ?? ev.rate ?? ev.volume
  // Typed vital columns (only for vital events) so vitals are queryable as columns.
  const isVital = ev.type === "vital"
  const numI = (v: unknown) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Math.round(Number(v)))
  const numF = (v: unknown) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v))
  return {
    caseId,
    userId,
    logicalId:      ev.id ?? idempotencyKey,
    version,
    status,
    type:           ev.type ?? "unknown",
    timestamp:      ev.ts && !Number.isNaN(new Date(ev.ts).getTime()) ? new Date(ev.ts) : new Date(),
    label:          (ev.label ?? ev.name ?? null) as string | null,
    value:          primary != null ? String(primary) : null,
    unit:           ev.unit ?? null,
    systolic:       isVital ? numI(ev.systolic)  : null,
    diastolic:      isVital ? numI(ev.diastolic) : null,
    heartRate:      isVital ? numI(ev.heartRate) : null,
    spO2:           isVital ? numF(ev.spO2)      : null,
    etco2:          isVital ? numF(ev.etco2)     : null,
    temp:           isVital ? numF(ev.temp)      : null,
    metadataJson:   ev as object,
    source,
    idempotencyKey,
    atcCode:        ev.atcCode ?? null,
    drugId:         ev.drugId ?? null,
    drugRoute:      ev.drugRoute ?? null,
  }
}

// Reconstruct a log from the legacy projected arrays when a case has a keyEvents
// blob but no `log` (e.g. a freshly seeded demo). Synthetic timestamps preserve
// the column layout so the rebuilt chart matches.
function reverseProject(keyEvents: any): LogEvent[] {
  const base = new Date("2000-01-01T00:00:00.000Z").getTime()
  const tsFor = (col: number) => new Date(base + (col ?? 0) * 5 * 60_000).toISOString()
  const out: LogEvent[] = []
  let i = 0
  const mk = (o: any): LogEvent => ({ id: `seed-${i++}`, ...o })

  const vitals = Array.isArray(keyEvents.vitals) ? keyEvents.vitals : []
  vitals.forEach((v: any, col: number) => {
    if (v && Object.values(v).some(x => x != null)) out.push(mk({ type: "vital", ts: tsFor(col), ...v }))
  })
  for (const d of (Array.isArray(keyEvents.drugs) ? keyEvents.drugs : [])) {
    out.push(mk({ type: "drug", ts: tsFor(d.colIdx ?? 0), name: d.name, dose: d.dose, unit: d.unit }))
  }
  for (const c of (Array.isArray(keyEvents.clinicalEvents) ? keyEvents.clinicalEvents : [])) {
    out.push(mk({ type: "clinical_event", ts: tsFor(c.colIdx ?? 0), label: c.label, color: c.color }))
  }
  for (const inf of (Array.isArray(keyEvents.infusions) ? keyEvents.infusions : [])) {
    const infId = inf.id ?? `inf-${i}`
    out.push(mk({ type: "infusion_start", ts: tsFor(inf.startCol ?? 0), infId, name: inf.name, unit: inf.unit, color: inf.color }))
    if (inf.rate != null) out.push(mk({ type: "infusion_rate", ts: tsFor(inf.startCol ?? 0), infId, rate: inf.rate }))
    out.push(mk({ type: "infusion_stop", ts: tsFor(inf.endCol ?? inf.startCol ?? 0), infId }))
  }
  for (const f of (Array.isArray(keyEvents.fluids) ? keyEvents.fluids : [])) {
    const fluidId = f.id ?? `fl-${i}`
    out.push(mk({ type: "fluid_start", ts: tsFor(f.startCol ?? 0), fluidId, name: f.name, volume: f.volume, color: f.color }))
    out.push(mk({ type: "fluid_end", ts: tsFor(f.endCol ?? f.startCol ?? 0), fluidId }))
  }
  for (const a of (Array.isArray(keyEvents.agents) ? keyEvents.agents : [])) {
    out.push(mk({ type: "agent_start", ts: tsFor(a.startCol ?? 0), name: a.name, color: a.color }))
    out.push(mk({ type: "agent_stop", ts: tsFor(a.endCol ?? a.startCol ?? 0), name: a.name }))
  }
  return out
}

// If a case has no CaseEvent rows yet (legacy/demo), seed them from its existing
// keyEvents (log if present, else reverse-projected from the arrays) so the
// rebuild has a complete picture and nothing is lost on the first write.
export async function ensureBackfilled(tx: Tx, caseId: string): Promise<void> {
  const count = await tx.caseEvent.count({ where: { caseId } })
  if (count > 0) return

  const intra = await tx.intraoperativeRecord.findUnique({ where: { caseId }, select: { keyEvents: true } })
  const keyEvents = (intra?.keyEvents as any) ?? {}
  let log: LogEvent[] = Array.isArray(keyEvents.log) ? keyEvents.log : []
  if (log.length === 0) log = reverseProject(keyEvents)

  for (const ev of log) {
    if (!ev?.id) continue
    await tx.caseEvent.create({
      data: buildRow(caseId, null, ev, 1, "active", `${caseId}:${ev.id}`, inferSource(ev.id)),
    })
  }
}

// Map of logicalId → { active row (or null), max version seen }.
async function indexRows(tx: Tx, caseId: string) {
  const rows = await tx.caseEvent.findMany({
    where:   { caseId },
    orderBy: { version: "desc" },
    select:  { id: true, logicalId: true, version: true, status: true, metadataJson: true },
  })
  const active = new Map<string, { id: string; metadataJson: any }>()
  const maxVer = new Map<string, number>()
  for (const r of rows) {
    if (!maxVer.has(r.logicalId)) maxVer.set(r.logicalId, r.version)
    if (r.status === "active" && !active.has(r.logicalId)) active.set(r.logicalId, { id: r.id, metadataJson: r.metadataJson })
  }
  return { active, maxVer }
}

// Add a single event. Returns true if a new active row was written, false if it
// was a no-op duplicate (idempotent retry).
export async function addEvent(tx: Tx, caseId: string, userId: string, ev: LogEvent, source: string): Promise<boolean> {
  await ensureBackfilled(tx, caseId)
  const logicalId = ev.id!
  const { active, maxVer } = await indexRows(tx, caseId)
  const cur = active.get(logicalId)

  if (cur) {
    if (sameContent(cur.metadataJson, ev)) return false      // idempotent retry
    await tx.caseEvent.update({ where: { id: cur.id }, data: { status: "superseded" } })
    const version = (maxVer.get(logicalId) ?? 1) + 1
    await tx.caseEvent.create({ data: buildRow(caseId, userId, ev, version, "active", `${caseId}:${logicalId}:v${version}`, source) })
    return true
  }

  const prev = maxVer.get(logicalId)
  const version = prev ? prev + 1 : 1
  const key = version === 1 ? `${caseId}:${logicalId}` : `${caseId}:${logicalId}:v${version}`
  await tx.caseEvent.create({ data: buildRow(caseId, userId, ev, version, "active", key, source) })
  return true
}

// Reconcile the full client log into append-only rows: new ids inserted, changed
// content superseded, ids missing from the incoming log tombstoned.
export async function reconcileFullLog(tx: Tx, caseId: string, userId: string, incoming: LogEvent[], source: string): Promise<void> {
  await ensureBackfilled(tx, caseId)
  const incomingById = new Map<string, LogEvent>()
  for (const ev of incoming) if (ev.id) incomingById.set(ev.id, ev)

  const { active, maxVer } = await indexRows(tx, caseId)

  for (const [logicalId, ev] of incomingById) {
    const cur = active.get(logicalId)
    if (cur) {
      if (sameContent(cur.metadataJson, ev)) continue
      await tx.caseEvent.update({ where: { id: cur.id }, data: { status: "superseded" } })
      const version = (maxVer.get(logicalId) ?? 1) + 1
      await tx.caseEvent.create({ data: buildRow(caseId, userId, ev, version, "active", `${caseId}:${logicalId}:v${version}`, source) })
    } else {
      const prev = maxVer.get(logicalId)
      const version = prev ? prev + 1 : 1
      const key = version === 1 ? `${caseId}:${logicalId}` : `${caseId}:${logicalId}:v${version}`
      await tx.caseEvent.create({ data: buildRow(caseId, userId, ev, version, "active", key, source) })
    }
  }

  // Tombstone any active row whose logicalId is no longer in the client log.
  for (const [logicalId, cur] of active) {
    if (!incomingById.has(logicalId)) {
      await tx.caseEvent.update({ where: { id: cur.id }, data: { status: "deleted" } })
    }
  }
}

// Rebuild the keyEvents cache from the live (active) rows. This is what the
// chart, printout and exports read.
export async function rebuildProjection(tx: Tx, caseId: string): Promise<void> {
  const rows = await tx.caseEvent.findMany({
    where:   { caseId, status: "active" },
    select:  { logicalId: true, version: true, metadataJson: true },
  })
  // At most one active row per logicalId by construction; keep the latest just in case.
  const byLogical = new Map<string, { version: number; ev: LogEvent }>()
  for (const r of rows) {
    const prev = byLogical.get(r.logicalId)
    if (!prev || r.version > prev.version) byLogical.set(r.logicalId, { version: r.version, ev: r.metadataJson as LogEvent })
  }
  const log = [...byLogical.values()].map(x => x.ev)
    .sort((a, b) => new Date(a.ts ?? 0).getTime() - new Date(b.ts ?? 0).getTime())

  const start = chartStartFrom(log)
  const projected = projectTimetable(log, start)

  await tx.intraoperativeRecord.upsert({
    where:  { caseId },
    update: { keyEvents: { ...projected, log } },
    create: { caseId, startTime: new Date("2000-01-01T00:00:00.000Z"), keyEvents: { ...projected, log } },
  })
}
