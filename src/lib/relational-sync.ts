import type { PrismaClient } from "@/generated/prisma/client"

// ─────────────────────────────────────────────────────────────────────────────
// v1.2 — mirror the JSON clinical arrays into queryable rows.
//
// Reads from the AUTHORITATIVE JSON columns the case already wrote and reconciles
// the child rows (delete + re-insert per section). The same function powers the
// live dual-write (called best-effort after a case create/update) and the one-off
// backfill, so there is no payload-shape coupling and the two can't diverge.
//
// SAFETY: callers invoke this best-effort (caught) AFTER the main write commits,
// so a failure here can never roll back or block a clinical save. JSON stays the
// source of truth. Takes the db client as a parameter so the backfill script can
// reuse it without importing server-only modules.
// ─────────────────────────────────────────────────────────────────────────────

type Db = PrismaClient
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string | null => (v == null ? null : String(v))

function diagnosisRows(preopId: string, caseId: string, json: unknown) {
  return arr(json).map((d: any, i: number) => ({
    preopId, caseId,
    code:   str(d?.sub ?? d?.code),
    label:  String(d?.label ?? d?.code ?? d?.sub ?? "(unspecified)"),
    system: str(d?.system),
    ordinal: i,
  }))
}

function procedureRows(preopId: string, caseId: string, json: unknown) {
  return arr(json).map((p: any, i: number) => ({
    preopId, caseId,
    code:        str(p?.sub ?? p?.code),
    group:       str(p?.group),
    domain:      str(p?.domain),
    description: str(p?.description ?? p?.label),
    ordinal: i,
  }))
}

function comorbidityRows(preopId: string, caseId: string, json: unknown) {
  return arr(json).map((c: any, i: number) => ({
    preopId, caseId,
    label:  String(c?.label ?? c?.sub ?? c?.code ?? "(unspecified)"),
    code:   str(c?.sub ?? c?.code),
    system: str(c?.system),
    ordinal: i,
  })).filter(r => r.label !== "(unspecified)" || r.code)
}

function labRows(preopId: string, caseId: string, json: unknown) {
  return arr(json)
    .filter((l: any) => l && l.test != null)
    .map((l: any, i: number) => ({
      preopId, caseId,
      test:  String(l.test),
      value: str(l?.value),
      unit:  str(l?.unit),
      ordinal: i,
    }))
}

function vascularRows(intraopId: string, caseId: string, json: unknown) {
  return arr(json).map((v: any, i: number) => ({
    intraopId, caseId,
    site:      str(v?.site),
    siteLabel: str(v?.siteLabel),
    size:      str(v?.size),
    sizeUnit:  str(v?.sizeUnit),
    ordinal: i,
  }))
}

function selectionRows(caseId: string, section: string, category: string, json: unknown) {
  return arr(json)
    .map((v: any) => (typeof v === "string" ? v : v?.value ?? v?.label))
    .filter((v: any): v is string => typeof v === "string" && v.length > 0)
    .map((value: string, i: number) => ({ caseId, section, category, value, ordinal: i }))
}

export async function syncCaseRelational(db: Db, caseId: string): Promise<void> {
  const c = await db.case.findUnique({
    where: { id: caseId },
    select: {
      preop:   { select: { id: true, diagnosesJson: true, proceduresJson: true, comorbidities: true, labResults: true } },
      intraop: { select: { id: true, vascularAccesses: true, positions: true, techniques: true, airwayTools: true, airwayDevices: true, ventilationModes: true } },
      postop:  { select: { id: true, handoverItems: true } },
    },
  })
  if (!c) return

  if (c.preop) {
    const p = c.preop
    await db.$transaction([
      db.preopDiagnosis.deleteMany({ where: { preopId: p.id } }),
      db.preopDiagnosis.createMany({ data: diagnosisRows(p.id, caseId, p.diagnosesJson) }),
      db.preopProcedure.deleteMany({ where: { preopId: p.id } }),
      db.preopProcedure.createMany({ data: procedureRows(p.id, caseId, p.proceduresJson) }),
      db.comorbidity.deleteMany({ where: { preopId: p.id } }),
      db.comorbidity.createMany({ data: comorbidityRows(p.id, caseId, p.comorbidities) }),
      db.labResult.deleteMany({ where: { preopId: p.id } }),
      db.labResult.createMany({ data: labRows(p.id, caseId, p.labResults) }),
    ])
  }

  if (c.intraop) {
    const it = c.intraop
    const selections = [
      ...selectionRows(caseId, "intraop", "position",        it.positions),
      ...selectionRows(caseId, "intraop", "technique",       it.techniques),
      ...selectionRows(caseId, "intraop", "airwayTool",      it.airwayTools),
      ...selectionRows(caseId, "intraop", "airwayDevice",    it.airwayDevices),
      ...selectionRows(caseId, "intraop", "ventilationMode", it.ventilationModes),
    ]
    await db.$transaction([
      db.vascularAccess.deleteMany({ where: { intraopId: it.id } }),
      db.vascularAccess.createMany({ data: vascularRows(it.id, caseId, it.vascularAccesses) }),
      db.caseSelection.deleteMany({ where: { caseId, section: "intraop" } }),
      db.caseSelection.createMany({ data: selections }),
    ])
  }

  if (c.postop) {
    const selections = selectionRows(caseId, "postop", "handoverItem", c.postop.handoverItems)
    await db.$transaction([
      db.caseSelection.deleteMany({ where: { caseId, section: "postop" } }),
      db.caseSelection.createMany({ data: selections }),
    ])
  }
}

/** Best-effort wrapper for the live write path — never throws. */
export function syncCaseRelationalSafe(db: Db, caseId: string): void {
  syncCaseRelational(db, caseId).catch(err => console.error("[relational-sync]", caseId, err))
}
