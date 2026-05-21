// Shared data-mapping helpers for POST and PATCH case routes

export function mapPreop(preop: any) {
  return {
    ageYears:  preop.ageYears  ?? 0,
    sex:       preop.sex ?? "OTHER",
    heightCm:  preop.heightCm  ?? 0,
    weightKg:  preop.weightKg  ?? 0,
    bmi:       preop.bmi       ?? 0,
    bloodType: safeEnum(preop.bloodType, ["A","B","AB","O"] as const),
    rhFactor:  safeEnum(preop.rhFactor,  ["POSITIVE","NEGATIVE"] as const),

    diagnosis:        (preop.diagnoses  as any[])?.map((t: any) => t.label).join("; ") || "",
    plannedProcedure: (preop.procedures as any[])?.map((t: any) => t.label).join("; ") || "",
    icdCode:          (preop.diagnoses  as any[])?.[0]?.sub ?? null,
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
    familyAnesthesiaProblems: preop.familyAnesthesiaProblems ?? false,
    familyAnesthesiaDetails:  preop.familyAnesthesiaDetails  ?? null,
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
    upperLipBiteTest:       preop.upperLipBiteTest       ?? null,
    retrognathia:           preop.retrognathia           ?? false,
    prominentIncisors:      preop.prominentIncisors      ?? false,
    facialHair:             preop.facialHair             ?? false,
    difficultAirwayHistory: preop.difficultAirwayHistory ?? false,
    difficultAirwayNotes:   preop.difficultAirwayNotes   ?? null,
    cormackLehane:          preop.cormackLehane          ?? null,

    asaScore:         preop.asaScore        ?? null,
    emergencySurgery: preop.emergencySurgery ?? false,
    rcriScore:    null,
    gutaScore:    null,
    apfelScore:   null,
    stopBangScore: null,

    labResults: preop.labResults ?? [],
  }
}

function safeDate(s: string): Date {
  const d = new Date(s)
  return isNaN(d.getTime()) ? new Date() : d
}

const HHMMRE = /^\d{2}:\d{2}$/
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
    startTime: isHHMM(intraop.startTime) ? safeDate(`${REF_DATE}T${intraop.startTime}`)    : safeDate(REF_DATE),
    endTime:   isHHMM(intraop.endTime)   ? safeDate(`${endRefDate}T${intraop.endTime}`)   : null,
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
  const aldreteTotal =
    postop.aldreteActivity != null
      ? [postop.aldreteActivity, postop.aldreteRespiration,
         postop.aldreteCirculation, postop.aldreteConsciousness, postop.aldreteSpO2]
          .reduce((s: number, v: any) => s + (parseInt(String(v ?? 0), 10) || 0), 0)
      : null

  return {
    aldreteActivity:      toIntOrNull(postop.aldreteActivity),
    aldreteRespiration:   toIntOrNull(postop.aldreteRespiration),
    aldreteCirculation:   toIntOrNull(postop.aldreteCirculation),
    aldreteConsciousness: toIntOrNull(postop.aldreteConsciousness),
    aldreteSpO2:          toIntOrNull(postop.aldreteSpO2),
    aldreteTotal,
    painScoreNRS:       toIntOrNull(postop.painScoreNRS),
    ponv:               postop.ponv               ?? false,
    temperatureCelsius: toFloatOrNull(postop.temperatureCelsius),
    timeInRecoveryMin:  toIntOrNull(postop.timeInRecoveryMin),
    complications:      postop.complications      ?? null,
    handoverItems:      postop.handoverItems      ?? [],
    disposition:        postop.disposition        ?? null,
    dispositionNotes:   postop.dispositionNotes   ?? null,
  }
}
