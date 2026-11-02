"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { X } from "lucide-react"
import {
  airwayDevicesInUse,
  type AirwayDeviceEntry,
  type AirwayExchangeReason,
} from "@lospor/core/airway-device-entries"
import {
  addAirwayDevice,
  airwayAsks,
  airwayAsksHow,
  airwayHowOrder,
  resolveAirwayTime,
  suggestedAirwayDetails,
  type AirwayPatient,
  type AirwayTimeChoice,
} from "@lospor/core/airway-smart"
import { instantFromLocalTime, localTimeOf } from "@lospor/core/intraop-time"

/**
 * The one panel Smart selection adds a device with (10.2.0): size and cuff
 * (the size suggested for this patient marked), how it was placed, and when.
 * It opens under the Airway tab, and from the timeline when Intubated, LMA in
 * and the like are charted, with that time already set. What it offers and how
 * it saves is Core's (airway-smart), so the phone cannot drift from it.
 */

export type AirwaySmartRequest = {
  device: string
  /** The time the timeline cell stands for, when opened from the timeline. */
  at?: string | null
  source: "tab" | "timeline"
  /** The device being taken out, and why: Reintubate and Exchange. */
  replaces?: { id: string; reason: AirwayExchangeReason } | null
}

const WHY: readonly Exclude<AirwayExchangeReason, "reintubation">[] = ["failed_device", "planned", "unplanned_extubation"]

type Details = Record<string, string | number | boolean | null | undefined>

