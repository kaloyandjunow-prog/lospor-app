// Canonical shape of GET /api/cases/[id]'s JSON response — the one place
// every consumer (CaseSummary, the print page, OMOP export, etc.)
// should import from instead of re-guessing the shape via `any`.
//
// Hand-written rather than derived from Prisma.CaseGetPayload<...> because
// this is the shape AFTER NextResponse.json() round-trips it: DateTime
// columns become ISO strings, not Date objects, which Prisma's generated
// types don't reflect.
//
// The free-form Json columns (diagnosesJson, comorbidities, labResults,
// vascularAccesses, positions/techniques/airwayDevices/ventilationModes,
// drugsAdministered, keyEvents, handoverItems) are typed as `unknown[]` /
// `unknown` here — they're genuinely unstructured at the DB level (Prisma
// Json columns have no schema), so a consumer that needs to render their
// contents casts locally at the point of use, same as relational-sync.ts and
// omop-mapper.ts already do for the same fields. keyEvents specifically is
// the TimetableData + log shape from src/types/timetable.ts.

import type {
  Sex, BloodType, RhFactor, MallampatiClass, NeckMobility, UpperLipBiteTest,
  CormackLehane, ASAScore, AirwayDevice, VolatileAgent, CVKSite,
  ArterialLineSite, PlexusBlock, Disposition, CaseStatus,
} from "@/generated/prisma/enums"

export type CaseDetailPreop = {
  id: string
  caseId: string
  ageYears: number | null
  sex: Sex
  heightCm: number | null
  weightKg: number | null
  bmi: number | null
  bloodType: BloodType | null
  rhFactor: RhFactor | null

  diagnosis: string
  diagnosesJson: unknown
  plannedProcedure: string
  proceduresJson: unknown
  icdCode: string | null
  teamNotes: string | null

  comorbidities: unknown

  allergies: boolean
  allergyDetails: string | null
  latexAllergy: boolean
  currentMedications: string | null
  familyAnesthesiaProblems: boolean
  familyAnesthesiaDetails: string | null
  dentalProsthetics: boolean
  looseTeeth: boolean
  smoking: boolean
  substanceAbuse: boolean

  bpSystolic: number | null
  bpDiastolic: number | null
  heartRate: number | null
  heartArrhythmia: boolean
  spO2: number | null
  temperature: number | null
  respiratoryRate: number | null
  bpUnobtainable: boolean
  heartRateUnobtainable: boolean
  spO2Unobtainable: boolean
  temperatureUnobtainable: boolean
  respiratoryRateUnobtainable: boolean

  mallampati: MallampatiClass | null
  mouthOpeningCm: number | null
  thyromental: number | null
  neckMobility: NeckMobility | null
  upperLipBiteTest: UpperLipBiteTest | null
  retrognathia: boolean
  prominentIncisors: boolean
  facialHair: boolean
  difficultAirwayHistory: boolean
  difficultAirwayNotes: string | null
  cormackLehane: CormackLehane | null
  airwayUnobtainable: boolean

  asaScore: ASAScore | null
  elective: boolean
  emergencySurgery: boolean
  highRiskSurgery: boolean

  rcriIschemicHeart: boolean
  rcriCHF: boolean
  rcriCVD: boolean
  rcriInsulinDM: boolean
  rcriCreatinine: boolean

  rcriScore: number | null
  gutaScore: number | null
  apfelScore: number | null
  stopBangScore: number | null

  apfelPONVHistory: boolean
  apfelPostopOpioids: boolean

  stopbangSnoring: boolean
  stopbangTired: boolean
  stopbangObserved: boolean
  stopbangBP: boolean
  stopbangNeck: boolean

  labResults: unknown
  aiOptIn: boolean

  createdAt: string
  updatedAt: string
}

export type CaseDetailIntraop = {
  id: string
  caseId: string

  monthYear: string | null
  durationMinutes: number | null

  // Legacy bare wall clock ("08:00" on a dummy date, no zone). Null when the
  // case has not been started — it used to be a fabricated midnight, which read
  // downstream as a real start time.
  startTime: string | null
  endTime: string | null

  // The real instants, and the zone they were entered in.
  startedAt?: string | null
  endedAt?: string | null
  timezone?: string | null

  positions: unknown
  techniques: unknown
  airwayDevice: AirwayDevice | null
  tubeSize: number | null
  cuffed: boolean | null
  peepCmH2O: number | null
  ippv: boolean
  jetVentilation: boolean
  fob: boolean
  airwayTools: unknown
  airwayNotes: string | null
  cormackLehane: CormackLehane | null
  airwayDevices: unknown
  ventilationModes: unknown
  lmaSize: number | null
  oralTubeSize: number | null
  oralCuffed: boolean | null
  nasalTubeSize: number | null
  nasalCuffed: boolean | null
  dltType: string | null
  dltSide: string | null
  dltSize: number | null
  endobronchialSize: number | null

  volatileAgent: VolatileAgent | null

  plexusBlock: PlexusBlock | null
  cvkSite: CVKSite | null
  arterialLineSite: ArterialLineSite | null

  ecg: boolean
  urinaryCatheter: boolean
  stomachTube: boolean
  spO2Monitor: boolean
  invasiveBP: boolean
  cvpMonitor: boolean
  bglMonitor: boolean
  bloodGasMonitor: boolean
  neuroMonitor: boolean
  nbpMonitor: boolean
  etco2Monitor: boolean
  tempMonitor: boolean
  paCatheter: boolean
  tee: boolean
  bis: boolean
  entropyMonitor: boolean
  nirsMonitor: boolean
  evokedPotentials: boolean
  tofMonitor: boolean

  vascularAccesses: unknown

  premedicationEvening: string | null
  premedicationMorning: string | null

  drugsAdministered: unknown

  crystalloidsMl: number | null
  colloidsMl: number | null
  bloodMl: number | null
  bloodProductsNote: string | null
  urineMl: number | null

  timeSeriesData: unknown
  keyEvents: unknown
  complications: string | null

  createdAt: string
  updatedAt: string
}

export type CaseDetailPostop = {
  id: string
  caseId: string

  aldreteActivity: number | null
  aldreteRespiration: number | null
  aldreteCirculation: number | null
  aldreteConsciousness: number | null
  aldreteSpO2: number | null
  aldreteTotal: number | null

  recoveryBpSystolic: number | null
  recoveryBpDiastolic: number | null
  recoveryHeartRate: number | null
  recoverySpO2: number | null
  painScoreNRS: number | null
  ponv: boolean
  temperatureCelsius: number | null
  recoveryBpUnobtainable: boolean
  recoveryHeartRateUnobtainable: boolean
  recoverySpO2Unobtainable: boolean
  recoveryTemperatureUnobtainable: boolean

  complications: string | null
  disposition: Disposition | null
  dispositionNotes: string | null
  handoverItems: unknown

  createdAt: string
  updatedAt: string
}

export type CaseDetail = {
  id: string
  caseCode: string | null
  notes: string | null
  userId: string
  institutionId: string | null
  status: CaseStatus
  finalizedAt: string | null
  createdAt: string
  updatedAt: string

  preop: CaseDetailPreop | null
  intraop: CaseDetailIntraop | null
  postop: CaseDetailPostop | null
  institution: { name: string; city: string } | null
}

// Recursively maps Date -> string, matching what a Prisma query result looks
// like after NextResponse.json() round-trips it. Used at the GET route with
// `satisfies CaseDetail` so a Prisma schema change that isn't reflected here
// fails to compile, instead of silently drifting.
export type Serialized<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Serialized<U>[]
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T
