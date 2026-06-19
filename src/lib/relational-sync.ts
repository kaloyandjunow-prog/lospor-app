import type { PrismaClient } from "@/generated/prisma/client"

// v2.0 — mirror the JSON clinical arrays into queryable rows.
//
// Reads from the AUTHORITATIVE JSON columns and reconciles child rows
// (delete + re-insert per section). Powers both live dual-write (called
// best-effort after case create/update) and the one-off backfill.
//
// SAFETY: called best-effort (caught) AFTER the main write commits.
// A failure here can NEVER roll back or block a clinical save.
// JSON stays the source of truth. Takes db as a parameter so backfill
// scripts can reuse without importing server-only modules.

type Db = PrismaClient
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string | null => (v == null ? null : String(v))
const flt = (v: unknown): number | null => {
  const n = parseFloat(String(v ?? ""))
  return isFinite(n) ? n : null
}

// LabLoinc cache (loaded once per process, tiny table)
let loincCache: Map<string, { loincCode: string; unitCanon: string; referenceLow: number | null; referenceHigh: number | null }> | null = null

async function getLoincMap(db: Db) {
  if (loincCache) return loincCache
  const rows = await db.labLoinc.findMany()
  loincCache = new Map(rows.map(r => [r.name, {
    loincCode:    r.loincCode,
    unitCanon:    r.unitCanon,
    referenceLow:  r.referenceLow,
    referenceHigh: r.referenceHigh,
  }]))
  return loincCache
}

function computeAbnormalFlag(value: number | null, low: number | null, high: number | null): string | null {
  if (value == null) return null
  if (high != null && value > high * 1.5) return "critical"
  if (low  != null && value < low  * 0.5) return "critical"
  if (high != null && value > high) return "high"
  if (low  != null && value < low)  return "low"
  return "normal"
}

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
  return arr(json).map((c: any, i: number) => {
    const rawCode = str(c?.sub ?? c?.code)
    // icd10Code: use sub/code if it looks like an ICD-10 code (letter + digits)
    const icd10Code = rawCode && /^[A-Za-z]\d/.test(rawCode) ? rawCode.toUpperCase() : null
    return {
      preopId, caseId,
      label:    String(c?.label ?? c?.sub ?? c?.code ?? "(unspecified)"),
      code:     rawCode,
      icd10Code,
      system:   str(c?.system),
      ordinal: i,
    }
  }).filter(r => r.label !== "(unspecified)" || r.code)
}

async function labRowsWithLoinc(
  preopId: string, caseId: string, json: unknown,
  loincMap: Map<string, { loincCode: string; unitCanon: string; referenceLow: number | null; referenceHigh: number | null }>
) {
  return arr(json)
    .filter((l: any) => l && l.test != null)
    .map((l: any, i: number) => {
      const loinc = loincMap.get(l.test)
      const valueNum = flt(l?.value)
      const abnormalFlag = loinc
        ? computeAbnormalFlag(valueNum, loinc.referenceLow, loinc.referenceHigh)
        : null
      return {
        preopId, caseId,
        test:         String(l.test),
        value:        str(l?.value),
        valueNum,
        unit:         str(l?.unit),
        unitCanon:    loinc?.unitCanon ?? null,
        loincCode:    loinc?.loincCode ?? null,
        referenceLow:  loinc?.referenceLow ?? null,
        referenceHigh: loinc?.referenceHigh ?? null,
        abnormalFlag,
        source:       str(l?.source) ?? "manual",
        ordinal: i,
      }
    })
}

function medicationRows(preopId: string, caseId: string, json: unknown) {
  return arr(json)
    .filter((m: any) => m && (m.label || m.name || m.inn))
    .map((m: any, i: number) => ({
      preopId, caseId,
      nameRaw:   String(m.label ?? m.name ?? m.inn ?? ""),
      inn:       str(m.inn),
      atcCode:   str(m.atc ?? m.atcCode),
      dose:      str(m.dose),
      route:     str(m.route),
      frequency: str(m.frequency),
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
  const [c, loincMap] = await Promise.all([
    db.case.findUnique({
      where: { id: caseId },
      select: {
        preop:   { select: { id: true, diagnosesJson: true, proceduresJson: true, comorbidities: true, labResults: true, currentMedications: true } },
        intraop: { select: { id: true, vascularAccesses: true, positions: true, techniques: true, airwayTools: true, airwayDevices: true, ventilationModes: true } },
        postop:  { select: { id: true, handoverItems: true } },
      },
    }),
    getLoincMap(db),
  ])
  if (!c) return

  if (c.preop) {
    const p = c.preop
    // Parse currentMedications: JSON array, or legacy plain-text (comma/newline separated)
    let medJson: unknown = []
    const rawMeds = p.currentMedications
    if (typeof rawMeds === "string" && rawMeds.trim()) {
      const trimmed = rawMeds.trim()
      if (trimmed.startsWith("[")) {
        try { medJson = JSON.parse(trimmed) } catch { /* leave empty */ }
      } else {
        // Legacy plain text: split on commas or newlines → each item becomes a nameRaw entry
        medJson = trimmed
          .split(/[,\n]+/)
          .map(s => s.trim())
          .filter(Boolean)
          .map(s => ({ label: s }))
      }
    }

    const labData = await labRowsWithLoinc(p.id, caseId, p.labResults, loincMap)

    await db.$transaction([
      db.preopDiagnosis.deleteMany({ where: { preopId: p.id } }),
      db.preopDiagnosis.createMany({ data: diagnosisRows(p.id, caseId, p.diagnosesJson) }),
      db.preopProcedure.deleteMany({ where: { preopId: p.id } }),
      db.preopProcedure.createMany({ data: procedureRows(p.id, caseId, p.proceduresJson) }),
      db.comorbidity.deleteMany({ where: { preopId: p.id } }),
      db.comorbidity.createMany({ data: comorbidityRows(p.id, caseId, p.comorbidities) }),
      db.labResult.deleteMany({ where: { preopId: p.id } }),
      db.labResult.createMany({ data: labData }),
      db.medication.deleteMany({ where: { preopId: p.id } }),
      db.medication.createMany({ data: medicationRows(p.id, caseId, medJson) }),
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

export function syncCaseRelationalSafe(db: Db, caseId: string): void {
  syncCaseRelational(db, caseId).catch(err => console.error("[relational-sync]", caseId, err))
}
