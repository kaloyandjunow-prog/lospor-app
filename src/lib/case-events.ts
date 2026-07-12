import { Prisma } from "@/generated/prisma/client"
import { calculateFluidTotals, fluidTotalsPatch } from "@lospor/core/intraop-totals"
import type {
  LogEvent, VitalsEntry, TimetableDrug, TimetableFluid, AgentSegment,
  TimetableInfusion, ClinicalEvent, GasSettingsSegment, LegacyKeyEvents,
} from "@/types/timetable"

// ─────────────────────────────────────────────────────────────────────────────
// Phase E: CaseEvent rows are the source of truth for the intraop chart.
//
// Writes go through here: each add/edit/delete becomes append-only versioned
// rows (nothing is ever hard-deleted — edits supersede, deletes tombstone), then
// the legacy IntraoperativeRecord.keyEvents blob is REBUILT from the live rows as
// a cache. Every existing reader (web/mobile chart, printout, OMOP export) keeps
// reading keyEvents unchanged — only the thing that fills it changed.
// ─────────────────────────────────────────────────────────────────────────────

// Accepts both a transaction client (inside $transaction) and a plain PrismaClient
// so callers that skip transactions for pgbouncer compatibility can pass prisma directly.
type Tx = Prisma.TransactionClient | { caseEvent: Prisma.TransactionClient["caseEvent"]; intraoperativeRecord: Prisma.TransactionClient["intraoperativeRecord"] }

export type { LogEvent }

const INTRAOP_GLUCOSE_LOINC_CODE = "2345-7"
const INTRAOP_GLUCOSE_UNIT_CANON = "mmol/L"

function gasFractions(carrierGas: string | null | undefined, fio2: number | null | undefined) {
  const safeFio2 = carrierGas == null ? 100 : Math.min(100, Math.max(21, Number(fio2 ?? 21)))
  return {
    fio2: safeFio2,
    fiAir: carrierGas === "air" ? 100 - safeFio2 : 0,
    fiN2O: carrierGas === "n2o" ? 100 - safeFio2 : 0,
  }
}

// ─── Projection (moved verbatim from the events route) ───────────────────────
const MAX_COLS = 2016
function colFor(ev: LogEvent, start: Date) {
  const t = ev.ts ? new Date(ev.ts).getTime() : Date.now()
  return Math.min(Math.max(0, Math.floor((t - start.getTime()) / (5 * 60_000))), MAX_COLS)
}

