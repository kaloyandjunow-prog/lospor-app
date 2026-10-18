"use client"

import { DoseSelector } from "@/components/intraop/DoseSelector"
import { DISPLAY_CLINICAL_DOSE_GUIDANCE } from "@/lib/clinical-guidance-policy"
import { PUMP_UNIT, rateFromPumpText, suggestedVolumeRate, switchVolumeUnit, volumeRateView } from "@/lib/volume-rate-entry"
import type { createDoseSurfaces } from "./dose-surfaces"
import type { TtFP } from "./timetable-types"
import { useIntraopUiCopy } from "./ui-copy"

/**
 * The infusion half of the dosing flyout: rate, unit, route, strength.
 *
 * A child's local anaesthetic infusion is entered as volume (mL/kg/hr). Its
 * slider maximum and pills follow the strength picked, so the dose stays under
 * the rule's limit; the pump rate and the dose are read out beside it; and the
 * pump rate can be typed instead (lib/volume-rate-entry, same as the PWA).
 */
export function InfusionDoseFields({
  fp, setFp, doseSurfaces, isPediatric, laConcentrations, infusionWeightBasis, ibw, tbw, onConfirm,
}: {
  fp: TtFP
  setFp: React.Dispatch<React.SetStateAction<TtFP | null>>
  doseSurfaces: ReturnType<typeof createDoseSurfaces>
  isPediatric: boolean
  laConcentrations: Record<string, string[]>
  infusionWeightBasis: Record<string, "IBW" | "TBW" | "BSA_M2" | "none">
  ibw?: number | null
  tbw?: number | null
  onConfirm: () => void
}) {
  const copy = useIntraopUiCopy()
  const isurf = fp.searchOnlyManualEntry
    ? undefined
    : doseSurfaces.infusionRouteSurface(fp.name, fp.route)
  const conc = isPediatric
    ? fp.concentrationOptions
    : isurf ? (isurf.mode?.includes("concentration") ? isurf.concentrationOptions : undefined) : laConcentrations[fp.name]
  const isLA = !!fp.concentrationUnitHint || !!conc?.length
  // Children's infusions are on actual weight (the paediatric profiles' basis);
  // an adult library basis of "none" names no weight at all.
  const libraryBasis = fp.searchOnlyManualEntry ? undefined : infusionWeightBasis[fp.name]
  const basis = isPediatric && !fp.searchOnlyManualEntry ? "TBW" : libraryBasis === "none" ? undefined : libraryBasis
  const isPerKg = fp.rateUnit?.includes("/kg/")
  const wt = basis === "TBW" ? tbw : ibw
  const weightHint = isPerKg && basis
    ? `⚖ ${copy.totalUsesWeight(basis, wt ? Math.round(wt * 10) / 10 : undefined)}`
    : undefined
  const volumeWeight = wt
  const volume = volumeRateView({
    unit: fp.rateUnit,
    rate: fp.manualEntryOnly && fp.rate === 0 ? "" : fp.rate,
    max: fp.rateMax,
    step: fp.rateStep,
    quickValues: fp.quickRates,
    doseLimit: fp.doseLimit,
    concentration: fp.concentration,
    weightKg: volumeWeight,
    pumpMode: fp.pumpMode,
    pumpText: fp.pumpText,
    onPumpLabel: copy.volumeOnPump,
  })
  const extraHint = [volume.readout, fp.advisory, weightHint].filter(Boolean).join(" · ") || undefined
  return (
    <DoseSelector
      accent="blue"
      concentrationOptions={isLA ? conc : undefined}
      concentrationUnit={isLA ? fp.concentrationUnitHint : undefined}
      concentration={fp.concentration}
      onConcentrationChange={c => setFp(f => {
        if (!f) return f
        const suggested = suggestedVolumeRate({ max: f.rateMax, step: f.rateStep, doseLimit: f.doseLimit, concentration: c })
        return { ...f, concentration: c, customConc: "", ...(suggested == null ? {} : { rate: suggested, pumpMode: false }) }
      })}
      customConcentration={fp.customConc}
      onCustomConcentrationChange={v => setFp(f => f ? {...f, customConc: v} : f)}
      quickValues={volume.quickValues}
      manualEntryOnly={fp.manualEntryOnly}
      value={volume.value}
      onValueChange={v => setFp(f => {
        if (!f) return f
        if (volume.pumpMode) return { ...f, pumpText: v, rate: rateFromPumpText(v, volumeWeight) ?? 0 }
        return { ...f, rate: parseFloat(v) || f.rateMin }
      })}
      valuePlaceholder={copy.rate}
      min={fp.rateMin} max={volume.max} step={volume.pumpMode ? 0.1 : fp.rateStep}
      units={volume.pumpAvailable ? [fp.rateUnit, PUMP_UNIT] : !isLA ? fp.rateUnits : undefined}
      unit={volume.pumpMode ? PUMP_UNIT : fp.rateUnit}
      onUnitChange={u => setFp(f => {
        if (!f) return f
        if (volume.pumpAvailable) return { ...f, ...switchVolumeUnit({ unit: f.rateUnit, rate: f.rate, weightKg: volumeWeight, next: u }) }
        return { ...f, rateUnit: u }
      })}
      unitSuffix={volume.unitSuffix}
      extraHint={extraHint}
      showGuidance={DISPLAY_CLINICAL_DOSE_GUIDANCE}
      formulationOptions={fp.formulationOptions}
      formulation={fp.formulation}
      onFormulationChange={formulation => setFp(f => f ? { ...f, formulation } : f)}
      routes={fp.routes} route={fp.route} onRouteChange={r => setFp(f => {
        if (!f) return f
        if (f.searchOnlyManualEntry) return { ...f, route: r }
        if (isPediatric) {
          const next = doseSurfaces.clinicalPediatricInfusionFor(f.name, r).surface
          if (!next || next.disposition === "HIDDEN") return f
          return {
            ...f,
            route: next.route,
            rate: next.suggestedRate ?? 0,
            rateUnit: next.unit,
            rateUnits: [next.unit],
            rateMin: next.min,
            rateMax: next.max,
            rateStep: next.step,
            quickRates: next.quickValues,
            concentration: next.concentration || undefined,
            concentrationOptions: next.concentrationOptions,
            concentrationUnitHint: next.concentrationUnit,
            customConc: "",
            formulation: next.formulation,
            formulationOptions: next.formulationOptions,
            manualEntryOnly: next.manualEntryOnly,
            advisory: next.advisory ?? undefined,
            doseLimit: next.doseLimit,
            pumpMode: false,
            clinicalRuleKey: next.ruleKey,
            clinicalRuleVersion: next.ruleVersion,
            clinicalRuleSourceIds: next.sourceIds,
          }
        }
        const surf = doseSurfaces.infusionRouteSurface(f.name, r)
        if (!surf) return { ...f, route: r }
        return { ...f, route: r,
          rateUnit: surf.unit, rateUnits: [surf.unit],
          rateMin: surf.min, rateMax: surf.max, rateStep: surf.step,
          rate: surf.suggestedRate ?? surf.min,
          quickRates: surf.quickValues ?? f.quickRates,
          concentration: surf.suggestedConcentration, customConc: "" }
      })}
      confirmLabel={copy.startInfusion}
      confirmDisabled={
        !Number.isFinite(Number(fp.rate))
        || Number(fp.rate) <= 0
        || (!!fp.concentrationUnitHint && !fp.concentration)
        || (!!fp.formulationOptions?.length && !fp.formulation)
      }
      onConfirm={onConfirm}
    />
  )
}
