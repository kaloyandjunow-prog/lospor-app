import { z } from "zod"

// Accepts number, string, or null/undefined from HTML inputs; coerces to number or null.
// z.preprocess runs before type checking, so it handles all input forms safely.
const coerceNum = z.preprocess(
  v => (v === "" || v === null || v === undefined) ? null : Number(v),
  z.number().nullable().optional()
)
const coerceInt = z.preprocess(
  v => (v === "" || v === null || v === undefined) ? null : parseInt(String(v), 10),
  z.number().int().nullable().optional()
)

// Item 26: Canonical format for diagnoses/procedures — { label, code?, sub?, system? }
const labelledItem = z.object({
  label:  z.string(),
  code:   z.string().optional(),
  sub:    z.string().optional(),
  system: z.string().optional(),
}).passthrough()

export const preopSchema = z.object({
  ageYears:  coerceInt,
  sex:       z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  heightCm:  coerceNum,
  weightKg:  coerceNum,
  bmi:       coerceNum,
  bloodType: z.enum(["A", "B", "AB", "O"]).nullable().optional(),
  rhFactor:  z.enum(["POSITIVE", "NEGATIVE"]).nullable().optional(),

  diagnosis:            z.string().max(1000).optional(),
  diagnoses:            z.array(labelledItem).optional(),
  plannedProcedure:     z.string().max(1000).optional(),
  procedures:           z.array(labelledItem).optional(),
  icdCode:              z.string().max(20).nullable().optional(),
  teamNotes:            z.string().max(500).nullable().optional(),
  aiOptIn:              z.boolean().optional(),

  comorbidities: z.array(labelledItem).optional(),

  allergies:                z.boolean().optional(),
  allergyDetails:           z.union([z.string(), z.array(labelledItem)]).optional(),
  latexAllergy:             z.boolean().optional(),
  currentMedications:       z.union([z.string(), z.array(labelledItem)]).optional(),
  familyAnesthesiaProblems: z.boolean().optional(),
  familyAnesthesiaDetails:  z.string().max(1000).nullable().optional(),
  dentalProsthetics:        z.boolean().optional(),
  looseTeeth:               z.boolean().optional(),
  smoking:                  z.boolean().optional(),
  substanceAbuse:           z.boolean().optional(),

  bpSystolic:      coerceInt,
  bpDiastolic:     coerceInt,
  heartRate:       coerceInt,
  heartArrhythmia: z.boolean().optional(),
  spO2:            coerceNum,
  temperature:     coerceNum,
  respiratoryRate: coerceInt,

  mallampati:             z.enum(["I", "II", "III", "IV"]).nullable().optional(),
  mouthOpeningCm:         coerceNum,
  thyromental:            coerceNum,
  neckMobility:           z.enum(["FULL", "LIMITED", "FIXED"]).nullable().optional(),
  upperLipBiteTest:       z.enum(["CLASS_I", "CLASS_II", "CLASS_III"]).nullable().optional(),
  retrognathia:           z.boolean().optional(),
  prominentIncisors:      z.boolean().optional(),
  facialHair:             z.boolean().optional(),
  difficultAirwayHistory: z.boolean().optional(),
  difficultAirwayNotes:   z.string().max(1000).nullable().optional(),
  cormackLehane:          z.enum(["I", "IIa", "IIb", "III", "IV"]).nullable().optional(),

  asaScore:        z.enum(["I", "II", "III", "IV", "V", "VI"]).nullable().optional(),
  emergencySurgery: z.boolean().optional(),
  rcriScore:       coerceInt,
  gutaScore:       coerceNum,
  apfelScore:      coerceInt,
  stopBangScore:   coerceInt,

  // Item 27: Strict lab result shape matching the lab scan extractor output
  labResults: z.array(z.object({
    test:  z.string(),
    value: z.string(),
    unit:  z.string().optional(),
    flag:  z.string().optional(),
  })).optional(),
}).passthrough()

