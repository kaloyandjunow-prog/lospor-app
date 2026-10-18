"use client"

import { createPortal } from "react-dom"
import type { DoseLimit } from "@lospor/core/catalog"
import { DISPLAY_CLINICAL_DOSE_GUIDANCE } from "@/lib/clinical-guidance-policy"
import { PUMP_UNIT, rateFromPumpText, suggestedVolumeRate, switchVolumeUnit, volumeRateView } from "@/lib/volume-rate-entry"
import { useIntraopUiCopy } from "./ui-copy"

/**
 * Changing an infusion rate mid-case.
 *
 * Two steps, because a rate change has a time as well as a number. "Start now"
 * takes the current column; "Pick time" is for the common case of recording
 * something that happened a few minutes ago — the pump was turned down at
 * 14:20 and entered at 14:35, and the record should say 14:20. Editing an
 * existing change skips the choice: it already has its time.
 *
 * The weight-basis note is the part that matters clinically. A rate in
 * mg/kg/min means nothing without knowing which weight it was calculated
 * against, and the two differ substantially in an obese patient, so the dialog
 * states the basis and the figure — or says the weight is missing rather than
 * quietly using a default.
 */

export type RateChangeState = {
  name: string
  rate: number
  unit: string
  units: string[]
  rateMin: number
  rateMax: number
  rateStep: number
  color: string
  step: "rate" | "time"
  timeH: string
  timeM: string
  editFromCol?: number
  concentration?: string
  /** A child's local anaesthetic infusion: its rule's strengths, pills and dose limit (rate-dialog-surface). */
  concentrationOptions?: string[]
  quickValues?: number[]
  doseLimit?: DoseLimit
  /** The pump rate (mL/hr) is being typed instead of the per-kg rate. */
  pumpMode?: boolean
  pumpText?: string
}

export type RateChangeDialogProps = {
  state: RateChangeState
  displayName: string
  /** Concentrations offered for a local anaesthetic, or none. */
  concentrations: readonly string[] | undefined
  /** "TBW"/"IBW" and the weight it resolves to, when the unit is per-kilogram. */
  weightBasis: { basis: string; weightKg: number | null } | null
  /** The child's weight, for the pump rate of a mL/kg/hr infusion. */
  volumeWeightKg?: number | null
  hours: string[]
  minutes: string[]
  labels: {
    setNewRatePrompt: string
    pickRateChangeTime: string
    concentration: string
  }
  onPatch: (patch: Partial<RateChangeState>) => void
  onApply: () => void
  onConfirmTime: () => void
  onDismiss: () => void
  /** Reserved for a future explicit deployment policy; off in clinical entry. */
  showDoseGuidance?: boolean
}

const selectClass =
  "flex h-10 rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 flex-1"

