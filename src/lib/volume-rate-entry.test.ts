import { describe, expect, it } from "vitest"
import { PUMP_UNIT, rateFromPumpText, suggestedVolumeRate, switchVolumeUnit, volumeRateView } from "./volume-rate-entry"

// A child's epidural in mL/kg/hr; the limit is a dose, so it follows the
// strength, and the pump rate can be typed instead (2026-10-18). Same numbers
// as the PWA's use-volume-rate-entry test.
const epidural = {
  unit: "mL/kg/hr",
  max: 0.5,
  step: 0.01,
  quickValues: [0.05, 0.1, 0.15, 0.2, 0.3, 0.4],
  doseLimit: { unit: "mg/kg/hr", max: 0.4, suggested: 0.3 },
  weightKg: 12,
  onPumpLabel: "on the pump",
}

describe("volume-rate entry on the web", () => {
  it("limits by dose at the strength picked and reads out the pump rate", () => {
    expect(volumeRateView({ ...epidural, rate: 0.1, concentration: "0.2%" })).toEqual({
      pumpAvailable: true,
      pumpMode: false,
      max: 0.2,
      quickValues: [0.05, 0.1, 0.15, 0.2],
      value: "0.1",
      unitSuffix: "mL/kg/hr",
      readout: "1.2 mL/hr on the pump · 0.2 mg/kg/hr",
    })
    expect(suggestedVolumeRate({ ...epidural, concentration: "0.1%" })).toBe(0.3)
  })

  it("takes the pump rate and records mL/kg/hr", () => {
    const pump = switchVolumeUnit({ unit: "mL/kg/hr", rate: 0.1, weightKg: 12, next: PUMP_UNIT })
    expect(pump).toEqual({ pumpMode: true, pumpText: "1.2" })
    expect(rateFromPumpText("2.5", 12)).toBe(0.208)
    expect(volumeRateView({ ...epidural, rate: 0.208, concentration: "0.2%", ...pump, pumpText: "2.5" }))
      .toMatchObject({ value: "2.5", unitSuffix: PUMP_UNIT, max: 2.4, readout: "0.208 mL/kg/hr · 0.416 mg/kg/hr" })
  })

  it("leaves other infusions alone", () => {
    expect(volumeRateView({ unit: "mcg/kg/min", rate: 0.1, max: 3, step: 0.01, quickValues: [0.05], weightKg: 70, onPumpLabel: "" }))
      .toMatchObject({ pumpAvailable: false, max: 3, quickValues: [0.05], readout: undefined })
  })
})