export const intraopSchema = z.object({
  monthYear:       z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  durationMinutes: z.number().int().min(0).max(1440).optional(),
  startTime: z.string().optional(),
  endTime:   z.string().nullable().optional(),

  positions:  z.array(z.unknown()).optional(),
  techniques: z.array(z.unknown()).optional(),

  airwayDevice:   z.enum(["FACE_MASK", "LMA", "ORAL_ETT", "NASAL_ETT", "SURGICAL_AIRWAY"]).nullable().optional(),
  tubeSize:       z.number().min(2).max(12).nullable().optional(),
  cuffed:         z.boolean().nullable().optional(),
  peepCmH2O:      z.number().min(0).max(40).nullable().optional(),
  ippv:           z.boolean().optional(),
  jetVentilation: z.boolean().optional(),
  fob:            z.boolean().optional(),
  airwayTools:      z.array(z.unknown()).optional(),
  airwayNotes:      z.string().max(2000).nullable().optional(),
  cormackLehane:    z.enum(["I", "IIa", "IIb", "III", "IV"]).nullable().optional(),
  airwayDevices:    z.array(z.unknown()).optional(),
  ventilationModes: z.array(z.unknown()).optional(),
  dltType:          z.string().max(50).nullable().optional(),
  dltSide:          z.string().max(20).nullable().optional(),
  dltSize:          z.number().min(20).max(50).nullable().optional(),
  endobronchialSize: z.number().min(2).max(10).nullable().optional(),

  volatileAgent:   z.enum(["SEVOFLURANE", "DESFLURANE", "ISOFLURANE"]).nullable().optional(),
  n2oPercent:      z.number().min(0).max(100).nullable().optional(),
  o2Percent:       z.number().min(0).max(100).nullable().optional(),
  n2oLitersPerMin: z.number().min(0).max(20).nullable().optional(),
  o2LitersPerMin:  z.number().min(0).max(20).nullable().optional(),

  plexusBlock:      z.enum(["AXILLARY", "INTERSCALENE", "SUPRACLAVICULAR", "INFRACLAVICULAR", "FEMORAL", "SCIATIC", "POPLITEAL", "TAP", "ERECTOR_SPINAE"]).nullable().optional(),
  cvkSite:          z.enum(["INTERNAL_JUGULAR", "EXTERNAL_JUGULAR", "SUBCLAVIAN", "FEMORAL"]).nullable().optional(),
  arterialLineSite: z.enum(["RADIAL", "DORSALIS_PEDIS", "FEMORAL", "BRACHIAL"]).nullable().optional(),

  ecg: z.boolean().optional(), urinaryCatheter: z.boolean().optional(), stomachTube: z.boolean().optional(),
  spO2Monitor: z.boolean().optional(), invasiveBP: z.boolean().optional(), cvpMonitor: z.boolean().optional(),
  bglMonitor: z.boolean().optional(), bloodGasMonitor: z.boolean().optional(), neuroMonitor: z.boolean().optional(),
  nbpMonitor: z.boolean().optional(), etco2Monitor: z.boolean().optional(), tempMonitor: z.boolean().optional(),
  paCatheter: z.boolean().optional(), tee: z.boolean().optional(), bis: z.boolean().optional(),
  entropyMonitor: z.boolean().optional(), nirsMonitor: z.boolean().optional(), evokedPotentials: z.boolean().optional(),
  tofMonitor: z.boolean().optional(),

  vascularAccesses:     z.array(z.unknown()).optional(),
  premedicationEvening: z.string().max(500).nullable().optional(),
  premedicationMorning: z.string().max(500).nullable().optional(),
  drugsAdministered:    z.array(z.unknown()).optional(),

  crystalloidsMl:    z.number().int().min(0).max(50000).nullable().optional(),
  colloidsMl:        z.number().int().min(0).max(20000).nullable().optional(),
  bloodMl:           z.number().int().min(0).max(20000).nullable().optional(),
  bloodProductsNote: z.string().max(1000).nullable().optional(),
  urineMl:           z.number().int().min(0).max(20000).nullable().optional(),

  timeSeriesData: z.array(z.unknown()).optional(),
  keyEvents:      z.array(z.unknown()).optional(),
  complications:  z.string().max(2000).nullable().optional(),
}).passthrough()

// Item 25: Aldrete subscores are always 0, 1, or 2; reject out-of-range values
const aldreteSubscore = z.preprocess(
  v => (v === "" || v === null || v === undefined) ? null : parseInt(String(v), 10),
  z.number().int().min(0).max(2).nullable().optional()
)

export const postopSchema = z.object({
  aldreteActivity:      aldreteSubscore,
  aldreteRespiration:   aldreteSubscore,
  aldreteCirculation:   aldreteSubscore,
  aldreteConsciousness: aldreteSubscore,
  aldreteSpO2:          aldreteSubscore,
  aldreteTotal:         coerceInt,

  painScoreNRS:       coerceInt,
  ponv:               z.boolean().optional(),
  temperatureCelsius: coerceNum,
  timeInRecoveryMin:  coerceInt,

  complications:    z.string().max(2000).nullable().optional(),
  disposition:      z.enum(["WARD", "PACU", "ICU"]).nullable().optional(),
  dispositionNotes: z.string().max(1000).nullable().optional(),
  handoverItems:    z.array(z.unknown()).optional(),
}).passthrough()
