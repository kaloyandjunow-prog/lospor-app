// Shared data-mapping helpers for POST and PATCH case routes
import { Prisma } from "@/generated/prisma/client"

export function mapPreop(preop: any) {
  const upperLipBiteTest =
    preop.upperLipBiteTest ??
    (preop.ulbt === "I" ? "CLASS_I" : preop.ulbt === "II" ? "CLASS_II" : preop.ulbt === "III" ? "CLASS_III" : null)
  const difficultAirwayHistory = preop.difficultAirwayHistory ?? preop.difficultAirway ?? false
  const familyAnesthesiaProblems = preop.familyAnesthesiaProblems ?? preop.familyProblems ?? false
  const familyAnesthesiaDetails = preop.familyAnesthesiaDetails ?? preop.familyProblemNotes ?? null
  // Item 20: Validate/compute BMI from height+weight; discard client BMI if it diverges >10%
  const heightCm = preop.heightCm ?? null
  const weightKg = preop.weightKg ?? null
  let bmi: number | null = null
  if (heightCm != null && weightKg != null && heightCm > 0) {
    const computedBmi = weightKg / Math.pow(heightCm / 100, 2)
    if (preop.bmi != null) {
      const clientBmi = Number(preop.bmi)
      bmi = Math.abs(clientBmi - computedBmi) / computedBmi <= 0.1 ? clientBmi : computedBmi
    } else {
      bmi = computedBmi
    }
  }

  // Item 26: Build JSON arrays for diagnoses/procedures; keep legacy string columns for compat
  const diagnosesArr: any[] = Array.isArray(preop.diagnoses) ? preop.diagnoses : []
  const proceduresArr: any[] = Array.isArray(preop.procedures) ? preop.procedures : []

  return {
    // Items 18 + 19: Use null instead of 0 for missing biometrics — 0 corrupts risk scores
    ageYears:  preop.ageYears  ?? null,
    sex:       preop.sex ?? "OTHER",
    heightCm,
    weightKg,
    bmi,
    bloodType: safeEnum(preop.bloodType, ["A","B","AB","O"] as const),
    rhFactor:  safeEnum(preop.rhFactor,  ["POSITIVE","NEGATIVE"] as const),

    // Legacy string columns (kept for backward compatibility)
    diagnosis:        diagnosesArr.map((t: any) => t.label).join("; ") || "",
    plannedProcedure: proceduresArr.map((t: any) => t.label).join("; ") || "",
    // Item 26: JSON columns for structured diagnoses/procedures — use Prisma.JsonNull (not undefined) so Prisma clears the column when array is empty
    diagnosesJson:    diagnosesArr.length > 0 ? diagnosesArr : Prisma.JsonNull,
    proceduresJson:   proceduresArr.length > 0 ? proceduresArr : Prisma.JsonNull,
    icdCode:          diagnosesArr[0]?.sub ?? null,
    teamNotes:        preop.teamNotes ?? null,
    aiOptIn:          preop.aiOptIn   ?? false,

    comorbidities: preop.comorbidities ?? [],

    allergies:                preop.allergies                ?? false,
    allergyDetails:           Array.isArray(preop.allergyDetails)
      ? (preop.allergyDetails as any[]).map((t: any) => t.label).join(", ")
      : preop.allergyDetails ?? null,
    latexAllergy:             preop.latexAllergy             ?? false,
    currentMedications:       Array.isArray(preop.currentMedications)
      ? (preop.currentMedications as any[]).map((t: any) => t.label).join(", ")
      : preop.currentMedications ?? null,
    familyAnesthesiaProblems,
    familyAnesthesiaDetails,
    dentalProsthetics:        preop.dentalProsthetics        ?? false,
    looseTeeth:               preop.looseTeeth               ?? false,
    smoking:                  preop.smoking                  ?? false,
    substanceAbuse:           preop.substanceAbuse           ?? false,

    bpSystolic:       preop.bpSystolic      ?? null,
    bpDiastolic:      preop.bpDiastolic     ?? null,
    heartRate:        preop.heartRate       ?? null,
    heartArrhythmia:  preop.heartArrhythmia ?? false,
    spO2:             preop.spO2            ?? null,
    temperature:      preop.temperature     ?? null,
    respiratoryRate:  preop.respiratoryRate ?? null,

    mallampati:             preop.mallampati             ?? null,
    mouthOpeningCm:         preop.mouthOpeningCm         ?? null,
    thyromental:            preop.thyromental            ?? null,
    neckMobility:           preop.neckMobility           ?? null,
    upperLipBiteTest,
    retrognathia:           preop.retrognathia           ?? false,
    prominentIncisors:      preop.prominentIncisors      ?? false,
    facialHair:             preop.facialHair             ?? false,
    difficultAirwayHistory,
    difficultAirwayNotes:   preop.difficultAirwayNotes   ?? null,
    cormackLehane:          preop.cormackLehane          ?? null,

    asaScore:         preop.asaScore        ?? null,
    emergencySurgery: preop.emergencySurgery ?? false,
    highRiskSurgery:  preop.highRiskSurgery  ?? false,

    rcriIschemicHeart:  preop.rcriIschemicHeart  ?? false,
    rcriCHF:            preop.rcriCHF            ?? false,
    rcriCVD:            preop.rcriCVD            ?? false,
    rcriInsulinDM:      preop.rcriInsulinDM      ?? false,
    rcriCreatinine:     preop.rcriCreatinine     ?? false,

    rcriScore:    toIntOrNull(preop.rcriScore),
    gutaScore:    toFloatOrNull(preop.gutaScore),
    apfelScore:   toIntOrNull(preop.apfelScore),
    stopBangScore: toIntOrNull(preop.stopBangScore),

    apfelPONVHistory:   preop.apfelPONVHistory   ?? false,
    apfelPostopOpioids: preop.apfelPostopOpioids ?? false,

    stopbangSnoring:  preop.stopbangSnoring  ?? false,
    stopbangTired:    preop.stopbangTired    ?? false,
    stopbangObserved: preop.stopbangObserved ?? false,
    stopbangBP:       preop.stopbangBP       ?? false,
    stopbangNeck:     preop.stopbangNeck     ?? false,

    labResults: preop.labResults ?? [],
  }
}