export function projectTimetable(log: LogEvent[], start: Date) {
  const vitals: VitalsEntry[] = []
  const drugs: TimetableDrug[] = []
  const infusions: TimetableInfusion[] = []
  const fluids: TimetableFluid[] = []
  const agents: AgentSegment[] = []
  const clinicalEvents: ClinicalEvent[] = []
  const activeInf: Record<string, { startCol: number; ev: LogEvent; initialRate?: string; rateChanges: { col: number; rate?: string; unit?: string; concentration?: string }[] }> = {}
  const activeFluid: Record<string, { startCol: number; ev: LogEvent }> = {}
  let activeAgent: { name: string; color: string; startCol: number; percent?: number } | null = null
  const gasSettings: GasSettingsSegment[] = []
  let activeGas: { startCol: number; fgf: number; carrierGas: string | null; fio2: number; fiAir: number; fiN2O: number; settingsChanges: { col: number; fgf: number; carrierGas: string | null; fio2: number; fiAir: number; fiN2O: number }[] } | null = null
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
        bgl: ev.bgl,
      }
    } else if (ev.type === "drug") {
      // Coded identity (drugId/atcCode/inn) survives into the projection now —
      // previously only the raw CaseEvent row kept it (via metadataJson),
      // while the chart/cache/export path saw just a free-text name.
      drugs.push({ colIdx: col, name: ev.name ?? "", dose: ev.dose ?? "", unit: ev.unit ?? "", drugId: ev.drugId, atcCode: ev.atcCode, inn: ev.inn, route: ev.drugRoute })
    } else if (ev.type === "infusion_start" && ev.infId) {
      // Track the initial rate and each subsequent rate change as segments so the
      // bar/pill can show the correct rate at any column (matches the mobile
      // local projection). Without this the chart only ever sees one rate.
      activeInf[ev.infId] = { startCol: col, ev, initialRate: ev.rate, rateChanges: [] }
    } else if (ev.type === "infusion_rate" && ev.infId && activeInf[ev.infId]) {
      const entry = activeInf[ev.infId]
      entry.rateChanges.push({ col, rate: ev.rate, unit: ev.unit ?? entry.ev.unit, concentration: ev.concentration })
      entry.ev = { ...entry.ev, rate: ev.rate }
    } else if (ev.type === "infusion_stop" && ev.infId) {
      const entry = activeInf[ev.infId]
      if (entry) {
        // Base rate is the INITIAL rate (so cells before the first change show it);
        // rateChanges carry the later segments.
        infusions.push({ id: ev.infId, name: entry.ev.name ?? "", rate: Number(entry.initialRate ?? 0), unit: entry.ev.unit ?? "", color: entry.ev.color ?? "#8b5cf6", startCol: entry.startCol, endCol: col, concentration: entry.ev.concentration, route: entry.ev.drugRoute, drugId: entry.ev.drugId, atcCode: entry.ev.atcCode, inn: entry.ev.inn, rateChanges: entry.rateChanges.length ? entry.rateChanges.map(rc => ({ col: rc.col, rate: Number(rc.rate ?? 0), unit: rc.unit ?? "", concentration: rc.concentration })) : undefined })
        delete activeInf[ev.infId]
      }
    } else if (ev.type === "fluid_start" && ev.fluidId) {
      activeFluid[ev.fluidId] = { startCol: col, ev }
    } else if (ev.type === "fluid_end" && ev.fluidId) {
      const entry = activeFluid[ev.fluidId]
      if (entry) {
        fluids.push({ id: ev.fluidId, name: entry.ev.name ?? "", category: entry.ev.category ?? "", volume: entry.ev.volume ?? "", color: entry.ev.color ?? "#06b6d4", startCol: entry.startCol, endCol: col })
        delete activeFluid[ev.fluidId]
      }
    } else if (ev.type === "agent_start" && ev.name) {
      if (activeAgent && activeAgent.name !== ev.name) {
        agents.push({ name: activeAgent.name, color: activeAgent.color, startCol: activeAgent.startCol, endCol: col, percent: activeAgent.percent })
      }
      activeAgent = { name: ev.name, color: ev.color ?? "#a855f7", startCol: col, percent: ev.value != null ? Number(ev.value) : undefined }
    } else if (ev.type === "agent_stop" && activeAgent) {
      agents.push({ name: activeAgent.name, color: activeAgent.color, startCol: activeAgent.startCol, endCol: col, percent: activeAgent.percent })
      activeAgent = null
    } else if (ev.type === "gas_start") {
      if (activeGas) gasSettings.push({ id: `gas-${activeGas.startCol}`, startCol: activeGas.startCol, endCol: col, fgf: activeGas.fgf, carrierGas: activeGas.carrierGas, fio2: activeGas.fio2, fiAir: activeGas.fiAir, fiN2O: activeGas.fiN2O, settingsChanges: activeGas.settingsChanges.length ? activeGas.settingsChanges : undefined })
      const fractions = gasFractions(ev.carrierGas, ev.fio2)
      activeGas = { startCol: col, fgf: ev.fgf ?? 0, carrierGas: ev.carrierGas ?? null, fio2: fractions.fio2, fiAir: fractions.fiAir, fiN2O: fractions.fiN2O, settingsChanges: [] }
    } else if (ev.type === "gas_change" && activeGas) {
      const carrierGas = ev.carrierGas ?? activeGas.carrierGas
      const fractions = gasFractions(carrierGas, ev.fio2 ?? activeGas.fio2)
      activeGas.settingsChanges.push({ col, fgf: ev.fgf ?? activeGas.fgf, carrierGas, fio2: fractions.fio2, fiAir: fractions.fiAir, fiN2O: fractions.fiN2O })
    } else if (ev.type === "gas_stop" && activeGas) {
      gasSettings.push({ id: `gas-${activeGas.startCol}`, startCol: activeGas.startCol, endCol: col, fgf: activeGas.fgf, carrierGas: activeGas.carrierGas, fio2: activeGas.fio2, fiAir: activeGas.fiAir, fiN2O: activeGas.fiN2O, settingsChanges: activeGas.settingsChanges.length ? activeGas.settingsChanges : undefined })
      activeGas = null
    } else if ((ev.type === "clinical_event" || ev.type === "event") && ev.label) {
      clinicalEvents.push({ colIdx: col, label: ev.label, color: ev.color ?? "#64748b" })
    }
  }

  const openEnd = maxCol + 1
  for (const [id, { startCol, ev, initialRate, rateChanges }] of Object.entries(activeInf)) {
    infusions.push({ id, name: ev.name ?? "", rate: Number(initialRate ?? 0), unit: ev.unit ?? "", color: ev.color ?? "#8b5cf6", startCol, endCol: openEnd, concentration: ev.concentration, route: ev.drugRoute, drugId: ev.drugId, atcCode: ev.atcCode, inn: ev.inn, rateChanges: rateChanges.length ? rateChanges.map(rc => ({ col: rc.col, rate: Number(rc.rate ?? 0), unit: rc.unit ?? "", concentration: rc.concentration })) : undefined })
  }
  for (const [id, { startCol, ev }] of Object.entries(activeFluid)) {
    fluids.push({ id, name: ev.name ?? "", category: ev.category ?? "", volume: ev.volume ?? "", color: ev.color ?? "#06b6d4", startCol, endCol: openEnd })
  }
  if (activeAgent) {
    agents.push({ name: activeAgent.name, color: activeAgent.color, startCol: activeAgent.startCol, endCol: openEnd, percent: activeAgent.percent })
  }
  if (activeGas) {
    gasSettings.push({ id: `gas-${activeGas.startCol}`, startCol: activeGas.startCol, endCol: openEnd, fgf: activeGas.fgf, carrierGas: activeGas.carrierGas, fio2: activeGas.fio2, fiAir: activeGas.fiAir, fiN2O: activeGas.fiN2O, settingsChanges: activeGas.settingsChanges.length ? activeGas.settingsChanges : undefined })
  }

  return { vitals, drugs, infusions, fluids, agents, gasSettings, clinicalEvents }
}


