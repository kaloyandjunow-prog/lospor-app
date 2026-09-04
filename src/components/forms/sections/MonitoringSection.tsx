"use client"
import { useLocale } from "next-intl"
import { cvpDisplayRange, cvpStep, cvpToCanonical, cvpToDisplay } from "@lospor/core/monitoring-values"
import { useUnitPreferences } from "@/hooks/useUnitPreferences"
import { SectionCard } from "@/components/forms/shared/SectionCard"
import type { LibraryOption } from "@/hooks/useOptionLibrary"
import { displayClinicalCode, displayOption } from "@/lib/clinical-display"
import type { Path, UseFormWatch, UseFormSetValue } from "react-hook-form"
import type { IntraopFormFields } from "@/components/forms/IntraopForm"

// monitoringOptions' `value` is a free-form string from the OptionLibrary
// DB table (MONITORING category), not a compile-time literal — these casts
// to Path<IntraopFormFields> document "this DB-driven field name is expected
// to match a real form field" rather than opting out of checking entirely.
function asPath(name: string): Path<IntraopFormFields> { return name as Path<IntraopFormFields> }

/**
 * A row appears under a monitoring group only while its monitor is selected.
 *
 * The value and the flag answer different questions -- "was it used" and "what
 * did it read" -- and a case can honestly carry the first without the second.
 * What it must never carry is the second without the first, so unticking a
 * monitor removes its row and clears the value with it.
 */
function MonitoringValueRow({ label, unit, value, min, max, step, onChange }: {
  label: string
  unit: string | null
  value: number | null
  min: number
  max: number
  step: number
  onChange: (next: number | null) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#2a2a2a]">
      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300" htmlFor={`mv-${label}`}>
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <input
          id={`mv-${label}`}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={value ?? ""}
          // An emptied field is "not recorded", not 0. Coercing a blank to zero
          // here would turn a cleared BIS into an isoelectric EEG.
          onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))}
          className="w-20 px-2 py-1 rounded-md border border-slate-300 dark:border-[#3a3a3a] bg-white dark:bg-[#111] text-sm text-right tabular-nums text-slate-800 dark:text-slate-100"
        />
        {unit && <span className="text-[10px] font-semibold text-slate-400 w-11">{unit}</span>}
      </div>
    </div>
  )
}

/**
 * Which value belongs to which monitor, and where it appears.
 *
 * `group` places the row under the same heading as the chip that reveals it, so
 * the number sits with the monitor rather than in a separate block the reader
 * has to connect back.
 */
const VALUE_ROWS = [
  { flag: "cvpMonitor", field: "cvpMmHg",  group: "haemodynamic", label: "CVP",       unit: "cvp",     min: 0.1, max: 50,  step: 0.1 },
  { flag: "bis",        field: "bisValue", group: "depth",        label: "BIS",       unit: null,      min: 0,   max: 100, step: 1 },
  { flag: "tofMonitor", field: "tofRatio", group: "depth",        label: "TOF ratio", unit: "ratio",   min: 0,   max: 1,   step: 0.1 },
] as const