export function RateChangeDialog({
  state,
  displayName,
  concentrations,
  weightBasis,
  volumeWeightKg = null,
  hours,
  minutes,
  labels,
  onPatch,
  onApply,
  onConfirmTime,
  onDismiss,
  showDoseGuidance = DISPLAY_CLINICAL_DOSE_GUIDANCE,
}: RateChangeDialogProps) {
  const copy = useIntraopUiCopy()
  if (typeof document === "undefined") return null

  const editing = state.editFromCol !== undefined
  const volume = volumeRateView({
    unit: state.unit, rate: state.rate, max: state.rateMax, step: state.rateStep, quickValues: state.quickValues,
    doseLimit: state.doseLimit, concentration: state.concentration, weightKg: volumeWeightKg,
    pumpMode: state.pumpMode, pumpText: state.pumpText, onPumpLabel: copy.volumeOnPump,
  })
  const setValue = (text: string) => onPatch(volume.pumpMode
    ? { pumpText: text, rate: rateFromPumpText(text, volumeWeightKg) ?? 0 }
    : { rate: parseFloat(text) || state.rateMin })

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onDismiss}>
      <div
        className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl p-5 w-72 space-y-4 border border-slate-200 dark:border-[#3a3a3a]"
        onClick={event => event.stopPropagation()}
      >
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{ color: state.color }}>
            {displayName}{state.concentration ? ` ${state.concentration}` : ""} — {copy.rateChange.title}
          </p>
          {state.step === "rate" && <p className="text-[10px] text-slate-400">{labels.setNewRatePrompt}</p>}
          {state.step === "time" && <p className="text-[10px] text-slate-400">{labels.pickRateChangeTime}</p>}
          {showDoseGuidance && weightBasis && (
            <p className="text-[9px] text-amber-500 dark:text-amber-400 mt-1">
              ⚖ {copy.rateChange.totalsBasis} {weightBasis.basis}
              {weightBasis.weightKg
                ? ` ${Math.round(weightBasis.weightKg * 10) / 10} kg`
                : copy.rateChange.missingWeight}
            </p>
          )}
        </div>

        {state.step === "rate" && (
          <>
            {concentrations && concentrations.length > 0 && (
              <div className="space-y-1.5 pb-1 border-b border-slate-100 dark:border-[#2a2a2a]">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                  {labels.concentration}
                </p>
                <div className="flex flex-wrap gap-1">
                  {concentrations.map(value => (
                    <button
                      key={value}
                      type="button"
                      // Tapping the selected one clears it: a strength recorded
                      // by mistake has to be removable, not just replaceable.
                      onClick={() => {
                        const next = state.concentration === value ? undefined : value
                        const suggested = suggestedVolumeRate({ max: state.rateMax, step: state.rateStep, doseLimit: state.doseLimit, concentration: next })
                        onPatch({ concentration: next, ...(suggested == null ? {} : { rate: suggested, pumpMode: false }) })
                      }}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-all ${
                        state.concentration === value
                          ? "bg-sky-500 border-sky-500 text-white"
                          : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-sky-400 dark:hover:border-sky-600"
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={volume.value}
                  autoFocus
                  min={showDoseGuidance ? state.rateMin : undefined}
                  max={showDoseGuidance ? volume.max : undefined}
                  step={volume.pumpMode ? 0.1 : state.rateStep}
                  onChange={event => setValue(event.target.value)}
                  className="flex-1 text-lg font-semibold text-center border border-slate-200 dark:border-[#3a3a3a] rounded-lg px-2 py-1.5 bg-white dark:bg-[#2a2a2a] focus:outline-none focus:ring-1 focus:ring-blue-400 [appearance:textfield]"
                />
                <select
                  value={volume.pumpMode ? PUMP_UNIT : state.unit}
                  onChange={event => onPatch(volume.pumpAvailable
                    ? switchVolumeUnit({ unit: state.unit, rate: state.rate, weightKg: volumeWeightKg, next: event.target.value })
                    : { unit: event.target.value })}
                  className="text-xs border border-slate-200 dark:border-[#3a3a3a] rounded-lg px-2 py-1.5 bg-white dark:bg-[#2a2a2a] focus:outline-none"
                >
                  {(volume.pumpAvailable ? [state.unit, PUMP_UNIT] : state.units).map(unit => <option key={unit} value={unit}>{unit}</option>)}
                </select>
              </div>
              {volume.readout && <p className="text-[10px] text-sky-600 dark:text-sky-400">{volume.readout}</p>}
              {showDoseGuidance && volume.quickValues && volume.quickValues.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {volume.quickValues.map(value => (
                    <button key={value} type="button" onClick={() => onPatch({ rate: value })}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${state.rate === value ? "bg-blue-500 border-blue-500 text-white" : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400"}`}>
                      {value}
                    </button>
                  ))}
                </div>
              )}
              {showDoseGuidance && (
                <>
                  <input
                    type="range"
                    min={state.rateMin}
                    max={volume.max}
                    step={volume.pumpMode ? 0.1 : state.rateStep}
                    value={volume.value}
                    onChange={event => setValue(event.target.value)}
                    className="w-full accent-blue-500"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>{state.rateMin}</span>
                    <span>{volume.max} {volume.unitSuffix}</span>
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onApply}
                className="flex-1 text-sm font-semibold bg-blue-500 hover:bg-blue-600 text-white rounded-lg py-2 transition-colors"
              >
                {editing ? copy.apply : copy.rateChange.startNow}
              </button>
              {!editing && (
                <button
                  type="button"
                  onClick={() => onPatch({ step: "time" })}
                  className="flex-1 text-sm font-semibold border border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] rounded-lg py-2 transition-colors"
                >
                  {copy.rateChange.pickTime}
                </button>
              )}
            </div>
          </>
        )}

        {state.step === "time" && (
          <>
            <div className="flex items-center gap-2">
              <select
                className={selectClass}
                value={state.timeH}
                onChange={event => onPatch({ timeH: event.target.value })}
              >
                <option value="">{copy.hourPlaceholder}</option>
                {hours.map(hour => <option key={hour} value={hour}>{hour}</option>)}
              </select>
              <span className="font-bold text-slate-400">:</span>
              <select
                className={selectClass}
                value={state.timeM}
                onChange={event => onPatch({ timeM: event.target.value })}
              >
                <option value="">{copy.minutePlaceholder}</option>
                {minutes.map(minute => <option key={minute} value={minute}>{minute}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onPatch({ step: "rate" })}
                className="text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-[#3a3a3a] text-slate-500 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] transition-colors"
              >
                {copy.back}
              </button>
              <button
                type="button"
                disabled={!state.timeH || !state.timeM}
                onClick={onConfirmTime}
                className="flex-1 text-sm font-semibold bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white rounded-lg py-2 transition-colors"
              >
                {copy.confirm}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
