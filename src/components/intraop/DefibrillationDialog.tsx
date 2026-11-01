"use client"

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import { useTranslations } from "next-intl"
import {
  DEFIBRILLATION_KNOB_SWEEP,
  DEFIBRILLATION_MAX_J,
  DEFIBRILLATION_MIN_J,
  clampDefibrillationEnergy,
  defibrillationEnergyAtAngle,
  defibrillationKnobAngle,
  isValidDefibrillationEnergy,
} from "@lospor/core/defibrillation"

const SIZE = 200
const CENTER = SIZE / 2
const RADIUS = 80

function point(angle: number) {
  const rad = angle * Math.PI / 180
  return { x: CENTER + RADIUS * Math.sin(rad), y: CENTER - RADIUS * Math.cos(rad) }
}

function arc(toAngle: number) {
  const start = point(-DEFIBRILLATION_KNOB_SWEEP / 2)
  const end = point(toAngle)
  const large = toAngle + DEFIBRILLATION_KNOB_SWEEP / 2 > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${end.x} ${end.y}`
}

/**
 * A shock on the web chart (10.1.0), the PWA's sheet in a dialog: a dial for
 * the energy (drag it, or use the arrow keys), − / + buttons, and two
 * separate buttons for synchronised or not. Synchronisation is never
 * preselected and nothing saves until both are set; a child's energy is
 * prefilled from the paediatric reference and says so.
 */
export function DefibrillationDialog({ timeLabel, shockNumber, prefillJoules, onCancel, onSave }: {
  timeLabel: string
  shockNumber: number
  prefillJoules: number | null
  onCancel: () => void
  onSave: (energyJ: number, synchronized: boolean) => void
}) {
  const t = useTranslations("intraop.defibrillation")
  const [energy, setEnergy] = useState<number | null>(prefillJoules)
  const [synchronized, setSynchronized] = useState<boolean | null>(null)
  const dialRef = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)

  const fromPointer = (event: PointerEvent<SVGSVGElement>) => {
    const box = dialRef.current?.getBoundingClientRect()
    if (!box) return
    const dx = event.clientX - (box.left + box.width / 2)
    const dy = box.top + box.height / 2 - event.clientY
    setEnergy(defibrillationEnergyAtAngle(Math.atan2(dx, dy) * 180 / Math.PI))
  }
  const step = (delta: number) => setEnergy(current => clampDefibrillationEnergy((current ?? (delta > 0 ? DEFIBRILLATION_MIN_J - 1 : DEFIBRILLATION_MIN_J + 1)) + delta))
  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    const deltas: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }
    if (deltas[event.key] != null) { event.preventDefault(); step(deltas[event.key]) }
  }
  const angle = energy == null ? null : defibrillationKnobAngle(energy)
  const thumb = angle == null ? null : point(angle)
  const ready = isValidDefibrillationEnergy(energy) && synchronized != null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="defib-title" data-testid="defibrillation-dialog">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#333] p-5 space-y-4 shadow-xl">
        <h2 id="defib-title" className="text-base font-semibold text-slate-800 dark:text-slate-100">
          {t("title")} · {timeLabel} · {t("shockNumber", { n: shockNumber })}
        </h2>
        <div className="flex flex-col items-center">
          <div className="relative" style={{ width: SIZE, height: SIZE }}>
            <svg
              ref={dialRef} width={SIZE} height={SIZE} role="slider" tabIndex={0} data-testid="defib-dial"
              aria-label={t("energy")} aria-valuemin={DEFIBRILLATION_MIN_J} aria-valuemax={DEFIBRILLATION_MAX_J}
              aria-valuenow={energy ?? undefined} aria-valuetext={energy == null ? t("setEnergy") : `${energy} J`}
              className="touch-none cursor-pointer rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              onPointerDown={event => { dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); fromPointer(event) }}
              onPointerMove={event => { if (dragging.current) fromPointer(event) }}
              onPointerUp={() => { dragging.current = false }}
              onKeyDown={onKey}
            >
              <path d={arc(DEFIBRILLATION_KNOB_SWEEP / 2)} className="stroke-slate-200 dark:stroke-slate-700" strokeWidth={16} strokeLinecap="round" fill="none" />
              {angle != null && <path d={arc(angle)} className="stroke-amber-500" strokeWidth={16} strokeLinecap="round" fill="none" />}
              {thumb && <circle cx={thumb.x} cy={thumb.y} r={13} className="fill-white stroke-amber-500" strokeWidth={4} />}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span data-testid="defib-readout" className={`text-5xl font-black tabular-nums ${energy == null ? "text-slate-400" : "text-slate-900 dark:text-white"}`}>{energy ?? "—"}</span>
              <span className="text-sm font-bold text-slate-500">J</span>
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            {[-10, -1, 1, 10].map(delta => (
              <button key={delta} type="button" data-testid={`defib-step-${delta}`} onClick={() => step(delta)}
                aria-label={`${t("energy")} ${delta > 0 ? "+" : "−"}${Math.abs(delta)}`}
                className="min-w-12 rounded-lg border border-slate-300 dark:border-[#444] px-3 py-2 text-base font-bold text-slate-700 dark:text-slate-200">
                {delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">{DEFIBRILLATION_MIN_J}–{DEFIBRILLATION_MAX_J} J</p>
        </div>
        {prefillJoules != null && <p data-testid="defib-prefill-hint" className="text-xs text-amber-700 dark:text-amber-400">{t("prefillHint", { ref: `${prefillJoules} J` })}</p>}
        <div className="flex gap-2">
          {([false, true] as const).map(value => (
            <button key={String(value)} type="button" data-testid={value ? "defib-sync" : "defib-unsync"} aria-pressed={synchronized === value}
              onClick={() => setSynchronized(value)}
              className={`flex-1 rounded-xl border-2 px-3 py-3 text-sm font-bold ${synchronized === value
                ? "border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
                : "border-slate-300 dark:border-[#444] text-slate-600 dark:text-slate-300"}`}>
              {value ? t("sync") : t("unsync")}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-slate-300 dark:border-[#444] px-3 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300">{t("cancel")}</button>
          <button type="button" data-testid="defib-save" disabled={!ready} onClick={() => { if (ready) onSave(energy!, synchronized!) }}
            className="flex-1 rounded-xl bg-amber-500 px-3 py-2.5 text-sm font-bold text-slate-900 disabled:opacity-40">
            {!isValidDefibrillationEnergy(energy) ? t("setEnergy") : synchronized == null ? t("chooseSync") : t("save")}
          </button>
        </div>
      </div>
    </div>
  )
}