function safeDate(s: string): Date {
  const d = new Date(s)
  return isNaN(d.getTime()) ? new Date() : d
}

// Item 21: Strict HH:MM validation — rejects invalid times like "25:90"
const HHMMRE = /^([01]\d|2[0-3]):([0-5]\d)$/
function toDateOnly(v: any): string {
  if (!v) return new Date().toISOString().split("T")[0]
  const s = String(v)
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // ISO datetime — take just the date part
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (m) return m[1]
  return new Date().toISOString().split("T")[0]
}

// Return v if it is one of the allowed values, otherwise null.
// Prevents empty strings / unknown values from breaking Prisma enum fields.
function safeEnum<T extends string>(v: any, allowed: readonly T[]): T | null {
  return allowed.includes(v) ? (v as T) : null
}

function toIntOrNull(v: any): number | null {
  if (v == null || v === "") return null
  const n = parseInt(String(v), 10)
  return isNaN(n) ? null : n
}

function toFloatOrNull(v: any): number | null {
  if (v == null || v === "") return null
  const n = parseFloat(String(v))
  return isNaN(n) ? null : n
}

// For UPDATE operations: only include fields that were explicitly present in the payload.
// Using mapIntraop for updates fills in ?? defaults for every missing field, silently
// overwriting existing DB data with zeros/empty arrays on every partial save.
export function mapIntraopUpdate(intraop: any) {
  const full = mapIntraop(intraop)
  const r: Partial<typeof full> = {}
  const has = (k: string) => k in intraop

  // Timing — only update when the relevant field was provided
  if (has("monthYear"))       r.monthYear       = full.monthYear
  if (has("startTime") || has("endTime") || has("endTimeNextDay")) {
    // Only write startTime when it is a real HH:MM — never overwrite with the sentinel 00:00 default
    if (has("startTime") && HHMMRE.test(intraop.startTime ?? "")) r.startTime = full.startTime
    if (has("endTime"))       r.endTime         = full.endTime
                              r.durationMinutes = full.durationMinutes
  }

  // Direct scalar fields
  const DIRECT = [
    "positions","techniques",
    "tubeSize","cuffed","peepCmH2O","airwayNotes","cormackLehane",
    "dltType","dltSide","dltSize","endobronchialSize",
    "volatileAgent","n2oPercent","o2Percent","n2oLitersPerMin","o2LitersPerMin",
    "fgfLitersPerMin","carrierGas","fio2Percent",
    "plexusBlock","cvkSite","arterialLineSite",
    "ecg","urinaryCatheter","stomachTube","spO2Monitor","invasiveBP","cvpMonitor",
    "bglMonitor","bloodGasMonitor","neuroMonitor","nbpMonitor","etco2Monitor",
    "tempMonitor","paCatheter","tee","bis","entropyMonitor","nirsMonitor",
    "evokedPotentials","tofMonitor",
    "vascularAccesses","premedicationEvening","premedicationMorning","drugsAdministered",
    "crystalloidsMl","colloidsMl","bloodMl","bloodProductsNote","urineMl","complications",
  ] as const
  for (const k of DIRECT) {
    if (has(k)) (r as any)[k] = (full as any)[k]
  }

  // Aliased source keys
  if (has("vitals"))       r.timeSeriesData = full.timeSeriesData
  if (has("timetableData")) r.keyEvents      = full.keyEvents

  // Computed from compound sources
  if (has("airwayTools") || has("fob")) r.airwayTools = full.airwayTools
  if (has("airwayDevices") || has("airwayDevice")) {
    r.airwayDevices = full.airwayDevices
    r.airwayDevice  = full.airwayDevice
  }
  if (has("ventilationModes")) {
    r.ventilationModes = full.ventilationModes
    r.ippv             = full.ippv
    r.jetVentilation   = full.jetVentilation
  } else {
    if (has("ippv"))           r.ippv           = full.ippv
    if (has("jetVentilation")) r.jetVentilation = full.jetVentilation
  }

  return r
}