// ─── Helpers ─────────────────────────────────────────────────────────────────
function chartStartFrom(log: LogEvent[]): Date {
  const sorted = [...log].sort((a, b) => new Date(a.ts ?? 0).getTime() - new Date(b.ts ?? 0).getTime())
  return sorted[0]?.ts ? new Date(sorted[0].ts) : new Date()
}

// Stable, order-independent comparison so a resend of an unchanged event is a
// no-op (idempotent) while a genuine edit is detected as different.
function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable)
  if (v && typeof v === "object") {
    return Object.keys(v).sort().reduce((acc, k) => { acc[k] = stable((v as Record<string, unknown>)[k]); return acc }, {} as Record<string, unknown>)
  }
  return v
}
function sameContent(a: Record<string, unknown> | null | undefined, b: Record<string, unknown> | null | undefined): boolean {
  const sa: Record<string, unknown> = { ...(a ?? {}) }; const sb: Record<string, unknown> = { ...(b ?? {}) }
  delete sa.syncStatus; delete sb.syncStatus
  return JSON.stringify(stable(sa)) === JSON.stringify(stable(sb))
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
  const primary = ev.dose ?? ev.value ?? ev.rate ?? ev.volume
  // Typed vital columns (only for vital events) so vitals are queryable as columns.
  const isVital = ev.type === "vital"
  const isGas = ev.type === "gas_start" || ev.type === "gas_change"
  const isAgent = ev.type === "agent_start"
  const isClinicalEvent = ev.type === "clinical_event" || ev.type === "event"
  const numI = (v: unknown) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Math.round(Number(v)))
  const numF = (v: unknown) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v))
  const bgl = isVital ? numF(ev.bgl) : null
  const gas = isGas ? gasFractions(ev.carrierGas, ev.fio2) : null
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
    bgl,
    bglLoincCode:   bgl != null ? INTRAOP_GLUCOSE_LOINC_CODE : null,
    bglUnitCanon:   bgl != null ? INTRAOP_GLUCOSE_UNIT_CANON : null,
    fgfLitersPerMin: isGas ? numF(ev.fgf) : null,
    carrierGas:      isGas ? ev.carrierGas ?? null : null,
    fio2Percent:     gas?.fio2 ?? null,
    fiAirPercent:    gas?.fiAir ?? null,
    fiN2OPercent:    gas?.fiN2O ?? null,
    metadataJson:   ev as object,
    source,
    sourceVersion:   "case-events-v1",
    schemaVersion:   "3.0.0",
    idempotencyKey,
    atcCode:        ev.atcCode ?? null,
    drugId:         ev.drugId ?? null,
    inn:            ev.inn ?? null,
    drugRoute:      ev.drugRoute ?? null,
    infId:          ev.infId ?? null,
    fluidId:        ev.fluidId ?? null,
    rate:           ev.rate != null ? String(ev.rate) : null,
    concentration:  ev.concentration ?? null,
    volume:         ev.volume != null ? String(ev.volume) : null,
    fluidCategory:  ev.category ?? null,
    agentPercent:   isAgent ? numF(ev.value) : null,
    clinicalEventCode: isClinicalEvent ? ev.value ?? null : null,
  }
}

