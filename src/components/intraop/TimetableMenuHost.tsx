"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { intraopContinuousMenu, intraopPointMenu, type IntraopMenuAction } from "@lospor/core/intraop-menu"
import {
  intraopDeleteAsksAboutPair,
  intraopDeleteHere,
  intraopDeleteWhole,
  intraopFixBoundary,
  intraopMoveEvent,
  intraopOpsBetween,
  intraopRunEventIds,
  type IntraopEditRefusal,
} from "@lospor/core/intraop-edits"
import { intraopItemRef, intraopStampForColumn, type IntraopItemKind } from "@lospor/core/intraop-commands"
import { INTRAOP_COLUMN_MS, sortIntraopEvents } from "@lospor/core/intraop-engine"
import { instantForTimeInCase, type ClockTime } from "@lospor/core/time-entry"
import { localTimeOf } from "@lospor/core/intraop-time"
import type { LogEvent } from "@lospor/core/intraop-types"
import type { IntraopEventOps } from "@lospor/core/intraop-timetable-edit"
import { TimetableCellMenu } from "./TimetableCellMenu"
import { TimeWheel } from "@/components/time/TimeWheel"
import { TIMETABLE_MENU_COPY, type MenuLocale } from "./timetable-menu-copy"

/**
 * Opens the chart's one menu from any lane (10.8.0) and carries out what Core
 * can do on the log alone: stop (agent, gas, jet), resume, fix start and end,
 * move, delete here and delete whole, remove what is planned. What needs a
 * dialog of its own -- a dose, a syringe, another agent, an infusion's or a
 * fluid's stop with its volume, editing an entry -- goes back to the lane that
 * owns that dialog. Every change shows an Undo bar.
 */
export type ContinuousTarget = { kind: IntraopItemKind; key: string; col: number; rect: DOMRect; title: string }
export type PointTarget = { eventId: string; rect: DOMRect; title: string }

export type LaneDialogs = {
  changeDose: (target: ContinuousTarget, planned: boolean) => void
  changeSyringe: (target: ContinuousTarget) => void
  switchAgent: (target: ContinuousTarget) => void
  /** Infusion and fluid stops ask for a volume or the pump's total. */
  stopWithData: (target: ContinuousTarget) => boolean
  editPoint: (event: LogEvent, rect: DOMRect) => void
  repeatDose: (event: LogEvent, rect: DOMRect) => void
}

type MenuApi = {
  /** True when the cell had something to do (the menu opened). */
  openContinuous: (target: ContinuousTarget) => boolean
  openPoint: (target: PointTarget) => boolean
}

const MenuContext = createContext<MenuApi | null>(null)

/** The menu, from inside a lane; null outside the host (the lane then keeps its old click). */
export function useTimetableMenu(): MenuApi | null {
  return useContext(MenuContext)
}

type Open =
  | { kind: "continuous"; target: ContinuousTarget; actions: IntraopMenuAction[] }
  | { kind: "point"; target: PointTarget; event: LogEvent; actions: IntraopMenuAction[] }

type Wheel = { title: string; value: ClockTime; reference: Date; apply: (instant: Date) => IntraopEditRefusal | null }

const STOP_TYPE: Record<"agent" | "gas" | "jet", LogEvent["type"]> = { agent: "agent_stop", gas: "gas_stop", jet: "jet_stop" }

function uid(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("")
}