export function MonitoringSection({ t, watch, setValue, monitoringOptions, advancedMonOpen, setAdvancedMonOpen }: {
  t: (key: string) => string
  watch: UseFormWatch<IntraopFormFields>
  setValue: UseFormSetValue<IntraopFormFields>
  monitoringOptions: LibraryOption[]
  advancedMonOpen: boolean
  setAdvancedMonOpen: (updater: (v: boolean) => boolean) => void
}) {
  const locale = useLocale()
  const { cvpUnit } = useUnitPreferences()
  const cvpRange = cvpDisplayRange(cvpUnit)
  return (
    <SectionCard title={t("intraop.monitoringSection")} collapsible
      badge={(() => { const tot = monitoringOptions.filter(m => watch(asPath(m.value))).length; return tot ? `${tot} active` : undefined })()}>

      <div className="space-y-4">
        {/* Standard monitoring — always visible, pre-selected */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{displayClinicalCode("optionGroup", "standard", locale)}</p>
          <div className="flex flex-wrap gap-2">
            {monitoringOptions.filter(m => ["ecg","spO2Monitor","nbpMonitor"].includes(m.value)).map(m => {
              const on = watch(asPath(m.value)) as boolean
              return (
                <button key={m.value} type="button"
                  onClick={() => setValue(asPath(m.value), !on)}
                  className={`px-3 py-1.5 rounded-lg border-2 text-xs font-semibold transition-all ${
                    on
                      ? "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white scale-105 shadow-sm"
                      : "border-slate-200 dark:border-[#333] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#444] hover:bg-slate-50 dark:hover:bg-[#1e1e1e]"
                  }`}>
                  {displayOption("MONITORING", m, locale)}
                </button>
              )
            })}
          </div>
        </div>

        {/* Advanced monitoring — collapsible */}
        {(() => {
          const ADVANCED_FIELDS = monitoringOptions.filter(m => !["ecg","spO2Monitor","nbpMonitor"].includes(m.value))
          const advCount = ADVANCED_FIELDS.filter(m => watch(asPath(m.value)) as boolean).length
          return (
            <div>
              <button type="button"
                onClick={() => setAdvancedMonOpen(v => !v)}
                className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                <span className={`transition-transform ${advancedMonOpen ? "rotate-90" : ""}`}>▶</span>
                {displayClinicalCode("optionGroup", "advanced", locale)}
                {advCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-slate-700 text-white text-[10px] font-bold">{advCount}</span>
                )}
              </button>
              {advancedMonOpen && (
                <div className="mt-3 space-y-3">
                  {([
                    ["respiratory", displayClinicalCode("optionGroup", "respiratory", locale)],
                    ["haemodynamic", displayClinicalCode("optionGroup", "haemodynamic", locale)],
                    ["depth", displayClinicalCode("optionGroup", "depth", locale)],
                    ["other", displayClinicalCode("optionGroup", "other", locale)],
                  ] as const).map(([cat, catLabel]) => {
                    const items = ADVANCED_FIELDS.filter(m => m.group === cat)
                    if (!items.length) return null
                    return (
                      <div key={cat}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{catLabel}</p>
                        <div className="flex flex-wrap gap-2">
                          {items.map(m => {
                            const on = watch(asPath(m.value)) as boolean
                            return (
                              <button key={m.value} type="button"
                                onClick={() => {
                                  setValue(asPath(m.value), !on)
                                  // Turning a monitor off takes its reading
                                  // with it. The server enforces this too, but
                                  // leaving the number on screen until a reload
                                  // would show a value the record no longer has.
                                  if (on) {
                                    const row = VALUE_ROWS.find(r => r.flag === m.value)
                                    if (row) setValue(asPath(row.field), null, { shouldDirty: true })
                                  }
                                }}
                                className={`px-3 py-1.5 rounded-lg border-2 text-xs font-semibold transition-all ${
                                  on
                                    ? "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white scale-105 shadow-sm"
                                    : "border-slate-200 dark:border-[#333] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#444] hover:bg-slate-50 dark:hover:bg-[#1e1e1e]"
                                }`}>
                                {displayOption("MONITORING", m, locale)}
                              </button>
                            )
                          })}
                        </div>
                        {/* The values belonging to monitors in this group, each
                            visible only while its own monitor is selected. */}
                        {VALUE_ROWS.filter(row => row.group === cat && watch(asPath(row.flag))).length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            {VALUE_ROWS.filter(row => row.group === cat && watch(asPath(row.flag))).map(row => (
                              <MonitoringValueRow
                                key={row.flag}
                                label={row.label}
                                unit={row.unit === "cvp" ? (cvpUnit === "cmH2O" ? "cmH₂O" : "mmHg") : row.unit}
                                min={row.unit === "cvp" ? cvpRange.min : row.min}
                                max={row.unit === "cvp" ? cvpRange.max : row.max}
                                step={row.unit === "cvp"
                                  ? cvpStep(Number(watch(asPath("cvpMmHg")) ?? 0), cvpUnit)
                                  : row.step}
                                value={(() => {
                                  const raw = watch(asPath(row.field)) as number | null | undefined
                                  if (raw == null) return null
                                  // CVP is stored in mmHg and shown in whatever
                                  // unit is chosen; the others have one unit.
                                  return row.unit === "cvp" ? cvpToDisplay(raw, cvpUnit) : raw
                                })()}
                                onChange={next => setValue(
                                  asPath(row.field),
                                  next == null
                                    ? null
                                    : row.unit === "cvp" ? cvpToCanonical(next, cvpUnit) : next,
                                  { shouldDirty: true },
                                )}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()}
      </div>
    </SectionCard>
  )
}
