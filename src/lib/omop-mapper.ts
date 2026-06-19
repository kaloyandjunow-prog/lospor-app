/**
 * OMOP CDM v5.4 mapper — v2.1
 *
 * Improvements in v2.1:
 * - Drug exposure now reads from CaseEvent rows (type="drug") instead of keyEvents.log
 * - Lab measurements now exported from LabResult rows (LOINC-coded, canonical units)
 * - care_site_source_value now uses Case.institutionId when available
 * - source_version updated to 2.1.0
 *
 * Concept IDs remain 0 where LOSPOR does not have OMOP standard vocabulary mapping
 * (vitals and their LOINC codes are the exception — those have real concept_ids).
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _counter = 1
function nextId() { return _counter++ }
function resetIds() { _counter = 1 }

/** Deterministic numeric ID from a string — avoids collisions across tables */
function hashId(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return Math.abs(h) || 1
}

function isoDate(d: Date | string | null | undefined): string | null {
  if (!d) return null
  const dt = typeof d === "string" ? new Date(d) : d
  return isNaN(dt.getTime()) ? null : dt.toISOString().substring(0, 10)
}

// ─── LOINC / OMOP vital concept map ──────────────────────────────────────────

const VITAL_CONCEPTS: Record<string, { concept_id: number; loinc: string; unit: string }> = {
  systolic:    { concept_id: 3004249, loinc: "8480-6",  unit: "mmHg" },
  diastolic:   { concept_id: 3012888, loinc: "8462-4",  unit: "mmHg" },
  heartRate:   { concept_id: 3027018, loinc: "8867-4",  unit: "/min" },
  spO2:        { concept_id: 3016502, loinc: "59408-5", unit: "%" },
  etco2:       { concept_id: 3020892, loinc: "19889-5", unit: "mmHg" },
  temp:        { concept_id: 3020891, loinc: "8310-5",  unit: "Cel" },
  respiratoryRate: { concept_id: 3024171, loinc: "9279-1", unit: "/min" },
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OmopBundle {
  metadata: {
    omop_cdm_version: string
    generated_at: string
    source: string
    source_version: string
    case_count: number
    note: string
  }
  visit_occurrence: OmopVisit[]
  condition_occurrence: OmopCondition[]
  drug_exposure: OmopDrug[]
  measurement: OmopMeasurement[]
  procedure_occurrence: OmopProcedure[]
  observation: OmopObservation[]
}

interface OmopVisit {
  visit_occurrence_id: number
  person_id: number
  visit_concept_id: number
  visit_start_date: string | null
  visit_end_date: string | null
  visit_type_concept_id: number
  visit_source_value: string | null
  care_site_source_value: string | null
}

interface OmopCondition {
  condition_occurrence_id: number
  person_id: number
  condition_concept_id: number
  condition_start_date: string | null
  condition_type_concept_id: number
  condition_source_value: string | null
  visit_occurrence_id: number
}

interface OmopDrug {
  drug_exposure_id: number
  person_id: number
  drug_concept_id: number
  drug_exposure_start_date: string | null
  drug_type_concept_id: number
  drug_source_value: string | null
  drug_source_concept_id: string | null
  dose_value: number | null
  dose_unit_source_value: string | null
  route_source_value: string | null
  visit_occurrence_id: number
}

interface OmopMeasurement {
  measurement_id: number
  person_id: number
  measurement_concept_id: number
  measurement_date: string | null
  measurement_datetime: string | null
  measurement_type_concept_id: number
  value_as_number: number | null
  unit_concept_id: number
  unit_source_value: string | null
  measurement_source_value: string | null
  visit_occurrence_id: number
}

interface OmopProcedure {
  procedure_occurrence_id: number
  person_id: number
  procedure_concept_id: number
  procedure_date: string | null
  procedure_type_concept_id: number
  procedure_source_value: string | null
  visit_occurrence_id: number
}

interface OmopObservation {
  observation_id: number
  person_id: number
  observation_concept_id: number
  observation_date: string | null
  observation_type_concept_id: number
  value_as_string: string | null
  observation_source_value: string | null
  visit_occurrence_id: number
}

// ─── Main mapper ──────────────────────────────────────────────────────────────

type CaseRow = {
  id: string
  caseCode: string | null
  createdAt: Date
  status: string
  institutionId?: string | null
  user?: { institution?: { name: string | null } | null } | null
  events?: {
    type: string
    timestamp: Date
    label: string | null
    value: string | null
    unit: string | null
    atcCode: string | null
    drugId: string | null
    metadataJson: unknown
  }[]
  preop?: {
    ageYears: number | null
    sex: string
    heightCm: number | null
    weightKg: number | null
    bpSystolic: number | null
    bpDiastolic: number | null
    heartRate: number | null
    spO2: number | null
    temperature: number | null
    respiratoryRate: number | null
    diagnosis: string
    diagnosesJson: unknown
    plannedProcedure: string
    proceduresJson: unknown
    comorbidities: unknown
    asaScore: string | null
    emergencySurgery: boolean
    highRiskSurgery: boolean
    allergies: boolean
    allergyDetails: string | null
    smoking: boolean
    substanceAbuse: boolean
    currentMedications: string | null
    rcriScore: number | null
    apfelScore: number | null
    stopBangScore: number | null
    difficultAirwayHistory: boolean
    mallampati: string | null
    labResults: unknown
    labRows?: {
      test: string
      valueNum: number | null
      value: string | null
      unitCanon: string | null
      loincCode: string | null
      abnormalFlag: string | null
    }[]
  } | null
  intraop?: {
    startTime: Date
    endTime: Date | null
    durationMinutes: number | null
    monthYear: string | null
    techniques: unknown
    keyEvents: unknown
    crystalloidsMl: number | null
    colloidsMl: number | null
    bloodMl: number | null
    urineMl: number | null
    complications: string | null
    premedicationEvening: string | null
    premedicationMorning: string | null
    airwayDevice: string | null
  } | null
  postop?: {
    aldreteTotal: number | null
    painScoreNRS: number | null
    ponv: boolean
    disposition: string | null
  } | null
}

export function mapCasesToOmop(cases: CaseRow[]): OmopBundle {
  resetIds()

  const visits: OmopVisit[] = []
  const conditions: OmopCondition[] = []
  const drugs: OmopDrug[] = []
  const measurements: OmopMeasurement[] = []
  const procedures: OmopProcedure[] = []
  const observations: OmopObservation[] = []

  for (const c of cases) {
    const personId = hashId(c.id)
    const visitId  = hashId(`visit:${c.id}`)
    const startDate = isoDate(c.intraop?.startTime ?? c.createdAt)
    const endDate   = isoDate(c.intraop?.endTime ?? c.intraop?.startTime ?? c.createdAt)

    // care_site: prefer case-level institutionId (populated from v2.1+), fall back to user institution
    const careSite = c.institutionId ?? c.user?.institution?.name ?? null

    // ── VISIT_OCCURRENCE ─────────────────────────────────────────────────────
    visits.push({
      visit_occurrence_id:   visitId,
      person_id:             personId,
      visit_concept_id:      9201,  // Inpatient Visit
      visit_start_date:      startDate,
      visit_end_date:        endDate,
      visit_type_concept_id: 32817, // EHR
      visit_source_value:    c.caseCode,
      care_site_source_value: careSite,
    })

    const preop = c.preop

    // ── Preop vitals → MEASUREMENT ───────────────────────────────────────────
    if (preop) {
      const vitDate = isoDate(c.createdAt)
      const vitalMap: [keyof typeof VITAL_CONCEPTS, number | null | undefined][] = [
        ["systolic",        preop.bpSystolic],
        ["diastolic",       preop.bpDiastolic],
        ["heartRate",       preop.heartRate],
        ["spO2",            preop.spO2],
        ["temp",            preop.temperature],
        ["respiratoryRate", preop.respiratoryRate],
      ]
      for (const [key, val] of vitalMap) {
        if (val == null) continue
        const cfg = VITAL_CONCEPTS[key]
        measurements.push({
          measurement_id:            nextId(),
          person_id:                 personId,
          measurement_concept_id:    cfg.concept_id,
          measurement_date:          vitDate,
          measurement_datetime:      vitDate,
          measurement_type_concept_id: 32817,
          value_as_number:           val,
          unit_concept_id:           0,
          unit_source_value:         cfg.unit,
          measurement_source_value:  `LOINC:${cfg.loinc}`,
          visit_occurrence_id:       visitId,
        })
      }

      // ── Lab results from LabResult rows → MEASUREMENT ────────────────────
      // v2.1: use SQL LabResult rows (LOINC-coded) instead of raw JSON
      const labRows = preop.labRows ?? []
      for (const lab of labRows) {
        if (lab.valueNum == null) continue
        measurements.push({
          measurement_id:              nextId(),
          person_id:                   personId,
          measurement_concept_id:      0,
          measurement_date:            vitDate,
          measurement_datetime:        vitDate,
          measurement_type_concept_id: 32817,
          value_as_number:             lab.valueNum,
          unit_concept_id:             0,
          unit_source_value:           lab.unitCanon ?? null,
          measurement_source_value:    lab.loincCode ? `LOINC:${lab.loincCode}` : `LAB:${lab.test}`,
          visit_occurrence_id:         visitId,
        })
      }

      // ── Comorbidities → CONDITION_OCCURRENCE ─────────────────────────────
      const comorbs: { label: string; code?: string }[] = Array.isArray(preop.comorbidities)
        ? preop.comorbidities as { label: string; code?: string }[]
        : []
      for (const co of comorbs) {
        conditions.push({
          condition_occurrence_id:    nextId(),
          person_id:                 personId,
          condition_concept_id:      0,
          condition_start_date:      isoDate(c.createdAt),
          condition_type_concept_id: 32817,
          condition_source_value:    co.code ? `${co.code} — ${co.label}` : co.label,
          visit_occurrence_id:       visitId,
        })
      }

      // Primary diagnosis → CONDITION_OCCURRENCE
      const diagLabel = (() => {
        const dj = preop.diagnosesJson as { label?: string; code?: string }[] | null
        return dj?.[0] ? (dj[0].code ? `${dj[0].code} — ${dj[0].label}` : dj[0].label) : preop.diagnosis
      })()
      if (diagLabel) {
        conditions.push({
          condition_occurrence_id:    nextId(),
          person_id:                 personId,
          condition_concept_id:      0,
          condition_start_date:      isoDate(c.createdAt),
          condition_type_concept_id: 32817,
          condition_source_value:    diagLabel ?? null,
          visit_occurrence_id:       visitId,
        })
      }

      // ── Observations: ASA, RCRI, Apfel, STOP-BANG, airway ───────────────
      if (preop.asaScore) {
        observations.push({
          observation_id:           nextId(),
          person_id:                personId,
          observation_concept_id:   4173987, // ASA Physical Status concept
          observation_date:         isoDate(c.createdAt),
          observation_type_concept_id: 32817,
          value_as_string:          preop.asaScore + (preop.emergencySurgery ? "E" : ""),
          observation_source_value: "ASA_PHYSICAL_STATUS",
          visit_occurrence_id:      visitId,
        })
      }
      if (preop.rcriScore != null) {
        observations.push({
          observation_id: nextId(), person_id: personId,
          observation_concept_id: 0,
          observation_date: isoDate(c.createdAt), observation_type_concept_id: 32817,
          value_as_string: String(preop.rcriScore),
          observation_source_value: "RCRI_SCORE", visit_occurrence_id: visitId,
        })
      }
      if (preop.apfelScore != null) {
        observations.push({
          observation_id: nextId(), person_id: personId,
          observation_concept_id: 0,
          observation_date: isoDate(c.createdAt), observation_type_concept_id: 32817,
          value_as_string: String(preop.apfelScore),
          observation_source_value: "APFEL_SCORE_PONV", visit_occurrence_id: visitId,
        })
      }
      if (preop.stopBangScore != null) {
        observations.push({
          observation_id: nextId(), person_id: personId,
          observation_concept_id: 0,
          observation_date: isoDate(c.createdAt), observation_type_concept_id: 32817,
          value_as_string: String(preop.stopBangScore),
          observation_source_value: "STOPBANG_SCORE_OSA", visit_occurrence_id: visitId,
        })
      }
      if (preop.difficultAirwayHistory) {
        observations.push({
          observation_id: nextId(), person_id: personId,
          observation_concept_id: 0,
          observation_date: isoDate(c.createdAt), observation_type_concept_id: 32817,
          value_as_string: "true",
          observation_source_value: "DIFFICULT_AIRWAY_HISTORY", visit_occurrence_id: visitId,
        })
      }
      if (preop.mallampati) {
        observations.push({
          observation_id: nextId(), person_id: personId,
          observation_concept_id: 0,
          observation_date: isoDate(c.createdAt), observation_type_concept_id: 32817,
          value_as_string: preop.mallampati,
          observation_source_value: "MALLAMPATI_CLASS", visit_occurrence_id: visitId,
        })
      }
    }

    // ── Planned procedure → PROCEDURE_OCCURRENCE ─────────────────────────────
    const procLabel = (() => {
      if (!preop) return null
      const pj = preop.proceduresJson as { label?: string; code?: string; group?: string }[] | null
      if (pj?.[0]) return pj[0].group ?? pj[0].label ?? preop.plannedProcedure
      return preop.plannedProcedure
    })()
    if (procLabel) {
      procedures.push({
        procedure_occurrence_id:    nextId(),
        person_id:                 personId,
        procedure_concept_id:      0,
        procedure_date:            startDate,
        procedure_type_concept_id: 32817,
        procedure_source_value:    procLabel,
        visit_occurrence_id:       visitId,
      })
    }

    // ── Intraop techniques → PROCEDURE_OCCURRENCE ────────────────────────────
    if (c.intraop) {
      const techs: string[] = Array.isArray(c.intraop.techniques) ? c.intraop.techniques as string[] : []
      for (const tech of techs) {
        procedures.push({
          procedure_occurrence_id:    nextId(),
          person_id:                 personId,
          procedure_concept_id:      0,
          procedure_date:            startDate,
          procedure_type_concept_id: 32817,
          procedure_source_value:    `ANAESTHESIA_TECHNIQUE:${tech}`,
          visit_occurrence_id:       visitId,
        })
      }

      // ── Drug events from CaseEvent rows → DRUG_EXPOSURE ─────────────────
      // v2.1: read from SQL CaseEvent rows (type="drug", status="active")
      // instead of parsing the legacy keyEvents.log JSON blob
      const drugEvents = c.events ?? []
      for (const ev of drugEvents) {
        if (ev.type !== "drug") continue
        const meta = (ev.metadataJson ?? {}) as any
        const dose = meta.dose != null ? parseFloat(String(meta.dose)) || null : null
        drugs.push({
          drug_exposure_id:           nextId(),
          person_id:                  personId,
          drug_concept_id:            0,
          drug_exposure_start_date:   isoDate(ev.timestamp),
          drug_type_concept_id:       32817,
          drug_source_value:          meta.name ?? ev.label ?? null,
          drug_source_concept_id:     ev.atcCode ? `ATC:${ev.atcCode}` : null,
          dose_value:                 dose,
          dose_unit_source_value:     ev.unit ?? meta.unit ?? null,
          route_source_value:         meta.drugRoute ?? "IV",
          visit_occurrence_id:        visitId,
        })
      }

      // Fluid totals as observations
      if (c.intraop.crystalloidsMl != null) observations.push({ observation_id: nextId(), person_id: personId, observation_concept_id: 0, observation_date: endDate, observation_type_concept_id: 32817, value_as_string: String(c.intraop.crystalloidsMl), observation_source_value: "CRYSTALLOIDS_ML", visit_occurrence_id: visitId })
      if (c.intraop.colloidsMl != null) observations.push({ observation_id: nextId(), person_id: personId, observation_concept_id: 0, observation_date: endDate, observation_type_concept_id: 32817, value_as_string: String(c.intraop.colloidsMl), observation_source_value: "COLLOIDS_ML", visit_occurrence_id: visitId })
      if (c.intraop.bloodMl != null) observations.push({ observation_id: nextId(), person_id: personId, observation_concept_id: 0, observation_date: endDate, observation_type_concept_id: 32817, value_as_string: String(c.intraop.bloodMl), observation_source_value: "BLOOD_ML", visit_occurrence_id: visitId })
      if (c.intraop.urineMl != null) observations.push({ observation_id: nextId(), person_id: personId, observation_concept_id: 0, observation_date: endDate, observation_type_concept_id: 32817, value_as_string: String(c.intraop.urineMl), observation_source_value: "URINE_OUTPUT_ML", visit_occurrence_id: visitId })
      if (c.intraop.complications) observations.push({ observation_id: nextId(), person_id: personId, observation_concept_id: 0, observation_date: endDate, observation_type_concept_id: 32817, value_as_string: c.intraop.complications, observation_source_value: "INTRAOP_COMPLICATIONS", visit_occurrence_id: visitId })
    }

    // ── Postop → OBSERVATION ─────────────────────────────────────────────────
    if (c.postop) {
      const postDate = endDate ?? isoDate(c.createdAt)
      if (c.postop.aldreteTotal != null) observations.push({ observation_id: nextId(), person_id: personId, observation_concept_id: 0, observation_date: postDate, observation_type_concept_id: 32817, value_as_string: String(c.postop.aldreteTotal), observation_source_value: "ALDRETE_TOTAL", visit_occurrence_id: visitId })
      if (c.postop.painScoreNRS != null) observations.push({ observation_id: nextId(), person_id: personId, observation_concept_id: 3020891, observation_date: postDate, observation_type_concept_id: 32817, value_as_string: String(c.postop.painScoreNRS), observation_source_value: "PAIN_NRS_0_10", visit_occurrence_id: visitId })
      if (c.postop.ponv) observations.push({ observation_id: nextId(), person_id: personId, observation_concept_id: 0, observation_date: postDate, observation_type_concept_id: 32817, value_as_string: "true", observation_source_value: "PONV_PRESENT", visit_occurrence_id: visitId })
      if (c.postop.disposition) observations.push({ observation_id: nextId(), person_id: personId, observation_concept_id: 0, observation_date: postDate, observation_type_concept_id: 32817, value_as_string: c.postop.disposition, observation_source_value: "POSTOP_DISPOSITION", visit_occurrence_id: visitId })
    }
  }

  return {
    metadata: {
      omop_cdm_version: "5.4",
      generated_at: new Date().toISOString(),
      source: "LOSPOR",
      source_version: "2.1.0",
      case_count: cases.length,
      note: "concept_id = 0 where LOSPOR does not yet have standard OMOP vocabulary mapping. person_id is a deterministic anonymised hash of the internal case ID — no patient identifiers are stored or exported. Drug exposure reads from the CaseEvent event log (type=drug, status=active). Lab measurements include LOINC-coded results from the LabResult table.",
    },
    visit_occurrence:      visits,
    condition_occurrence:  conditions,
    drug_exposure:         drugs,
    measurement:           measurements,
    procedure_occurrence:  procedures,
    observation:           observations,
  }
}