export function AirwaySmartPanel({
  request, entries, patient, startedAt, now, timeZone, difficultAirway, deviceLabel, toolLabel, onSave, onClose,
}: {
  request: AirwaySmartRequest
  entries: readonly AirwayDeviceEntry[]
  patient: AirwayPatient
  startedAt: string | null
  now: () => string
  timeZone: string | null
  difficultAirway: boolean
  deviceLabel: (code: string) => string
  toolLabel: (code: string) => string
  onSave: (next: AirwayDeviceEntry[]) => void
  onClose: () => void
}) {
  const t = useTranslations("intraop.airwaySmart")
  const ta = useTranslations("intraop.airway")
  const te = useTranslations("intraop.airwayExchange")
  const suggested = useMemo(() => suggestedAirwayDetails(request.device, patient) as Details, [request.device, patient])
  const asks = airwayAsks(request.device)
  const [details, setDetails] = useState<Details>(suggested)
  const [how, setHow] = useState<string[]>([])
  const [reason, setReason] = useState<AirwayExchangeReason | null>(request.replaces?.reason ?? null)
  const [choice, setChoice] = useState<AirwayTimeChoice>(request.source === "timeline" ? "timeline" : request.replaces ? "now" : "start")
  const [picked, setPicked] = useState<string>(() => {
    const at = request.at ?? now()
    return (timeZone ? localTimeOf(new Date(at), timeZone) : null) ?? at.slice(11, 16)
  })
  const startLabel = startedAt && timeZone ? localTimeOf(new Date(startedAt), timeZone) : null
  const nowLabel = timeZone ? localTimeOf(new Date(now()), timeZone) : null
  const timelineLabel = request.at && timeZone ? localTimeOf(new Date(request.at), timeZone) : null

  function instant(): string {
    const pickedInstant = timeZone && /^\d{1,2}:\d{2}$/.test(picked)
      ? instantFromLocalTime(new Date(startedAt ?? now()), picked, timeZone)?.toISOString() ?? null
      : null
    return resolveAirwayTime(choice, { startedAt, now: now(), picked: choice === "timeline" ? request.at ?? null : pickedInstant })
  }

  function save() {
    if (request.replaces && !reason) return
    const at = instant()
    const id = `airway-${Date.parse(at)}-${entries.length + 1}`
    const kept = Object.fromEntries(asks.filter(ask => details[ask.field] !== undefined && details[ask.field] !== "").map(ask => [ask.field, details[ask.field]]))
    onSave(addAirwayDevice(entries, {
      id, device: request.device, details: kept, insertedAt: at, instruments: how,
      replaces: request.replaces ? { id: request.replaces.id, reason: reason ?? request.replaces.reason } : null,
    }))
  }

  const pill = (active: boolean) => `px-3 py-1.5 rounded-lg border-2 text-sm font-semibold transition-all ${active
    ? "bg-violet-600 border-violet-600 text-white"
    : "border-slate-200 dark:border-[#333] text-slate-600 dark:text-slate-300 hover:border-violet-400"}`
  const label = (text: string) => <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{text}</p>
  const inUse = airwayDevicesInUse(entries)
  const replaced = request.replaces ? inUse.find(entry => entry.id === request.replaces!.id) : null

  return (
    <section role="group" aria-label={deviceLabel(request.device)} data-testid="airway-smart-panel"
      className="rounded-xl border border-violet-500/60 bg-slate-50 dark:bg-[#171717] p-3 space-y-3">
      <header className="flex items-center gap-2">
        <p className="flex-1 text-sm font-semibold">{deviceLabel(request.device)}</p>
        <button type="button" onClick={onClose} aria-label={te("cancel")} className="p-1"><X className="w-4 h-4" /></button>
      </header>

      {request.replaces && (
        <div className="space-y-1.5">
          {label(te("why"))}
          <div className="flex flex-wrap gap-2">
            {WHY.map(option => (
              <button key={option} type="button" data-testid={`airway-smart-why-${option}`} className={pill(reason === option)} onClick={() => setReason(option)}>
                {te(`reason.${option}`)}
              </button>
            ))}
          </div>
          {replaced && <p className="text-xs rounded-lg bg-violet-100 dark:bg-violet-950/40 px-2 py-1.5">{t("oldStays", { device: deviceLabel(replaced.device), status: reason === "planned" ? te("replaced") : te("failed") })}</p>}
        </div>
      )}

      {asks.map(ask => (
        <div key={ask.field} className="space-y-1.5">
          {label(ask.kind === "cuff" ? t("cuff") : ask.kind === "size" ? t("size") : ask.field === "dltType" ? ta("dltType") : ta("dltSide"))}
          <div className="flex flex-wrap gap-2">
            {ask.kind === "cuff" && (
              <>
                <button type="button" data-testid="airway-smart-cuffed" className={pill(details[ask.field] === true)} onClick={() => setDetails(prev => ({ ...prev, [ask.field]: true }))}>{t("cuffed")}</button>
                <button type="button" data-testid="airway-smart-uncuffed" className={pill(details[ask.field] === false)} onClick={() => setDetails(prev => ({ ...prev, [ask.field]: false }))}>{t("uncuffed")}</button>
              </>
            )}
            {ask.kind !== "cuff" && ask.values.map(value => (
              <button key={String(value)} type="button" data-testid={`airway-smart-${ask.field}-${value}`} className={pill(details[ask.field] === value)}
                onClick={() => setDetails(prev => ({ ...prev, [ask.field]: value }))}>
                {String(value)}
                {suggested[ask.field] === value && <span className="ml-1 text-[10px] font-normal opacity-80">{t("suggested")}</span>}
              </button>
            ))}
          </div>
        </div>
      ))}

      {airwayAsksHow(request.device) && (
        <div className="space-y-1.5">
          {label(t("how"))}
          <div className="flex flex-wrap gap-2">
            {airwayHowOrder(difficultAirway).map(code => (
              <button key={code} type="button" data-testid={`airway-smart-how-${code}`} className={pill(how.includes(code))}
                onClick={() => setHow(prev => prev.includes(code) ? prev.filter(item => item !== code) : [...prev, code])}>
                {toolLabel(code)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {label(t("time"))}
        <div className="flex flex-wrap items-center gap-2">
          {request.source === "timeline" && (
            <button type="button" data-testid="airway-smart-time-timeline" className={pill(choice === "timeline")} onClick={() => setChoice("timeline")}>
              {t("fromTimeline", { time: timelineLabel ?? "" })}
            </button>
          )}
          <button type="button" data-testid="airway-smart-time-start" className={pill(choice === "start")} onClick={() => setChoice("start")}>
            {t("startOfAnaesthesia", { time: startLabel ?? "" })}
          </button>
          <button type="button" data-testid="airway-smart-time-now" className={pill(choice === "now")} onClick={() => setChoice("now")}>
            {t("now", { time: nowLabel ?? "" })}
          </button>
          <button type="button" data-testid="airway-smart-time-pick" className={pill(choice === "pick")} onClick={() => setChoice("pick")}>{t("pickTime")}</button>
          {choice === "pick" && (
            <input type="time" step={300} value={picked} aria-label={t("time")} data-testid="airway-smart-time-input"
              onChange={event => setPicked(event.target.value)}
              className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent font-mono text-sm" />
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="text-xs px-3 py-1.5 rounded-full border border-slate-300 dark:border-slate-600">{te("cancel")}</button>
        <button type="button" data-testid="airway-smart-add" disabled={!!request.replaces && !reason} onClick={save}
          className="text-xs px-4 py-1.5 rounded-full bg-violet-600 text-white font-semibold disabled:opacity-50">{t("add")}</button>
      </div>
    </section>
  )
}