// Reconstruct a log from the legacy projected arrays when a case has a
// keyEvents blob but no `log` (a case whose intraop data predates this app's
// event-sourced write path). Synthetic timestamps preserve the column layout
// so the rebuilt chart matches; `baseMs` should be the case's actual start
// (real calendar day + time-of-day), not an arbitrary epoch, so these rows
// remain chronologically meaningful for audit/sorting once mixed in with
// real-timestamped events.
export function reverseProject(keyEvents: LegacyKeyEvents, baseMs: number): LogEvent[] {
  const tsFor = (col: number) => new Date(baseMs + (col ?? 0) * 5 * 60_000).toISOString()
  const out: LogEvent[] = []
  let i = 0
  const mk = (o: Partial<LogEvent>): LogEvent => ({ id: `seed-${i++}`, ...o })

  const vitals = Array.isArray(keyEvents.vitals) ? keyEvents.vitals : []
  vitals.forEach((v, col) => {
    if (v && Object.values(v).some(x => x != null)) out.push(mk({ type: "vital", ts: tsFor(col), ...v }))
  })
  for (const d of (Array.isArray(keyEvents.drugs) ? keyEvents.drugs : [])) {
    out.push(mk({ type: "drug", ts: tsFor(d.colIdx ?? 0), name: d.name, dose: d.dose, unit: d.unit, drugId: d.drugId, atcCode: d.atcCode, inn: d.inn, drugRoute: d.route }))
  }
  for (const c of (Array.isArray(keyEvents.clinicalEvents) ? keyEvents.clinicalEvents : [])) {
    out.push(mk({ type: "clinical_event", ts: tsFor(c.colIdx ?? 0), label: c.label, color: c.color }))
  }
  for (const inf of (Array.isArray(keyEvents.infusions) ? keyEvents.infusions : [])) {
    const infId = inf.id ?? `inf-${i}`
    out.push(mk({ type: "infusion_start", ts: tsFor(inf.startCol ?? 0), infId, name: inf.name, unit: inf.unit, rate: String(inf.rate ?? ""), color: inf.color, concentration: inf.concentration, drugRoute: inf.route, drugId: inf.drugId, atcCode: inf.atcCode, inn: inf.inn }))
    for (const change of inf.rateChanges ?? []) {
      out.push(mk({ type: "infusion_rate", ts: tsFor(change.col ?? inf.startCol ?? 0), infId, rate: String(change.rate ?? ""), unit: change.unit, concentration: change.concentration }))
    }
    if (inf.stopped) out.push(mk({ type: "infusion_stop", ts: tsFor(inf.endCol ?? inf.startCol ?? 0), infId }))
  }
  for (const f of (Array.isArray(keyEvents.fluids) ? keyEvents.fluids : [])) {
    const fluidId = f.id ?? `fl-${i}`
    out.push(mk({ type: "fluid_start", ts: tsFor(f.startCol ?? 0), fluidId, name: f.name, category: f.category, volume: f.volume, color: f.color }))
    if (f.stopped) out.push(mk({ type: "fluid_end", ts: tsFor(f.endCol ?? f.startCol ?? 0), fluidId }))
  }
  for (const a of (Array.isArray(keyEvents.agents) ? keyEvents.agents : [])) {
    out.push(mk({ type: "agent_start", ts: tsFor(a.startCol ?? 0), name: a.name, color: a.color, value: a.percent != null ? String(a.percent) : undefined }))
    if (a.stopped) out.push(mk({ type: "agent_stop", ts: tsFor(a.endCol ?? a.startCol ?? 0), name: a.name }))
  }
  for (const gas of (Array.isArray(keyEvents.gasSettings) ? keyEvents.gasSettings : [])) {
    const startFractions = gasFractions(gas.carrierGas, gas.fio2)
    out.push(mk({ type: "gas_start", ts: tsFor(gas.startCol ?? 0), fgf: gas.fgf, carrierGas: gas.carrierGas, fio2: startFractions.fio2, fiAir: startFractions.fiAir, fiN2O: startFractions.fiN2O }))
    for (const change of gas.settingsChanges ?? []) {
      const changeFractions = gasFractions(change.carrierGas, change.fio2)
      out.push(mk({ type: "gas_change", ts: tsFor(change.col ?? gas.startCol ?? 0), fgf: change.fgf, carrierGas: change.carrierGas, fio2: changeFractions.fio2, fiAir: changeFractions.fiAir, fiN2O: changeFractions.fiN2O }))
    }
    if (gas.stopped) out.push(mk({ type: "gas_stop", ts: tsFor(gas.endCol ?? gas.startCol ?? 0) }))
  }
  return out
}

