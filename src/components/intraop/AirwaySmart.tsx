"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { airwayDevicesInUse, type AirwayDeviceEntry } from "@lospor/core/airway-device-entries"
import { airwayChoices, suggestedAirwayDetails, type AirwayPatient } from "@lospor/core/airway-smart"
import { AirwaySmartPanel, type AirwaySmartRequest } from "./AirwaySmartPanel"

/**
 * The Airway tab, Smart selection (10.2.0): what is in place first, then the
 * devices the technique leads with as big cards, the rest behind "More
 * devices", and one panel that opens under them. A device is added here, or
 * from the timeline when the event is charted. The choices, the suggested
 * sizes and the saving are Core's (airway-smart).
 */
export function AirwaySmart({
  entries, onChange, patient, techniques, startedAt, now, timeZone, difficultAirway, deviceLabel, toolLabel, describe, timeOf,
}: {
  entries: readonly AirwayDeviceEntry[]
  onChange: (next: AirwayDeviceEntry[]) => void
  patient: AirwayPatient
  techniques: readonly string[]
  startedAt: string | null
  now: () => string
  timeZone: string | null
  difficultAirway: boolean
  deviceLabel: (code: string) => string
  toolLabel: (code: string) => string
  /** A device's line: "Oral ETT 8 cuffed". */
  describe: (entry: AirwayDeviceEntry) => string
  /** An instant as the screen's wall-clock time. */
  timeOf: (iso: string) => string
}) {
  const t = useTranslations("intraop.airwaySmart")
  const te = useTranslations("intraop.airwayExchange")
  const [request, setRequest] = useState<AirwaySmartRequest | null>(null)
  const [showOther, setShowOther] = useState(false)
  const choices = airwayChoices(techniques)
  const live = airwayDevicesInUse(entries)
  const shown = [...entries].sort((a, b) => Number(a.status !== "in_use") - Number(b.status !== "in_use"))

  const card = (device: string) => {
    const suggestion = suggestedAirwayDetails(device, patient) as Record<string, unknown>
    const hint = [
      suggestion.oralTubeSize ?? suggestion.nasalTubeSize ?? suggestion.lmaSize,
      suggestion.oralCuffed === true || suggestion.nasalCuffed === true ? t("cuffed") : null,
    ].filter(item => item != null).join(" · ")
    return (
      <button key={device} type="button" data-testid={`airway-smart-card-${device}`} aria-pressed={request?.device === device}
        onClick={() => setRequest({ device, source: "tab" })}
        className={`min-h-[76px] rounded-2xl border-2 px-2 py-2 text-center font-semibold transition-all ${request?.device === device
          ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30"
          : "border-slate-200 dark:border-[#333] hover:border-violet-400"}`}>
        <span className="block text-base">{deviceLabel(device)}</span>
        {hint && <span className="block text-xs font-normal text-slate-500">{hint}</span>}
      </button>
    )
  }

  return (
    <div className="space-y-4" data-testid="airway-smart">
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t("inPlace")}{live.length > 0 ? ` · ${live.length}` : ""}</p>
        {entries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 dark:border-[#333] p-3 text-sm text-slate-500" data-testid="airway-smart-empty">{t("none")}</p>
        ) : shown.map(entry => (
          <div key={entry.id} data-testid={`airway-smart-entry-${entry.id}`}
            className={`flex items-center gap-2 rounded-xl border border-slate-200 dark:border-[#333] bg-slate-50 dark:bg-[#171717] px-3 py-2 ${entry.status !== "in_use" ? "opacity-70 border-dashed" : ""}`}>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${entry.status !== "in_use" ? "line-through" : ""}`}>
                {describe(entry)}
                {entry.status !== "in_use" && <span className="ml-2 text-[11px] font-semibold no-underline rounded-full bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-300 px-2 py-0.5">{te(entry.status)}{entry.endedAt ? ` ${timeOf(entry.endedAt)}` : ""}</span>}
              </p>
              {(entry.instruments?.length ?? 0) > 0 && <p className="text-xs text-slate-500">{t("via", { tools: entry.instruments!.map(toolLabel).join(" · ") })}</p>}
            </div>
            {entry.insertedAt && <span className="font-mono text-xs text-slate-500">{timeOf(entry.insertedAt)}</span>}
            {entry.status === "in_use" && (entry.device === "ORAL_ETT" || entry.device === "NASAL_ETT") && (
              <button type="button" data-testid={`airway-smart-reintubate-${entry.id}`} className="text-xs px-3 py-1 rounded-full border border-slate-300 dark:border-slate-600 hover:border-violet-500"
                onClick={() => setRequest({ device: entry.device, source: "tab", replaces: { id: entry.id, reason: "failed_device" } })}>{t("reintubate")}</button>
            )}
            {entry.status === "in_use" && entry.device !== "ORAL_ETT" && entry.device !== "NASAL_ETT" && ["LMA", "DOUBLE_LUMEN_TUBE", "ENDOBRONCHIAL_TUBE"].includes(entry.device) && (
              <button type="button" data-testid={`airway-smart-exchange-${entry.id}`} className="text-xs px-3 py-1 rounded-full border border-slate-300 dark:border-slate-600 hover:border-violet-500"
                onClick={() => setRequest({ device: entry.device, source: "tab", replaces: { id: entry.id, reason: "planned" } })}>{t("exchange")}</button>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t("addDevice")}</p>
        <div className="grid grid-cols-3 gap-2">{choices.main.map(card)}</div>
        <div className="flex flex-wrap gap-2 items-center">
          {showOther
            ? choices.other.map(device => (
              <button key={device} type="button" data-testid={`airway-smart-other-${device}`} onClick={() => setRequest({ device, source: "tab" })}
                className="px-3 py-1.5 rounded-lg border-2 border-slate-200 dark:border-[#333] text-sm font-semibold text-slate-600 dark:text-slate-300 hover:border-violet-400">
                {deviceLabel(device)}
              </button>
            ))
            : <button type="button" data-testid="airway-smart-more" onClick={() => setShowOther(true)} className="text-sm text-violet-600 dark:text-violet-300 font-semibold px-2 py-1">{t("moreDevices")}</button>}
        </div>
      </div>

      {request && (
        <AirwaySmartPanel key={`${request.device}-${request.replaces?.id ?? ""}`} request={request} entries={entries} patient={patient}
          startedAt={startedAt} now={now} timeZone={timeZone} difficultAirway={difficultAirway} deviceLabel={deviceLabel} toolLabel={toolLabel}
          onSave={next => { setRequest(null); onChange(next) }} onClose={() => setRequest(null)} />
      )}
    </div>
  )
}
