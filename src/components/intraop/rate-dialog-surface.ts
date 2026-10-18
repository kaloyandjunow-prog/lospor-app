import type { DoseLimit } from "@lospor/core/catalog"
import type { createDoseSurfaces } from "./dose-surfaces"

/**
 * The range a running infusion's rate may be changed within.
 *
 * Adults keep the library range. A child's local anaesthetic infusion keeps
 * its paediatric rule instead -- mL/kg/hr limited by dose at the strength
 * running -- so the change sheet cannot offer more than the start sheet did.
 * Guidance off leaves the range open.
 */
export function rateDialogSurface(input: {
  name: string
  route?: string
  cfg: { units: string[]; min: number; max: number; step: number }
  guidance: boolean
  isPediatric: boolean
  doseSurfaces: ReturnType<typeof createDoseSurfaces>
}): { units: string[]; rateMin: number; rateMax: number; rateStep: number; doseLimit?: DoseLimit; quickValues?: number[]; concentrationOptions?: string[] } {
  const pediatric = input.isPediatric && input.guidance
    ? input.doseSurfaces.clinicalPediatricInfusionFor(input.name, input.route).surface
    : null
  if (pediatric?.doseLimit) {
    return {
      units: [pediatric.unit],
      rateMin: pediatric.min,
      rateMax: pediatric.max,
      rateStep: pediatric.step,
      doseLimit: pediatric.doseLimit,
      quickValues: pediatric.quickValues,
      concentrationOptions: pediatric.concentrationOptions,
    }
  }
  return {
    units: input.cfg.units,
    rateMin: input.guidance ? input.cfg.min : 0,
    rateMax: input.guidance ? input.cfg.max : 100_000,
    rateStep: input.guidance ? input.cfg.step : 0.1,
  }
}
