// Derives clinical risk-score checkboxes and medication-class warnings from
// data already entered elsewhere in the same case (coded comorbidities, coded
// medications, lab results) — instead of asking the clinician to re-enter the
// same fact twice. Mirrors the existing suggestASAFromTags() pattern in
// icd-categories.ts: these are SUGGESTIONS shown next to the field for the
// clinician to review and confirm, never a silent auto-check — risk
// classifications should never change without an explicit human action.

export type CodedTag = { code?: string; sub?: string; label?: string }
export type CodedMed = { inn?: string; atcCode?: string; label?: string }
export type LabEntry = { test: string; value?: string; unit?: string }

function codesOf(tags: CodedTag[]): string[] {
  return tags.map(t => (t.code ?? t.sub ?? "").toUpperCase()).filter(Boolean)
}

function hasCodePrefix(tags: CodedTag[], prefixes: string[]): boolean {
  const codes = codesOf(tags)
  return prefixes.some(p => codes.some(c => c.startsWith(p)))
}

function hasAtcPrefix(meds: CodedMed[], prefixes: string[]): boolean {
  const codes = meds.map(m => (m.atcCode ?? "").toUpperCase()).filter(Boolean)
  return prefixes.some(p => codes.some(c => c.startsWith(p)))
}

// ── RCRI (Revised Cardiac Risk Index) ──────────────────────────────────────
const ISCHEMIC_HEART_CODES = ["I21", "I25"]       // acute MI, chronic ischaemic heart disease
const CHF_CODES            = ["I50"]              // heart failure
const CVD_CODES            = ["I63", "I64", "G45"] // stroke, unspecified stroke, TIA
const INSULIN_DM_CODES     = ["E10"]              // type 1 (insulin-dependent) diabetes
const INSULIN_ATC          = ["A10A"]             // insulin products — corroborates E10 even if uncoded

export function suggestRcriIschemicHeart(comorbidities: CodedTag[]): boolean {
  return hasCodePrefix(comorbidities, ISCHEMIC_HEART_CODES)
}
export function suggestRcriCHF(comorbidities: CodedTag[]): boolean {
  return hasCodePrefix(comorbidities, CHF_CODES)
}
export function suggestRcriCVD(comorbidities: CodedTag[]): boolean {
  return hasCodePrefix(comorbidities, CVD_CODES)
}
export function suggestRcriInsulinDM(comorbidities: CodedTag[], medications: CodedMed[]): boolean {
  return hasCodePrefix(comorbidities, INSULIN_DM_CODES) || hasAtcPrefix(medications, INSULIN_ATC)
}

// RCRI's creatinine criterion is a fixed clinical threshold (>177 µmol/L /
// >2.0 mg/dL), not something that varies by app — safe to hardcode like the
// criterion itself. Returns false (no suggestion) for unrecognised units
// rather than guess.
const CREATININE_THRESHOLD_UMOL_L = 177
const CREATININE_THRESHOLD_MG_DL  = 2.0
export function suggestRcriCreatinine(labResults: LabEntry[]): boolean {
  const entry = labResults.find(l => l.test === "Creatinine")
  if (!entry?.value) return false
  const num = parseFloat(entry.value)
  if (!Number.isFinite(num)) return false
  if (entry.unit === "mg/dL") return num > CREATININE_THRESHOLD_MG_DL
  return num > CREATININE_THRESHOLD_UMOL_L // default/µmol/L
}

// ── STOP-BANG "Pressure" criterion ─────────────────────────────────────────
// Asks about a hypertension DIAGNOSIS/treatment history, not today's single
// vitals reading (a one-off elevated reading isn't the same as diagnosed
// hypertension) — so this derives from comorbidities/medications, not bpSystolic/bpDiastolic.
const HYPERTENSION_CODES      = ["I10", "I11"]
const ANTIHYPERTENSIVE_ATC    = ["C02", "C03", "C07", "C08", "C09"]
export function suggestStopBangBP(comorbidities: CodedTag[], medications: CodedMed[]): boolean {
  return hasCodePrefix(comorbidities, HYPERTENSION_CODES) || hasAtcPrefix(medications, ANTIHYPERTENSIVE_ATC)
}

// ── Medication-class warnings (intraop summary reminder) ───────────────────
const ANTICOAGULANT_ANTIPLATELET_ATC = ["B01A"]
const SYSTEMIC_STEROID_ATC           = ["H02"]
const BETA_BLOCKER_ATC               = ["C07"]

export type MedicationWarning = { key: string; label: string }

export function getMedicationWarnings(medications: CodedMed[]): MedicationWarning[] {
  const warnings: MedicationWarning[] = []
  if (hasAtcPrefix(medications, ANTICOAGULANT_ANTIPLATELET_ATC)) {
    warnings.push({ key: "anticoagulant", label: "Anticoagulant/antiplatelet — review neuraxial/regional bleeding risk" })
  }
  if (hasAtcPrefix(medications, SYSTEMIC_STEROID_ATC)) {
    warnings.push({ key: "steroid", label: "Chronic steroid use — consider perioperative steroid coverage" })
  }
  if (hasAtcPrefix(medications, BETA_BLOCKER_ATC)) {
    warnings.push({ key: "betablocker", label: "Beta-blocker — continue perioperatively per protocol" })
  }
  return warnings
}

// ── Difficult-airway equipment cross-link ──────────────────────────────────
export type AirwayFindings = {
  mallampati?: string | null
  neckMobility?: string | null
  mouthOpeningCm?: number | null
  cormackLehane?: string | null
}

// True if the preop airway exam suggests extra difficult-airway equipment
// should be at hand — does not touch difficultAirwayHistory (that field asks
// about PAST intubations, this is about TODAY'S exam findings).
export function suggestsDifficultAirwayEquipment(findings: AirwayFindings): boolean {
  if (findings.mallampati === "III" || findings.mallampati === "IV") return true
  if (findings.neckMobility === "FIXED") return true
  if (findings.mouthOpeningCm != null && findings.mouthOpeningCm < 3) return true
  if (findings.cormackLehane && ["IIb", "III", "IV"].includes(findings.cormackLehane)) return true
  return false
}
