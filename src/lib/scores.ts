// Auto-calculated perioperative risk scores

export function calcBMI(heightCm: number, weightKg: number): number {
  const h = heightCm / 100
  return Math.round((weightKg / (h * h)) * 10) / 10
}

// Devine Formula — Ideal Body Weight
// Male:   IBW = 50 + 2.3 × (height_inches − 60)
// Female: IBW = 45.5 + 2.3 × (height_inches − 60)
export function calcIBW(heightCm: number, sex: "MALE" | "FEMALE" | "OTHER"): number {
  const inches = heightCm / 2.54
  const base   = sex === "FEMALE" ? 45.5 : 50
  const ibw    = base + 2.3 * (inches - 60)
  return Math.round(Math.max(ibw, 0) * 10) / 10
}

// Adjusted Body Weight — used for drug dosing in obese patients (actual > IBW)
// ABW = IBW + 0.4 × (Actual − IBW)
export function calcABW(ibw: number, actualKg: number): number | null {
  if (actualKg <= ibw) return null  // not applicable when weight ≤ IBW
  return Math.round((ibw + 0.4 * (actualKg - ibw)) * 10) / 10
}

// Apfel score for PONV risk (0–4)
// Each factor = 1 point: female sex, non-smoker, history of PONV/motion sickness, postop opioids planned
export function calcApfel({
  female,
  nonSmoker,
  ponvHistory,
  opioidsPlanned,
}: {
  female: boolean
  nonSmoker: boolean
  ponvHistory: boolean
  opioidsPlanned: boolean
}): number {
  return [female, nonSmoker, ponvHistory, opioidsPlanned].filter(Boolean).length
}

// STOP-BANG score for OSA risk (0–8)
export function calcStopBang({
  snoring,
  tired,
  observed,         // observed apneas
  highBP,
  bmi,
  ageOver50,
  neckOver40cm,
  male,
}: {
  snoring: boolean
  tired: boolean
  observed: boolean
  highBP: boolean
  bmi: number
  ageOver50: boolean
  neckOver40cm: boolean
  male: boolean
}): number {
  return [
    snoring,
    tired,
    observed,
    highBP,
    bmi > 35,
    ageOver50,
    neckOver40cm,
    male,
  ].filter(Boolean).length
}

// Revised Cardiac Risk Index / Lee Score (0–6)
// Points: high-risk surgery, ischaemic heart disease, CHF, cerebrovascular disease, diabetes on insulin, creatinine > 177 µmol/L
export function calcRCRI({
  highRiskSurgery,
  ischaemicHeartDisease,
  congestiveHeartFailure,
  cerebrovascularDisease,
  insulinDependentDiabetes,
  creatinineHigh,
}: {
  highRiskSurgery: boolean
  ischaemicHeartDisease: boolean
  congestiveHeartFailure: boolean
  cerebrovascularDisease: boolean
  insulinDependentDiabetes: boolean
  creatinineHigh: boolean
}): number {
  return [
    highRiskSurgery,
    ischaemicHeartDisease,
    congestiveHeartFailure,
    cerebrovascularDisease,
    insulinDependentDiabetes,
    creatinineHigh,
  ].filter(Boolean).length
}

// GUPTA Perioperative MI/Cardiac Arrest — simplified logistic model
// Returns % risk (approximate). Full model requires procedure type + functional status + ASA + creatinine + age.
export function calcGupta({
  asa,          // 1-5
  age,
  functionalStatus, // 1=independent, 2=partially dependent, 3=totally dependent
  creatinine,   // mg/dL
  procedureRisk, // 1=low, 2=intermediate, 3=high (vascular)
}: {
  asa: number
  age: number
  functionalStatus: number
  creatinine: number
  procedureRisk: number
}): number {
  // Coefficients from Gupta et al. (2011)
  const intercept = -5.25
  const coefAsa2 = 0.61
  const coefAsa3 = 1.37
  const coefAsa4_5 = 2.1
  const coefAge = 0.01
  const coefFuncPartial = 0.43
  const coefFuncTotal = 0.91
  const coefCreatinine = 0.36   // per mg/dL above 1.5
  const coefHighRisk = 0.76     // high-risk (vascular) surgery

  let logit = intercept
  logit += coefAge * age
  if (asa === 2) logit += coefAsa2
  else if (asa === 3) logit += coefAsa3
  else if (asa >= 4) logit += coefAsa4_5
  if (functionalStatus === 2) logit += coefFuncPartial
  else if (functionalStatus === 3) logit += coefFuncTotal
  if (creatinine > 1.5) logit += coefCreatinine * (creatinine - 1.5)
  if (procedureRisk === 3) logit += coefHighRisk

  const prob = 1 / (1 + Math.exp(-logit))
  return Math.round(prob * 1000) / 10 // percent with 1 decimal
}

// Aldrete score total
export function calcAldreteTotal(components: (number | null | undefined)[]): number {
  return components.reduce<number>((sum, v) => sum + (v ?? 0), 0)
}

export function apfelRiskLabel(score: number): string {
  if (score <= 1) return "Low (< 10%)"
  if (score === 2) return "Moderate (~40%)"
  return "High (≥ 60%)"
}

export function rcriRiskLabel(score: number): string {
  if (score === 0) return "Very low (0.4%)"
  if (score === 1) return "Low (1.0%)"
  if (score === 2) return "Moderate (2.4%)"
  return "High (≥ 5.4%)"
}

export function stopBangRiskLabel(score: number): string {
  if (score <= 2) return "Low OSA risk"
  if (score <= 4) return "Intermediate OSA risk"
  return "High OSA risk"
}
