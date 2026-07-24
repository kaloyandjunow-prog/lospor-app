import { Prisma } from "@/generated/prisma/client"
import { calculateFluidTotals, fluidTotalsPatch } from "@lospor/core/intraop-totals"
import { projectIntraopEvents, reverseProjectIntraop } from "@lospor/core/intraop-engine"
import { parseLogEvents, type LegacyKeyEvents as CoreLegacyKeyEvents } from "@lospor/core/intraop-types"
import type {
  LogEvent,
  LegacyKeyEvents,
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
export function projectTimetable(log: LogEvent[], start: Date) {
  const parsed = parseLogEvents(log.map((event, index) => ({
    ...event,
    id: event.id ?? `legacy-${index}`,
  })))
  return projectIntraopEvents(parsed, { start })
}


/**
 * What the chart origin can be derived from.
 *
 * `startedAt` is a true instant and is used directly. `startTime` is the legacy
 * bare wall clock, kept only so records written before the change still draw.
 */
export type ChartAnchorSource = {
  startedAt?: Date | null
  startTime: Date | null
  createdAt: Date
}

/**
 * The moment column 0 of the chart represents.
 *
 * This is the clinician's entered start time — the induction time — anchored to
 * the day the case actually happened. It is NOT when they first got a hand free
 * to chart: in a real theatre nobody documents at the moment of induction, so a
 * case begun at 08:00 and first charted at 08:25 must still start its chart at
 * 08:00.
 *
 * `startTime` is stored with a fixed dummy date (2000-01-01) under this schema's
 * time-only convention, so only its hours/minutes are meaningful and they have
 * to be recombined with the case's real day.
 *
 * Returns null when no start time was recorded — callers then fall back to the
 * earliest event, which is the best guess available.
 */
export function chartAnchorFor(intraop: ChartAnchorSource | null): Date | null {
  // A real instant needs no reconstruction — it is already the moment column 0
  // represents, on the same clock as the events it brackets.
  if (intraop?.startedAt) return intraop.startedAt

  // Legacy rows only. `startTime` is a bare wall clock with no zone recorded,
  // so the best that can be done is to read it as UTC against the case's UTC
  // day. That is wrong by exactly the clinician's offset — three hours in
  // Bulgaria in summer — which is why `resolveChartStart` sanity-checks the
  // result against the events rather than trusting it.
  if (!intraop?.startTime) return null
  const day = intraop.createdAt ?? new Date()
  const dayStartMs = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate())
  const timeOfDayMs = (intraop.startTime.getUTCHours() * 3600 + intraop.startTime.getUTCMinutes() * 60) * 1000
  return new Date(dayStartMs + timeOfDayMs)
}

/** Fallback origin: the earliest event we have. Only used when no start time exists. */
function chartStartFrom(log: LogEvent[]): Date {
  const sorted = [...log].sort((a, b) => new Date(a.ts ?? 0).getTime() - new Date(b.ts ?? 0).getTime())
  return sorted[0]?.ts ? new Date(sorted[0].ts) : new Date()
}

/**
 * A chart must contain its own events. If the earliest event predates the
 * entered start time by more than this, the two cannot be reconciled — the
 * record's timestamps are not on the same footing as its start time — and the
 * events win.
 *
 * This is not hypothetical: some legacy records carry event timestamps on the
 * dummy 2000-01-01 reference date. Anchoring those to the real day would push
 * every event before column 0, where `colFor` clamps them — collapsing an
 * entire operation into a single column. Falling back leaves such a chart
 * exactly as it reads today instead of destroying it.
 *
 * A small tolerance is allowed for genuine retrospective entry just before
 * induction.
 */
const PRE_START_TOLERANCE_MS = 60 * 60_000

/**
 * How long after the entered start time charting may plausibly begin. Nobody
 * documents at the moment of induction, but they do not wait half a day either
 * — a larger gap means the start time and the event timestamps are not on the
 * same clock, which older records genuinely are not (they were written with a
 * different encoding). Trusting the anchor there would stretch a one-hour case
 * into a twenty-one-hour chart.
 */
const LATE_START_TOLERANCE_MS = 12 * 60 * 60_000

export function resolveChartStart(
  intraop: ChartAnchorSource | null,
  log: LogEvent[],
): Date {
  const anchor = chartAnchorFor(intraop)
  if (!anchor) return chartStartFrom(log)
  if (log.length === 0) return anchor

  // A real instant is authoritative full stop. It is on the same clock as the
  // events, so there is nothing to reconcile and no reason to second-guess the
  // clinician: if they charted five hours after induction, the chart starts at
  // induction. The window below exists only because legacy wall-clock values
  // are measured against a different clock and can be an offset out.
  if (intraop?.startedAt) return anchor

  // The entered start time is authoritative only when the events it is meant to
  // describe actually sit alongside it. Outside that window the two disagree
  // too much to reconcile, so the events — which are the source of truth — win,
  // leaving the chart exactly as it reads today rather than mangling it.
  const earliest = chartStartFrom(log).getTime()
  const withinWindow =
    earliest >= anchor.getTime() - PRE_START_TOLERANCE_MS &&
    earliest <= anchor.getTime() + LATE_START_TOLERANCE_MS
  return withinWindow ? anchor : chartStartFrom(log)
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
  return reverseProjectIntraop(keyEvents as CoreLegacyKeyEvents, baseMs)
}

