// Preop/postop numeric picker range specs — one OptionLibrary row per category,
// the actual min/max/step/unit carried in metadata (same pattern INTRAOP_INFUSION
// already uses). Single source of truth for both apps' NumberStepper/VitalStepper/
// ClinicalNumberInput props, instead of each hand-typing its own literals.
export const NUMERIC_RANGES: Record<string, { min: number; max: number; step: number; unit: string }> = {
  AGE_RANGE:              { min: 0, max: 150, step: 1,   unit: "years" },
  HEIGHT_RANGE:           { min: 0, max: 250, step: 1,   unit: "cm" },
  WEIGHT_RANGE:           { min: 0, max: 250, step: 1,   unit: "kg" },
  BP_SYSTOLIC_RANGE:      { min: 1, max: 300, step: 1,   unit: "mmHg" },
  BP_DIASTOLIC_RANGE:     { min: 1, max: 200, step: 1,   unit: "mmHg" },
  HEART_RATE_RANGE:       { min: 1, max: 300, step: 1,   unit: "bpm" },
  SPO2_RANGE:             { min: 0, max: 100, step: 1,   unit: "%" },
  TEMPERATURE_RANGE:      { min: 0, max: 45,  step: 0.1, unit: "°C" },
  RESPIRATORY_RATE_RANGE: { min: 0, max: 50,  step: 1,   unit: "/min" },
  MOUTH_OPENING_RANGE:    { min: 0, max: 10,  step: 0.5, unit: "cm" },
  THYROMENTAL_RANGE:      { min: 0, max: 15,  step: 1,   unit: "cm" },
  ALDRETE_SUBSCORE_RANGE: { min: 0, max: 2,   step: 1,   unit: "" },
  PAIN_NRS_RANGE:         { min: 0, max: 10,  step: 1,   unit: "" },
}