// If a case has no CaseEvent rows yet (its intraop data predates the
// event-sourced write path), seed them from its existing keyEvents (log if
// present, else reverse-projected from the legacy column-indexed arrays) so
// the rebuild has a complete picture and nothing is lost on the first write.
export async function ensureBackfilled(tx: Tx, caseId: string): Promise<void> {
  const count = await tx.caseEvent.count({ where: { caseId } })
  if (count > 0) return

  const intra = await tx.intraoperativeRecord.findUnique({ where: { caseId }, select: { keyEvents: true, startTime: true, createdAt: true } })
  const keyEvents = (intra?.keyEvents as LegacyKeyEvents | null) ?? {}
  let log: LogEvent[] = Array.isArray(keyEvents.log) ? keyEvents.log : []
  if (log.length === 0) {
    // The legacy format only ever stored a 5-minute column index, never a
    // real timestamp. Anchor reconstructed timestamps to the case's actual
    // day (when the intraop record was created) combined with startTime's
    // time-of-day — startTime itself is stored with a fixed dummy date by
    // this schema's time-only convention, so only its hours/minutes are real.
    const day = intra?.createdAt ?? new Date()
    const dayStartMs = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate())
    const timeOfDayMs = intra?.startTime
      ? (intra.startTime.getUTCHours() * 3600 + intra.startTime.getUTCMinutes() * 60) * 1000
      : 0
    log = reverseProject(keyEvents, dayStartMs + timeOfDayMs)
  }

  for (const ev of log) {
    if (!ev?.id) continue
    // "backfill", not inferSource(ev.id) — these rows were never actually
    // submitted by either app, so attributing them to "mobile" by default
    // (inferSource's fallback) would be misleading for audit purposes.
    await tx.caseEvent.create({
      data: buildRow(caseId, null, ev, 1, "active", `${caseId}:${ev.id}`, "backfill"),
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
  const active = new Map<string, { id: string; metadataJson: LogEvent }>()
  const maxVer = new Map<string, number>()
  for (const r of rows) {
    if (!maxVer.has(r.logicalId)) maxVer.set(r.logicalId, r.version)
    if (r.status === "active" && !active.has(r.logicalId)) active.set(r.logicalId, { id: r.id, metadataJson: r.metadataJson as LogEvent })
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
/**
 * Deterministic projection ordering: timestamp, then version, then logicalId.
 * Exported for tests — the projection (chart, protocol PDF, OMOP export) must
 * be identical across rebuilds regardless of DB row return order.
 */
export function sortLogDeterministic<T extends { version: number; logicalId: string; ev: LogEvent }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    const tsDiff = new Date(a.ev.ts ?? 0).getTime() - new Date(b.ev.ts ?? 0).getTime()
    if (tsDiff !== 0) return tsDiff
    if (a.version !== b.version) return a.version - b.version
    return a.logicalId < b.logicalId ? -1 : a.logicalId > b.logicalId ? 1 : 0
  })
}

export async function rebuildProjection(tx: Tx, caseId: string): Promise<void> {
  const rows = await tx.caseEvent.findMany({
    where:   { caseId, status: "active" },
    select:  { logicalId: true, version: true, metadataJson: true },
  })
  // At most one active row per logicalId by construction; keep the latest just in case.
  const byLogical = new Map<string, { version: number; logicalId: string; ev: LogEvent }>()
  for (const r of rows) {
    const prev = byLogical.get(r.logicalId)
    if (!prev || r.version > prev.version) byLogical.set(r.logicalId, { version: r.version, logicalId: r.logicalId, ev: r.metadataJson as LogEvent })
  }
  // Deterministic order: ts, then version, then logicalId. findMany has no
  // orderBy, so without the tie-breaks equal-ts events (e.g. two writers of
  // the same vitals column) would land in DB return order and the projected
  // value could flip between rebuilds.
  const log = sortLogDeterministic([...byLogical.values()]).map(x => x.ev)

  const start = chartStartFrom(log)
  const projected = projectTimetable(log, start)

  // The projected shape is a real, JSON-serializable plain object — optional
  // fields just don't structurally match Prisma's InputJsonValue (which
  // disallows `undefined`), hence the cast rather than a real mismatch.
  const keyEvents = { ...projected, log } as unknown as Prisma.InputJsonValue
  // Fluid totals are derived from the fluid events, so they are computed here
  // (the single source of truth) rather than PATCHed separately by each client
  // — the case-PATCH mapper no longer accepts them. Same core function both
  // apps used, so values are identical to before, just server-authoritative.
  const fluidTotals = fluidTotalsPatch(calculateFluidTotals(projected.fluids))
  await tx.intraoperativeRecord.upsert({
    where:  { caseId },
    update: { keyEvents, ...fluidTotals },
    create: { caseId, startTime: new Date("2000-01-01T00:00:00.000Z"), keyEvents, ...fluidTotals },
  })
}
