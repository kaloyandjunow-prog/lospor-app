import { ALL_COMPLICATIONS } from "@lospor/core/complications"
import { clinicalDisplayLabel } from "@lospor/core/display"
import { defibrillationPrefillJoules } from "@lospor/core/defibrillation"
import type { ClinicalEvent } from "@lospor/core/intraop-types"
import { preopAgeDays } from "@lospor/core/vital-questions"

/**
 * Every complication of the shared taxonomy, after the quick ones, so any of
 * them can be charted at its time -- as the PWA's slot sheet offers (10.1.0).
 */
export function extraComplicationOptions(quick: readonly { label: string }[], locale: string) {
  const language = locale === "bg" ? "bg" : "en"
  return ALL_COMPLICATIONS
    .filter(label => !quick.some(event => event.label === label))
    .map(label => ({ label, color: "#ef4444", displayLabel: clinicalDisplayLabel("complication", label, language, { label }) }))
}

/** The Defibrillation dialog’s figures at a column: which shock this is and a child’s prefill. */
export function defibrillationDialogProps(
  markers: readonly ClinicalEvent[],
  colIdx: number,
  timeLabel: string,
  patient: { ageValue: number | null | undefined; ageUnit: string | null | undefined; weightKg: number | null | undefined },
) {
  const shockNumber = markers.filter(marker => marker.kind === "defibrillation" && marker.colIdx <= colIdx).length + 1
  const ageDays = preopAgeDays({ ageValue: patient.ageValue, ageUnit: patient.ageUnit })
  return {
    timeLabel,
    shockNumber,
    prefillJoules: defibrillationPrefillJoules({ ageDays, weightKg: patient.weightKg, shockNumber }),
  }
}