export function mapIntraop(intraop: any) {
  // Use a stable reference date (2000-01-01) for startTime/endTime — only the HH:MM matters for the timetable.
  const REF_DATE = "2000-01-01"
  const isHHMM  = (s: any) => typeof s === "string" && HHMMRE.test(s)
  const toMins = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m }
  const endRefDate = (() => {
    const crossedMidnight = isHHMM(intraop.startTime) && isHHMM(intraop.endTime)
      && toMins(intraop.endTime) < toMins(intraop.startTime)
    if (!crossedMidnight && !intraop.endTimeNextDay) return REF_DATE
    const d = new Date(REF_DATE + "T12:00:00Z")
    d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString().split("T")[0]
  })()
  const durationMinutes = (() => {
    if (!isHHMM(intraop.startTime) || !isHHMM(intraop.endTime)) return intraop.durationMinutes ?? null
    let diff = toMins(intraop.endTime) - toMins(intraop.startTime)
    if (diff < 0) diff += 24 * 60
    return diff
  })()
  return {
    monthYear:       intraop.monthYear ?? null,
    durationMinutes: durationMinutes,
    startTime: isHHMM(intraop.startTime) ? new Date(`${REF_DATE}T${intraop.startTime}:00.000Z`)    : new Date(`${REF_DATE}T00:00:00.000Z`),
    endTime:   isHHMM(intraop.endTime)   ? new Date(`${endRefDate}T${intraop.endTime}:00.000Z`)   : null,
    positions:       intraop.positions        ?? [],
    techniques:      intraop.techniques       ?? [],
    tubeSize:        intraop.tubeSize        ?? null,
    cuffed:          intraop.cuffed          ?? null,
    peepCmH2O:       intraop.peepCmH2O       ?? null,
    airwayTools: (() => {
      const tools: string[] = Array.isArray(intraop.airwayTools) ? intraop.airwayTools : []
      // Back-compat: if legacy fob=true, include "FOB" in tools
      if (intraop.fob && !tools.includes("FOB")) return [...tools, "FOB"]
      return tools
    })(),
    airwayNotes:     intraop.airwayNotes     ?? null,
    cormackLehane:   safeEnum(intraop.cormackLehane, ["I","IIa","IIb","III","IV"] as const),
    airwayDevices:   Array.isArray(intraop.airwayDevices)    ? intraop.airwayDevices    : [],
    ventilationModes:Array.isArray(intraop.ventilationModes) ? intraop.ventilationModes : [],
    dltType:         intraop.dltType         ?? null,
    dltSide:         intraop.dltSide         ?? null,
    dltSize:         intraop.dltSize         ?? null,
    endobronchialSize: intraop.endobronchialSize ?? null,
    // Legacy scalar fields derived from new JSON arrays for backwards compat
    airwayDevice: safeEnum(
      (() => {
        const devs: string[] = Array.isArray(intraop.airwayDevices) ? intraop.airwayDevices : []
        const VALID = ["FACE_MASK","LMA","ORAL_ETT","NASAL_ETT","SURGICAL_AIRWAY"] as const
        return devs.find((d: string) => (VALID as readonly string[]).includes(d)) ?? intraop.airwayDevice ?? null
      })(),
      ["FACE_MASK","LMA","ORAL_ETT","NASAL_ETT","SURGICAL_AIRWAY"] as const
    ),
    ippv:            Array.isArray(intraop.ventilationModes)
      ? (intraop.ventilationModes as string[]).some((m: string) => !["Spontaneous","Jet"].includes(m))
      : (intraop.ippv ?? false),
    jetVentilation:  Array.isArray(intraop.ventilationModes)
      ? (intraop.ventilationModes as string[]).includes("Jet")
      : (intraop.jetVentilation ?? false),
    volatileAgent:   safeEnum(intraop.volatileAgent,   ["SEVOFLURANE","DESFLURANE","ISOFLURANE"] as const),
    n2oPercent:      intraop.n2oPercent      ?? null,
    o2Percent:       intraop.o2Percent       ?? null,
    n2oLitersPerMin: intraop.n2oLitersPerMin ?? null,
    o2LitersPerMin:  intraop.o2LitersPerMin  ?? null,
    fgfLitersPerMin: toFloatOrNull(intraop.fgfLitersPerMin),
    carrierGas:      intraop.carrierGas === "air" || intraop.carrierGas === "n2o" ? intraop.carrierGas : null,
    fio2Percent:     toFloatOrNull(intraop.fio2Percent),
    plexusBlock:     safeEnum(intraop.plexusBlock, ["AXILLARY","INTERSCALENE","SUPRACLAVICULAR","INFRACLAVICULAR","FEMORAL","SCIATIC","POPLITEAL","TAP","ERECTOR_SPINAE"] as const),
    cvkSite:         safeEnum(intraop.cvkSite, ["INTERNAL_JUGULAR","EXTERNAL_JUGULAR","SUBCLAVIAN","FEMORAL"] as const),
    arterialLineSite:safeEnum(intraop.arterialLineSite, ["RADIAL","DORSALIS_PEDIS","FEMORAL","BRACHIAL"] as const),
    ecg:              intraop.ecg              ?? false,
    urinaryCatheter:  intraop.urinaryCatheter  ?? false,
    stomachTube:      intraop.stomachTube      ?? false,
    spO2Monitor:      intraop.spO2Monitor      ?? true,
    invasiveBP:       intraop.invasiveBP       ?? false,
    cvpMonitor:       intraop.cvpMonitor       ?? false,
    bglMonitor:       intraop.bglMonitor       ?? false,
    bloodGasMonitor:  intraop.bloodGasMonitor  ?? false,
    neuroMonitor:     intraop.neuroMonitor     ?? false,
    nbpMonitor:       intraop.nbpMonitor       ?? true,
    etco2Monitor:     intraop.etco2Monitor     ?? false,
    tempMonitor:      intraop.tempMonitor      ?? false,
    paCatheter:       intraop.paCatheter       ?? false,
    tee:              intraop.tee              ?? false,
    bis:              intraop.bis              ?? false,
    entropyMonitor:   intraop.entropyMonitor   ?? false,
    nirsMonitor:      intraop.nirsMonitor      ?? false,
    evokedPotentials: intraop.evokedPotentials ?? false,
    tofMonitor:       intraop.tofMonitor       ?? false,
    vascularAccesses:  intraop.vascularAccesses ?? [],
    premedicationEvening: intraop.premedicationEvening ?? null,
    premedicationMorning: intraop.premedicationMorning ?? null,
    drugsAdministered: intraop.drugsAdministered ?? [],
    timeSeriesData:    intraop.vitals            ?? [],
    keyEvents:         intraop.timetableData     ?? null,
    crystalloidsMl:    intraop.crystalloidsMl    ?? null,
    colloidsMl:        intraop.colloidsMl        ?? null,
    bloodMl:           intraop.bloodMl           ?? null,
    bloodProductsNote: intraop.bloodProductsNote ?? null,
    urineMl:           intraop.urineMl           ?? null,
    complications:     intraop.complications     ?? null,
  }
}

