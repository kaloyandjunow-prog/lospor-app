import type { DoseLimit } from "@lospor/core/catalog"
import {
  isPerKgVolumeRate,
  volumeRateFromPump,
  volumeRateReadout,
  volumeRateSurface,
} from "@lospor/core/volume-dose"

export const PUMP_UNIT = "mL/hr"

/** Where the volume entry stands: the rate as recorded, or the pump rate being typed. */
export type VolumePumpState = { pumpMode?: boolean; pumpText?: string }

/**
 * A local anaesthetic infusion entered as volume (mL/kg/hr for a child). The
 * slider maximum and pills follow the strength picked so the dose stays under
 * the rule's limit; the pump rate (mL/hr) and dose are read out; and the pump
 * rate can be typed instead, which is turned back into mL/kg/hr -- the rate
 * recorded. Shared by the start flyout and the rate-change dialog, and the
 * same conversions as the PWA (core volume-dose.ts).
 */
export function volumeRateView(input: VolumePumpState & {
  unit: string
  rate: number | string
  max: number
  step: number
  quickValues?: readonly number[]
  doseLimit?: DoseLimit
  concentration?: string
  weightKg?: number | null
  onPumpLabel: string
}): {
  /** The pump rate can be typed: a per-kg volume rate with a known weight. */
  pumpAvailable: boolean
  pumpMode: boolean
  max: number
  quickValues?: number[]
  /** What the box shows and edits. */
  value: string
  unitSuffix: string
  readout?: string
} {
  const weight = input.weightKg != null && input.weightKg > 0 ? input.weightKg : null
  const pumpAvailable = isPerKgVolumeRate(input.unit) && weight != null
  const pumpMode = pumpAvailable && !!input.pumpMode
  const surface = volumeRateSurface({
    max: input.max,
    step: input.step,
    quickValues: input.quickValues ?? [],
    doseLimit: input.doseLimit,
    concentration: input.concentration,
  })
  const rate = Number(input.rate)
  const readout = Number.isFinite(rate) && rate > 0 && /^mL\//i.test(input.unit)
    ? volumeRateReadout({ rate, unit: input.unit, concentration: input.concentration, weightKg: weight })
    : null
  const dose = readout?.doseRate ? `${readout.doseRate.value} ${readout.doseRate.unit}` : null
  const parts = pumpMode
    ? [`${rate} ${input.unit}`, dose]
    : [isPerKgVolumeRate(input.unit) && readout?.pumpMlPerHour != null ? `${readout.pumpMlPerHour} ${PUMP_UNIT} ${input.onPumpLabel}` : null, dose]
  return {
    pumpAvailable,
    pumpMode,
    max: pumpMode && weight != null ? Math.round(surface.max * weight * 10) / 10 : surface.max,
    quickValues: pumpMode || !input.quickValues ? undefined : surface.quickValues,
    value: pumpMode ? input.pumpText ?? "" : String(input.rate),
    unitSuffix: pumpMode ? PUMP_UNIT : input.unit,
    readout: readout ? parts.filter(Boolean).join(" · ") || undefined : undefined,
  }
}

/** Switching between the recorded rate and the pump rate; the pump box starts at the current pump rate. */
export function switchVolumeUnit(input: { unit: string; rate: number | string; weightKg?: number | null; next: string }): Required<VolumePumpState> {
  const toPump = input.next === PUMP_UNIT
  const pump = toPump ? volumeRateReadout({ rate: Number(input.rate), unit: input.unit, weightKg: input.weightKg }).pumpMlPerHour : null
  return { pumpMode: toPump, pumpText: pump == null ? "" : String(pump) }
}

/** A pump rate typed: the rate to record, in the route's per-kg unit. */
export function rateFromPumpText(text: string, weightKg: number | null | undefined): number | null {
  return text.trim() ? volumeRateFromPump(Number(text), weightKg) : null
}

/** The volume rate to suggest after the strength changes, when the rule has a dose limit. */
export function suggestedVolumeRate(input: { max: number; step: number; doseLimit?: DoseLimit; concentration?: string }): number | undefined {
  if (!input.doseLimit) return undefined
  return volumeRateSurface({ ...input, quickValues: [] }).suggestedRate
}
