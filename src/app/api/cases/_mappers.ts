// Shared data-mapping helpers for POST and PATCH case routes

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
    // Item 26: JSON columns for structured diagnoses/procedures
    diagnosesJson:    diagnosesArr.length > 0 ? diagnosesArr : undefined,
    proceduresJson:   proceduresArr.length > 0 ? proceduresArr : undefined,
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
    rcriScore:    toIntOrNull(preop.rcriScore),
    gutaScore:    toFloatOrNull(preop.gutaScore),
    apfelScore:   toIntOrNull(preop.apfelScore),
    stopBangScore: toIntOrNull(preop.stopBangScore),

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
    painScoreNRS:       toIntOrNull(postop.painScoreNRS),
    ponv:               postop.ponv               ?? false,
    temperatureCelsius: toFloatOrNull(postop.temperatureCelsius ?? postop.temperaturePostop),
    timeInRecoveryMin:  toIntOrNull(postop.timeInRecoveryMin ?? postop.timeInPacuMin),
    complications:      postop.complications      ?? null,
    handoverItems:      postop.handoverItems      ?? [],
    disposition:        postop.disposition        ?? null,
    dispositionNotes:   postop.dispositionNotes   ?? null,
  }
}