export function TimetableMenuHost({ children, log, applyOps, gridStartMs, startedAt, endedAt, timeZone, locale, readOnly, now, dialogs }: {
  children: ReactNode
  log: LogEvent[]
  applyOps: (ops: IntraopEventOps) => void
  gridStartMs: number | null
  startedAt: Date | null
  endedAt: Date | null
  timeZone: string
  locale: MenuLocale
  readOnly: boolean
  now: () => Date
  dialogs: LaneDialogs
}) {
  const copy = TIMETABLE_MENU_COPY[locale]
  const [open, setOpen] = useState<Open | null>(null)
  const [wheel, setWheel] = useState<Wheel | null>(null)
  const [pairQuestion, setPairQuestion] = useState<string | null>(null)
  const [undo, setUndo] = useState<{ label: string; before: LogEvent[]; after: LogEvent[] } | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const logRef = useRef(log)
  useEffect(() => { logRef.current = log }, [log])

  const cellOf = useCallback((col: number) => {
    const start = (gridStartMs ?? 0) + col * INTRAOP_COLUMN_MS
    return { start, end: start + INTRAOP_COLUMN_MS }
  }, [gridStartMs])
  const timeOf = useCallback((value: Date | string) => localTimeOf(new Date(value), timeZone) ?? "", [timeZone])

  const commit = useCallback((next: LogEvent[], label: string) => {
    const before = logRef.current
    const ops = intraopOpsBetween(before, next)
    if (ops.add.length + ops.update.length + ops.remove.length === 0) return
    applyOps(ops)
    setUndo({ label, before, after: next })
    if (undoTimer.current) clearTimeout(undoTimer.current)
    undoTimer.current = setTimeout(() => setUndo(null), 9000)
  }, [applyOps])
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current) }, [])

  const refuse = useCallback((code: IntraopEditRefusal) => {
    setRefusal(copy.refusals[code] ?? copy.refusals.TIMELINE)
    setTimeout(() => setRefusal(null), 6000)
  }, [copy])

  const api = useMemo<MenuApi>(() => ({
    openContinuous: target => {
      if (readOnly) return false
      const cell = cellOf(target.col)
      const actions = intraopContinuousMenu(logRef.current, target, cell, { now: now(), endedAt })
      if (actions.length > 0) setOpen({ kind: "continuous", target, actions })
      return actions.length > 0
    },
    openPoint: target => {
      if (readOnly) return false
      const event = logRef.current.find(item => item.id === target.eventId)
      if (!event) return false
      const actions = intraopPointMenu(event, { readOnly })
      if (actions.length > 0) setOpen({ kind: "point", target, event, actions })
      return actions.length > 0
    },
  }), [cellOf, endedAt, now, readOnly])

  const editContext = () => ({ now: now(), startedAt, endedAt })
  const clockOf = (instant: Date): ClockTime => {
    const [hour, minute] = (localTimeOf(instant, timeZone) ?? "00:00").split(":").map(Number)
    return { hour, minute }
  }

  const runEventsInCell = (target: ContinuousTarget) => {
    const cell = cellOf(target.col)
    return sortIntraopEvents(logRef.current).filter(event => {
      const ref = intraopItemRef(event)
      const at = Date.parse(event.ts)
      return ref && ref.kind === target.kind && ref.key === target.key && at >= cell.start && at < cell.end
    })
  }
  const lastStartOf = (target: ContinuousTarget) => [...sortIntraopEvents(logRef.current)].reverse()
    .find(event => { const ref = intraopItemRef(event); return ref?.role === "start" && ref.kind === target.kind && ref.key === target.key && Date.parse(event.ts) < cellOf(target.col).end })

  const stampAt = (col: number) => gridStartMs == null ? now().toISOString() : intraopStampForColumn({ chartStart: gridStartMs, column: col, now: now() })

  function onContinuous(action: IntraopMenuAction, target: ContinuousTarget) {
    const start = lastStartOf(target)
    const future = cellOf(target.col).start > now().getTime()
    switch (action) {
      case "stop":
      case "plan_stop": {
        if (target.kind === "infusion" || target.kind === "fluid") { if (dialogs.stopWithData(target)) return }
        const ts = stampAt(target.col)
        const stop: LogEvent = target.kind === "infusion" ? { id: uid(), ts, type: "infusion_stop", infId: target.key, recordedAt: now().toISOString() }
          : target.kind === "fluid" ? { id: uid(), ts, type: "fluid_end", fluidId: target.key, recordedAt: now().toISOString() }
            : { id: uid(), ts, type: STOP_TYPE[target.kind], ...(target.kind === "agent" ? { name: target.key, agentMode: "concurrent" as const } : {}), recordedAt: now().toISOString() }
        commit([...logRef.current, stop], copy.done.stopped(target.title, timeOf(ts)))
        return
      }
      case "change_dose":
      case "plan_change": return dialogs.changeDose(target, future || action === "plan_change")
      case "change_syringe": return dialogs.changeSyringe(target)
      case "switch_agent": return dialogs.switchAgent(target)
      case "resume": {
        if (!start) return
        const ts = stampAt(target.col)
        const { id: _id, recordedAt: _recordedAt, ...fields } = start
        commit([...logRef.current, { ...fields, id: uid(), ts, recordedAt: now().toISOString() }], copy.done.resumed(target.title, timeOf(ts)))
        return
      }
      case "fix_start":
      case "fix_end": {
        if (!start) return
        const runIds = intraopRunEventIds(logRef.current, start.id)
        const run = sortIntraopEvents(logRef.current.filter(event => runIds.includes(event.id)))
        const edge = action === "fix_start" ? run[0] : run.find(event => intraopItemRef(event)?.role === "stop") ?? run[run.length - 1]
        const reference = new Date(edge.ts)
        setWheel({
          title: `${action === "fix_start" ? copy.labels.fix_start : copy.labels.fix_end} · ${target.title}`,
          value: clockOf(reference),
          reference,
          apply: instant => {
            const result = intraopFixBoundary(logRef.current, start.id, action === "fix_start" ? "start" : "end", instant, editContext())
            if (!result.ok) return result.refusal
            commit(result.events, copy.done.fixed(target.title, timeOf(instant)))
            return null
          },
        })
        return
      }
      case "delete_here": {
        const here = runEventsInCell(target)[0]
        if (!here) return
        commit(intraopDeleteHere(logRef.current, here.id), copy.done.deleted(target.title))
        return
      }
      case "remove_planned": {
        const planned = runEventsInCell(target).filter(event => Date.parse(event.ts) > now().getTime())
        if (planned.length === 0) return
        let next = logRef.current
        for (const event of planned) next = intraopDeleteHere(next, event.id)
        commit(next, copy.done.deleted(target.title))
        return
      }
      case "delete_whole": {
        if (!start) return
        commit(intraopDeleteWhole(logRef.current, start.id), copy.done.deletedWhole(target.title))
        return
      }
      default:
    }
  }

  function onPoint(action: IntraopMenuAction, target: PointTarget, event: LogEvent) {
    switch (action) {
      case "repeat_dose": return dialogs.repeatDose(event, target.rect)
      case "edit": return dialogs.editPoint(event, target.rect)
      case "move": {
        const reference = new Date(event.ts)
        setWheel({
          title: `${copy.labels.move} · ${target.title}`,
          value: clockOf(reference),
          reference,
          apply: instant => {
            const result = intraopMoveEvent(logRef.current, event.id, instant, editContext())
            if (!result.ok) return result.refusal
            commit(result.events, copy.done.moved(target.title, timeOf(instant)))
            return null
          },
        })
        return
      }
      case "delete": {
        if (intraopDeleteAsksAboutPair(logRef.current, event.id)) { setPairQuestion(event.id); return }
        commit(intraopDeleteHere(logRef.current, event.id), copy.done.deleted(target.title))
        return
      }
      default:
    }
  }

  return (
    <MenuContext.Provider value={api}>
      {children}
      {open ? (
        <TimetableCellMenu
          anchor={open.target.rect}
          title={open.target.title}
          subtitle={open.kind === "point" ? timeOf(open.event.ts) : undefined}
          actions={open.actions}
          labels={copy.labels}
          onClose={() => setOpen(null)}
          onAction={action => {
            const current = open
            setOpen(null)
            if (current.kind === "continuous") onContinuous(action, current.target)
            else onPoint(action, current.target, current.event)
          }}
        />
      ) : null}
      {wheel ? (
        <TimeWheelDialog
          wheel={wheel}
          copy={copy}
          onClose={() => setWheel(null)}
          onConfirm={clock => {
            const instant = instantForTimeInCase(clock, { timeZone, reference: wheel.reference, startedAt, endedAt })
            if (!instant) return
            const refused = wheel.apply(instant)
            if (refused) refuse(refused)
            else setWheel(null)
          }}
        />
      ) : null}
      {pairQuestion ? (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white dark:bg-[#1f1f1f] p-4 shadow-xl">
            <p className="text-sm font-semibold text-slate-900 dark:text-white mb-3">{copy.pair.question}</p>
            <div className="flex flex-col gap-2">
              <button type="button" className="min-h-11 rounded-lg bg-red-600 text-white font-semibold" onClick={() => { commit(intraopDeleteHere(logRef.current, pairQuestion, { withPair: true }), copy.pair.both); setPairQuestion(null) }}>{copy.pair.both}</button>
              <button type="button" className="min-h-11 rounded-lg border border-slate-300 dark:border-[#4a4a4a] font-semibold" onClick={() => { commit(intraopDeleteHere(logRef.current, pairQuestion), copy.pair.onlyThis); setPairQuestion(null) }}>{copy.pair.onlyThis}</button>
              <button type="button" className="min-h-11 rounded-lg font-semibold text-slate-500" onClick={() => setPairQuestion(null)}>{copy.cancel}</button>
            </div>
          </div>
        </div>
      ) : null}
      {(undo || refusal) ? (
        <div role="status" data-testid="timetable-undo-bar" className="fixed left-1/2 -translate-x-1/2 bottom-24 z-[65] flex items-center gap-3 rounded-full bg-slate-900 dark:bg-[#2a2a2a] text-white pl-4 pr-1.5 py-1.5 shadow-xl max-w-[calc(100vw-16px)]">
          <span className="text-sm truncate">{refusal ?? undo?.label}</span>
          {undo && !refusal ? (
            <button type="button" data-testid="timetable-undo-bar-undo" className="min-h-11 min-w-11 rounded-full px-4 font-bold text-amber-300 hover:bg-white/10"
              onClick={() => { commit(undo.before, copy.done.undone); setUndo(null) }}>
              {copy.undo}
            </button>
          ) : null}
        </div>
      ) : null}
    </MenuContext.Provider>
  )
}

function TimeWheelDialog({ wheel, copy, onClose, onConfirm }: {
  wheel: Wheel
  copy: (typeof TIMETABLE_MENU_COPY)["bg"]
  onClose: () => void
  onConfirm: (clock: ClockTime) => void
}) {
  const [value, setValue] = useState(wheel.value)
  return (
    <div role="dialog" aria-modal="true" aria-label={wheel.title} className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onPointerDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="w-full max-w-xs rounded-xl bg-white dark:bg-[#1f1f1f] p-4 shadow-xl">
        <p className="text-sm font-bold text-slate-900 dark:text-white mb-3">{wheel.title}</p>
        <TimeWheel value={value} onChange={setValue} labels={copy.wheel} />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" className="min-h-11 rounded-lg border border-slate-300 dark:border-[#4a4a4a] font-semibold" onClick={onClose}>{copy.cancel}</button>
          <button type="button" data-testid="time-wheel-confirm" className="min-h-11 rounded-lg bg-blue-600 text-white font-semibold" onClick={() => onConfirm(value)}>{copy.confirm}</button>
        </div>
      </div>
    </div>
  )
}
