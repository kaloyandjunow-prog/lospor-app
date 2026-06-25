"use client"

import { NumberStepper } from "@/components/NumberStepper"
import { useUnitPreferences } from "@/hooks/useUnitPreferences"
import {
  cmToInches, inchesToCm, kgToLb, lbToKg,
  celsiusToFahrenheit, fahrenheitToCelsius, mmHgToKPa, kPaToMmHg,
} from "@/lib/unit-conversion"

// Wraps NumberStepper so height/weight/temperature/EtCO2 fields respect the
// user's display-unit preference (Settings → Units) without the value ever
// leaving canonical units in the form/DB. The canonical value goes in,
// the canonical value comes out via onCanonicalChange — this component only
// converts what's shown and typed in between.

type Measurement = "height" | "weight" | "temperature" | "etco2"

const DISPLAY: Record<Measurement, { altUnit: string; canonUnit: string; altStep: number; precision: number; toAlt: (v: number) => number; toCanon: (v: number) => number }> = {
  height:      { altUnit: "in",   canonUnit: "cm",   altStep: 0.5, precision: 1, toAlt: cmToInches,         toCanon: inchesToCm },
  weight:      { altUnit: "lb",   canonUnit: "kg",   altStep: 1,   precision: 1, toAlt: kgToLb,             toCanon: lbToKg },
  temperature: { altUnit: "°F",   canonUnit: "°C",   altStep: 0.2, precision: 1, toAlt: celsiusToFahrenheit, toCanon: fahrenheitToCelsius },
  etco2:       { altUnit: "kPa",  canonUnit: "mmHg", altStep: 0.1, precision: 1, toAlt: mmHgToKPa,          toCanon: kPaToMmHg },
}

export function ConvertedStepper({
  measurement, canonicalValue, onCanonicalChange, canonicalMin, canonicalMax, canonicalStep, showSlider,
}: {
  measurement: Measurement
  canonicalValue: number | undefined
  onCanonicalChange: (v: number | undefined) => void
  canonicalMin: number
  canonicalMax: number
  canonicalStep: number
  showSlider?: boolean
}) {
  const prefs = useUnitPreferences()
  const cfg = DISPLAY[measurement]
  const usingAlt =
    (measurement === "height" && prefs.heightUnit === "in") ||
    (measurement === "weight" && prefs.weightUnit === "lb") ||
    (measurement === "temperature" && prefs.temperatureUnit === "F") ||
    (measurement === "etco2" && prefs.etco2Unit === "kPa")

  if (!usingAlt) {
    return (
      <NumberStepper value={canonicalValue} onChange={onCanonicalChange}
        min={canonicalMin} max={canonicalMax} step={canonicalStep} unit={cfg.canonUnit} showSlider={showSlider} />
    )
  }

  const round = (v: number) => Math.round(v * 10 ** cfg.precision) / 10 ** cfg.precision
  const displayValue = canonicalValue != null ? round(cfg.toAlt(canonicalValue)) : undefined
  const displayMin = round(cfg.toAlt(canonicalMin))
  const displayMax = round(cfg.toAlt(canonicalMax))

  function handleChange(v: number | undefined) {
    onCanonicalChange(v != null ? round(cfg.toCanon(v)) : undefined)
  }

  return (
    <NumberStepper value={displayValue} onChange={handleChange}
      min={Math.min(displayMin, displayMax)} max={Math.max(displayMin, displayMax)} step={cfg.altStep}
      unit={cfg.altUnit} showSlider={showSlider} />
  )
}