// If a case has no CaseEvent rows yet (its intraop data predates the
// event-sourced write path), seed them from its existing keyEvents (log if
// present, else reverse-projected from the legacy column-indexed arrays) so
// the rebuild has a complete picture and nothing is lost on the first write.
export async function ensureBackfilled(tx: Tx, caseId: string): Promise<void> {
  const count = await tx.caseEvent.count({ where: { caseId } })
  if (count > 0) return

  const intra = await tx.intraoperativeRecord.findUnique({ where: { caseId }, select: { keyEvents: true, startedAt: true, startTime: true, createdAt: true } })
  const keyEvents = (intra?.keyEvents as LegacyKeyEvents | null) ?? {}
  let log: LogEvent[] = Array.isArray(keyEvents.log) ? keyEvents.log : []
  if (log.length === 0) {
    // The legacy format only ever stored a 5-minute column index, never a real
    // timestamp, so reconstructed timestamps hang off the same chart anchor the
    // projection uses — one definition of column 0, shared.
    const anchor = intra ? chartAnchorFor(intra) : null
    const day = intra?.createdAt ?? new Date()
    const fallbackMs = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate())
    log = reverseProject(keyEvents, anchor?.getTime() ?? fallbackMs)
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

/** Tombstone one logical event. Repeating the same delete is a safe no-op. */
export async function deleteEvent(tx: Tx, caseId: string, logicalId: string): Promise<boolean> {
  await ensureBackfilled(tx, caseId)
  const { active } = await indexRows(tx, caseId)
  const current = active.get(logicalId)
  if (!current) return false
  await tx.caseEvent.update({ where: { id: current.id }, data: { status: "deleted" } })
  return true
}

/**
 * Atomically claim the section revision before a multi-statement event write.
 * A crashed request may leave a harmless revision gap, but another writer
 * cannot rebuild the timetable from an older event snapshot.
 */
export async function reserveIntraopRevision(
  tx: Tx,
  caseId: string,
  expectedRevision: number,
): Promise<boolean> {
  const result = await tx.intraoperativeRecord.updateMany({
    where: { caseId, syncRevision: expectedRevision },
    data: { syncRevision: { increment: 1 } },
  })
  return result.count === 1
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

export async function rebuildProjection(
  tx: Tx,
  caseId: string,
  options: { revisionAlreadyReserved?: boolean } = {},
): Promise<void> {
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
  const log = sortLogDeterministic([...byLogical.values()]).map(entry => ({
    ...entry.ev,
    id: entry.ev.id ?? entry.logicalId,
    sequence: entry.version,
  }))

  // Column 0 is the entered start time, not the first thing that got charted.
  // Using the earliest event meant the stored projection disagreed with what the
  // web client drew locally, and the difference only became visible when another
  // device opened the case — the "timetable starts at the wrong time on reopen"
  // report. Fall back to the earliest event only when no start time exists.
  const intraopRec = await tx.intraoperativeRecord.findUnique({
    where:  { caseId },
    select: {
      startedAt: true,
      startTime: true,
      createdAt: true,
      keyEvents: true,
      crystalloidsMl: true,
      colloidsMl: true,
      bloodMl: true,
    },
  })
  const start = resolveChartStart(intraopRec, log)
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
  const projectionUnchanged = !!intraopRec
    && sameContent(
      intraopRec.keyEvents as Record<string, unknown>,
      keyEvents as unknown as Record<string, unknown>,
    )
    && intraopRec.crystalloidsMl === fluidTotals.crystalloidsMl
    && intraopRec.colloidsMl === fluidTotals.colloidsMl
    && intraopRec.bloodMl === fluidTotals.bloodMl
  if (projectionUnchanged) return

  await tx.intraoperativeRecord.upsert({
    where:  { caseId },
    update: {
      keyEvents,
      ...fluidTotals,
      ...(options.revisionAlreadyReserved ? {} : { syncRevision: { increment: 1 } }),
    },
    // No start time: logging an event does not mean the clinician has told us
    // when the case began. This used to plant a midnight sentinel, which — being
    // a truthy Date — read downstream as a genuine 00:00 start and locked the
    // form with no way back.
    create: { caseId, startTime: null, keyEvents, ...fluidTotals, syncRevision: 1 },
  })
}