// For UPDATE operations: only include fields explicitly present (and not undefined)
// in the payload. Using mapPreop for updates fills in ?? null / ?? false defaults
// for every missing field, silently wiping existing preop data on any partial or
// stale save (e.g. a replayed offline snapshot). Mirrors mapIntraopUpdate.
export function mapPreopUpdate(preop: any) {
  const full = mapPreop(preop)
  const r: Partial<typeof full> = {}
  // "Present" means the key exists AND is not undefined. Form snapshots send
  // undefined for unfilled optional fields, so undefined keys must be skipped.
  const has = (k: string) => k in preop && preop[k] !== undefined

  // Direct fields: source key name === output key name
  const DIRECT = [
    "ageYears", "sex", "heightCm", "weightKg", "bloodType", "rhFactor",
    "teamNotes", "aiOptIn", "comorbidities",
    "allergies", "allergyDetails", "latexAllergy", "currentMedications",
    "dentalProsthetics", "looseTeeth", "smoking", "substanceAbuse",
    "bpSystolic", "bpDiastolic", "heartRate", "heartArrhythmia", "spO2", "temperature", "respiratoryRate",
    "mallampati", "mouthOpeningCm", "thyromental", "neckMobility",
    "retrognathia", "prominentIncisors", "facialHair", "difficultAirwayNotes", "cormackLehane",
    "asaScore", "emergencySurgery", "highRiskSurgery",
    "rcriIschemicHeart", "rcriCHF", "rcriCVD", "rcriInsulinDM", "rcriCreatinine",
    "rcriScore", "gutaScore", "apfelScore", "stopBangScore",
    "apfelPONVHistory", "apfelPostopOpioids",
    "stopbangSnoring", "stopbangTired", "stopbangObserved", "stopbangBP", "stopbangNeck",
    "labResults",
  ] as const
  for (const k of DIRECT) {
    if (has(k)) (r as any)[k] = (full as any)[k]
  }

  // Computed / aliased fields — include when any contributing source key is present
  if (has("heightCm") || has("weightKg") || has("bmi")) r.bmi = full.bmi
  if (has("diagnoses")) {
    r.diagnosis      = full.diagnosis
    r.diagnosesJson  = full.diagnosesJson
    r.icdCode        = full.icdCode
  }
  if (has("procedures")) {
    r.plannedProcedure = full.plannedProcedure
    r.proceduresJson   = full.proceduresJson
  }
  if (has("familyAnesthesiaProblems") || has("familyProblems"))      r.familyAnesthesiaProblems = full.familyAnesthesiaProblems
  if (has("familyAnesthesiaDetails")  || has("familyProblemNotes"))  r.familyAnesthesiaDetails  = full.familyAnesthesiaDetails
  if (has("upperLipBiteTest") || has("ulbt"))                        r.upperLipBiteTest         = full.upperLipBiteTest
  if (has("difficultAirwayHistory") || has("difficultAirway"))       r.difficultAirwayHistory   = full.difficultAirwayHistory

  return r
}

