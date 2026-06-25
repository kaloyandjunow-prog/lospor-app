import { z } from "zod"

// The strict, single shape for every drug/infusion/fluid/agent's dosing
// rules — replaces the ad-hoc per-category metadata fields built up during
// the dose-selector UI work (quickDoses/quickRates/quickPercents/
// quickVolumes, separate route/concentration records per category, etc).
//
// This is the CLINICAL DATA shape stored in OptionLibrary.metadata for the
// INTRAOP_DRUG/INTRAOP_INFUSION/INTRAOP_FLUID/INHALATIONAL_AGENT categories.
// UI-only styling (e.g. agent bar colors) is NOT part of this — see
// DrugCatalogEntry/InfusionCatalogEntry etc. in each category's data file,
// which carries a DoseProfile alongside category/color/display concerns.
//
// The common case (single dosing mode, same numbers for every route) is
// FLAT — min/max/step/unit/etc sit directly on the profile, matching what
// IntraopTimetable.tsx and mobile's [id].tsx already read today
// (o.metadata?.min, o.metadata?.routes, o.metadata?.doseCalc, ...). The rare
// drugs whose numbers or dosing MODE genuinely differ by route (Ketamine's
// perKg by route; Lidocaine's dose-vs-concentration mode by route) use the
// optional `routeModes`/`doseCalcByRoute` escape hatches instead of/in
// addition to the flat fields — consumers check those first, falling back
// to the flat fields.
//
// Schema evolved through a full walkthrough of ~250 real drugs/infusions/
// fluids (see scripts/_drug-library-answers.json for the raw source data
// and the rules discovered along the way). Key discoveries baked in here:
//   - doseCalc's per-kg field is unit-agnostic (`perKg`, not `mgPerKg`) —
//     Dexmedetomidine etc. dose in mcg/kg, not mg/kg.
//   - doseCalc needs its own `roundTo`, independent of the slider's `step`
//     (Propofol rounds to 10 matching its step; Etomidate rounds to 1
//     despite a 0.1 step).
//   - doseCalc needs an optional `cap` — PCC 4-factor is 25 IU/kg but must
//     never suggest more than 3000 IU regardless of weight.
//   - the per-kg multiplier (and even the whole dosing MODE) can vary BY
//     ROUTE: Ketamine's mg/kg differs IV vs IM vs IN vs PO; Lidocaine is a
//     flat mg dose by IV but a concentration%+volume pick by SC/PD/IT.
//   - sliders sometimes need a non-uniform step (fine below a threshold,
//     coarser above) — `variableStep`, same idea as the mobile weight wheel.
//   - infusions can have a suggested starting rate (`suggestedRate`), and
//     concentration-mode entries can have a suggested volume/concentration.
//   - some infusions are dosed in mL/hr against a fixed prep strength
//     ("300mg in 50mL") — `prepStrength` lets the total mg delivered be
//     computed from rate × strength rather than being mL-only.

export const DOSE_KIND = ["bolus", "infusion", "fluid", "agent"] as const
export type DoseKind = (typeof DOSE_KIND)[number]

export const ROUNDING = ["nearest_step", "floor_step", "ceil_step"] as const
export type Rounding = (typeof ROUNDING)[number]

export const WEIGHT_BASIS = ["TBW", "IBW", "none"] as const
export type WeightBasis = (typeof WEIGHT_BASIS)[number]

export const DOSE_MODE = ["dose", "rate", "concentration", "concentration-rate"] as const
export type DoseModeKind = (typeof DOSE_MODE)[number]

const doseCalcSchema = z.object({
  perKg: z.number().optional(),
  flat: z.number().optional(),
  basis: z.enum(["IBW", "TBW"]).optional(),
  // Only meaningful when `perKg` is set (a `flat` dose is already an exact
  // number — there's nothing to round). Defaults to 1 if perKg is used
  // without an explicit roundTo.
  roundTo: z.number().positive().optional(),
  cap: z.number().positive().optional(),
})
export type DoseCalc = z.infer<typeof doseCalcSchema>

// A per-route override of the dosing surface — only the fields that differ
// from the flat top-level ones need to be repeated.
const routeModeSchema = z.object({
  mode: z.enum(DOSE_MODE).default("dose"),
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  variableStep: z.array(z.object({ upTo: z.number(), step: z.number().positive() })).optional(),
  quickValues: z.array(z.number()).default([]),
  unit: z.string().min(1),
  weightBasis: z.enum(WEIGHT_BASIS).default("none"),
  doseCalc: doseCalcSchema.optional(),
  concentrationOptions: z.array(z.string()).optional(),
  suggestedConcentration: z.string().optional(),
  suggestedVolume: z.number().optional(),
  suggestedRate: z.number().optional(),
  prepStrength: z.object({ mg: z.number(), mL: z.number() }).optional(),
}).refine(d => d.max > d.min, { message: "max must be greater than min" })
export type RouteMode = z.infer<typeof routeModeSchema>

export const DoseProfileSchema = z.object({
  kind: z.enum(DOSE_KIND),
  mode: z.enum(DOSE_MODE).default("dose"),
  // Flat fields — required unless routeModes covers every route instead.
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().positive().optional(),
  variableStep: z.array(z.object({ upTo: z.number(), step: z.number().positive() })).optional(),
  rounding: z.enum(ROUNDING).default("nearest_step"),
  quickValues: z.array(z.number()).default([]),
  unit: z.string().optional(),
  routes: z.array(z.string()).default(["IV"]),
  concentrationOptions: z.array(z.string()).optional(),
  defaultConcentration: z.string().optional(),
  weightBasis: z.enum(WEIGHT_BASIS).default("none"),
  hint: z.string().optional(),
  doseCalc: doseCalcSchema.optional(),
  suggestedConcentration: z.string().optional(),
  suggestedVolume: z.number().optional(),
  suggestedVolumeByRoute: z.record(z.string(), z.number()).optional(),
  suggestedRate: z.number().optional(),
  prepStrength: z.object({ mg: z.number(), mL: z.number() }).optional(),
  // Escape hatches for per-route variation.
  doseCalcByRoute: z.record(z.string(), doseCalcSchema).optional(),
  routeModes: z.record(z.string(), routeModeSchema).optional(),
}).refine(d => d.routeModes || (d.min != null && d.max != null && (d.step != null || d.variableStep) && d.unit),
  { message: "must have either `routeModes` for every route, or flat min/max/(step or variableStep)/unit" })
  .refine(d => d.min == null || d.max == null || d.max > d.min, { message: "max must be greater than min" })

export type DoseProfile = z.infer<typeof DoseProfileSchema>
// The shape catalog data files actually author (before defaults like
// `mode`/`rounding`/`weightBasis` are filled in by parseDoseProfile) — use
// this for `profile:` fields in DrugCatalogEntry/InfusionCatalogEntry/etc.,
// not the post-parse DoseProfile output type.
export type DoseProfileInput = Omit<z.input<typeof DoseProfileSchema>, "kind">

export function parseDoseProfile(name: string, kind: DoseKind, raw: unknown): DoseProfile {
  const result = DoseProfileSchema.safeParse({ kind, ...(raw as object) })
  if (!result.success) {
    throw new Error(`Invalid dose profile for "${name}" (${kind}): ${result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`)
  }
  return result.data
}
