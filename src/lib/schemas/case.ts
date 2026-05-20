import { z } from "zod"

const labelledItem = z.object({
  label:  z.string(),
  sub:    z.string().optional(),
  system: z.string().optional(),
}).passthrough()

export const preopSchema = z.object({
  ageYears:  z.number().int().min(0).max(120).optional(),
  sex:       z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  heightCm:  z.number().min(30).max(280).optional(),
  weightKg:  z.number().min(0.5).max(600).optional(),
  bmi:       z.number().min(5).max(100).optional(),
  bloodType: z.enum(["A", "B", "AB", "O"]).nullable().optional(),
  rhFactor:  z.enum(["POSITIVE", "NEGATIVE"]).nullable().optional(),

  diagnosis:            z.string().max(1000).optional(),
  diagnoses:            z.array(labelledItem).optional(),
  plannedProcedure:     z.string().max(1000).optional(),
  procedures:           z.array(labelledItem).optional(),
  icdCode:              z.string().max(20).nullable().optional(),
  surgeonName:          z.string().max(200).nullable().optional(),
  anesthesiologistName: z.string().max(200).nullable().optional(),
  anesthesiaNurseName:  z.string().max(200).nullable().optional(),

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

  bpSystolic:      z.number().int().min(40).max(350).nullable().optional(),
  bpDiastolic:     z.number().int().min(20).max(200).nullable().optional(),
  heartRate:       z.number().int().min(10).max(400).nullable().optional(),
  heartArrhythmia: z.boolean().optional(),
  spO2:            z.number().min(50).max(100).nullable().optional(),
  temperature:     z.number().min(30).max(45).nullable().optional(),
  respiratoryRate: z.number().int().min(1).max(100).nullable().optional(),

  mallampati:             z.enum(["I", "II", "III", "IV"]).nullable().optional(),
  mouthOpeningCm:         z.number().min(0).max(15).nullable().optional(),
  thyromental:            z.number().min(0).max(20).nullable().optional(),
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
  rcriScore:       z.number().int().min(0).max(6).nullable().optional(),
  gutaScore:       z.number().min(0).max(100).nullable().optional(),
  apfelScore:      z.number().int().min(0).max(4).nullable().optional(),
  stopBangScore:   z.number().int().min(0).max(8).nullable().optional(),

  labResults: z.array(z.record(z.string(), z.unknown())).optional(),
}).passthrough()

export const intraopSchema = z.object({
  date:      z.string().optional(),
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

export const postopSchema = z.object({
  aldreteActivity:      z.number().int().min(0).max(2).nullable().optional(),
  aldreteRespiration:   z.number().int().min(0).max(2).nullable().optional(),
  aldreteCirculation:   z.number().int().min(0).max(2).nullable().optional(),
  aldreteConsciousness: z.number().int().min(0).max(2).nullable().optional(),
  aldreteSpO2:          z.number().int().min(0).max(2).nullable().optional(),
  aldreteTotal:         z.number().int().min(0).max(10).nullable().optional(),

  painScoreNRS:       z.number().int().min(0).max(10).nullable().optional(),
  ponv:               z.boolean().optional(),
  temperatureCelsius: z.number().min(30).max(45).nullable().optional(),
  timeInRecoveryMin:  z.number().int().min(0).max(1440).nullable().optional(),

  complications:    z.string().max(2000).nullable().optional(),
  disposition:      z.enum(["WARD", "PACU", "ICU"]).nullable().optional(),
  dispositionNotes: z.string().max(1000).nullable().optional(),
  handoverItems:    z.array(z.unknown()).optional(),
}).passthrough()