// For UPDATE operations: same partial-update semantics as mapPreopUpdate.
export function mapPostopUpdate(postop: any) {
  const full = mapPostop(postop)
  const r: Partial<typeof full> = {}
  const has = (k: string) => k in postop && postop[k] !== undefined

  const DIRECT = [
    "recoveryBpSystolic", "recoveryBpDiastolic", "recoveryHeartRate", "recoverySpO2",
    "painScoreNRS", "ponv", "complications", "handoverItems", "disposition", "dispositionNotes",
  ] as const
  for (const k of DIRECT) {
    if (has(k)) (r as any)[k] = (full as any)[k]
  }

  // Aldrete subscores + total — recompute the total whenever any subscore is present
  const aldreteKeys = ["aldreteActivity", "aldreteRespiration", "aldreteCirculation",
    "aldreteConsciousness", "aldreteSpO2", "activityScore", "respirationScore",
    "circulationScore", "consciousnessScore", "spO2Score"]
  if (aldreteKeys.some(has) || has("aldreteTotal")) {
    if (has("aldreteActivity") || has("activityScore"))           r.aldreteActivity      = full.aldreteActivity
    if (has("aldreteRespiration") || has("respirationScore"))     r.aldreteRespiration   = full.aldreteRespiration
    if (has("aldreteCirculation") || has("circulationScore"))     r.aldreteCirculation   = full.aldreteCirculation
    if (has("aldreteConsciousness") || has("consciousnessScore")) r.aldreteConsciousness = full.aldreteConsciousness
    if (has("aldreteSpO2") || has("spO2Score"))                   r.aldreteSpO2          = full.aldreteSpO2
    r.aldreteTotal = full.aldreteTotal
  }

  if (has("temperatureCelsius") || has("temperaturePostop")) r.temperatureCelsius = full.temperatureCelsius

  return r
}

export function mapPostop(postop: any) {
  const aldreteActivity = postop.aldreteActivity ?? postop.activityScore
  const aldreteRespiration = postop.aldreteRespiration ?? postop.respirationScore
  const aldreteCirculation = postop.aldreteCirculation ?? postop.circulationScore
  const aldreteConsciousness = postop.aldreteConsciousness ?? postop.consciousnessScore
  const aldreteSpO2 = postop.aldreteSpO2 ?? postop.spO2Score
  const aldreteTotal =
    postop.aldreteTotal != null ? toIntOrNull(postop.aldreteTotal)
    : aldreteActivity != null
      ? [aldreteActivity, aldreteRespiration,
         aldreteCirculation, aldreteConsciousness, aldreteSpO2]
          .reduce((s: number, v: any) => s + (parseInt(String(v ?? 0), 10) || 0), 0)
      : null

  return {
    aldreteActivity:      toIntOrNull(aldreteActivity),
    aldreteRespiration:   toIntOrNull(aldreteRespiration),
    aldreteCirculation:   toIntOrNull(aldreteCirculation),
    aldreteConsciousness: toIntOrNull(aldreteConsciousness),
    aldreteSpO2:          toIntOrNull(aldreteSpO2),
    aldreteTotal,
    recoveryBpSystolic:  toIntOrNull(postop.recoveryBpSystolic),
    recoveryBpDiastolic: toIntOrNull(postop.recoveryBpDiastolic),
    recoveryHeartRate:   toIntOrNull(postop.recoveryHeartRate),
    recoverySpO2:        toFloatOrNull(postop.recoverySpO2),
    painScoreNRS:       toIntOrNull(postop.painScoreNRS),
    ponv:               postop.ponv               ?? false,
    temperatureCelsius: toFloatOrNull(postop.temperatureCelsius ?? postop.temperaturePostop),
    complications:      postop.complications      ?? null,
    handoverItems:      postop.handoverItems      ?? [],
    disposition:        postop.disposition        ?? null,
    dispositionNotes:   postop.dispositionNotes   ?? null,
  }
}
