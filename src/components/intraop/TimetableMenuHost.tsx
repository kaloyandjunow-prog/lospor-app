"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { intraopContinuousMenu, intraopPointMenu, type IntraopMenuAction } from "@lospor/core/intraop-menu"
import { ChartCursor } from "./chart-cursor"
import { PairQuestion, StillRunningBar, TimeWheelDialog, UndoBar } from "./timetable-menu-overlays"
import {
  intraopDeleteAsksAboutPair,
  intraopDeleteHere,
  intraopDeleteWhole,
  intraopFixBoundary,
  intraopMoveEvent,
  intraopOpsBetween,
  intraopRunEventIds,
  intraopStillRunningQuestion,
  intraopStopAt,
  type IntraopEditRefusal,
} from "@lospor/core/intraop-edits"
import { EMPTY_INTRAOP_HISTORY, intraopHistoryPush, intraopHistoryRedo, intraopHistoryUndo, intraopUndoEntry, type IntraopHistory } from "@lospor/core/intraop-undo"
import { intraopItemRef, intraopStampForColumn, type IntraopItemKind } from "@lospor/core/intraop-commands"
import { INTRAOP_COLUMN_MS, sortIntraopEvents } from "@lospor/core/intraop-engine"
import { instantForTimeInCase, type ClockTime } from "@lospor/core/time-entry"
import { localTimeOf } from "@lospor/core/intraop-time"
import type { LogEvent } from "@lospor/core/intraop-types"
import type { IntraopEventOps } from "@lospor/core/intraop-timetable-edit"
import { TimetableCellMenu } from "./TimetableCellMenu"
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
  /** True when the lane opened its own editor (a drug's dose); otherwise Edit sets the time, as on the PWA. */
  editPoint: (event: LogEvent, rect: DOMRect) => boolean | void
  /** True when a dose sheet took it; otherwise the entry is repeated at now as it was (the event log). */
  repeatDose: (event: LogEvent, rect: DOMRect) => boolean | void
}

/** What the lanes need to draw totals and the current dose (10.8.0). */
export type ChartFacts = { ibw: number | null; tbw: number | null; tciPatient: unknown; nowCol: number | null; chartChangedAt?: number }

/**
 * The menu's own many-step history (10.8.0), Core's, as on the PWA. Undo and Redo
 * (toolbar, Ctrl+Z / Ctrl+Y) take the newer of this and the chart's own history.
 */
export type MenuHistory = { canUndo: boolean; canRedo: boolean; lastAt: number; undo: () => boolean; redo: () => boolean }

type MenuApi = {
  history: MenuHistory
  /** True when the cell had something to do (the menu opened). */
  openContinuous: (target: ContinuousTarget) => boolean
  openPoint: (target: PointTarget) => boolean
  /** The keyboard's Delete: what is in that cell, or that entry, with Undo. */
  deleteAt: (target: { kind: string; key: string; col: number } | { eventId: string }) => void
  facts: ChartFacts
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

export function TimetableMenuHost({ children, log, applyOps, gridStartMs, startedAt, endedAt, timeZone, locale, readOnly, now, dialogs, facts, cursor = true }: {
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
  facts?: ChartFacts
  cursor?: boolean // the chart's keyboard and touch cursor; off for the event log's own host
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
  // 10.8.0 (rule 3): a start charted in an earlier cell is asked about at once -- Core's rule, as on the PWA.
  const [openedAt] = useState(() => now().toISOString())
  const [knownIds] = useState(() => new Set(log.map(event => event.id)))
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(() => new Set())
  const stillRunning = readOnly || gridStartMs == null ? null
    : intraopStillRunningQuestion(log, { knownIds, answeredIds, now: now(), chartStart: gridStartMs, enteredSince: openedAt })
  const answerStillRunning = (id: string) => setAnsweredIds(previous => new Set(previous).add(id))

  const cellOf = useCallback((col: number) => {
    const start = (gridStartMs ?? 0) + col * INTRAOP_COLUMN_MS
    return { start, end: start + INTRAOP_COLUMN_MS }
  }, [gridStartMs])
  const timeOf = useCallback((value: Date | string) => localTimeOf(new Date(value), timeZone) ?? "", [timeZone])

  // The menu's many-step history (Core's, as on the PWA) and when it last grew.
  const [history, setHistory] = useState<IntraopHistory>(EMPTY_INTRAOP_HISTORY)
  const [historyAt, setHistoryAt] = useState(0)
  const historyRef = useRef(history)
  useEffect(() => { historyRef.current = history }, [history])
  const showBar = useCallback((label: string, before: LogEvent[], after: LogEvent[]) => {
    setUndo({ label, before, after })
    if (undoTimer.current) clearTimeout(undoTimer.current)
    undoTimer.current = setTimeout(() => setUndo(null), 9000)
  }, [])
  const commit = useCallback((next: LogEvent[], label: string) => {
    const before = logRef.current
    const ops = intraopOpsBetween(before, next)
    if (ops.add.length + ops.update.length + ops.remove.length === 0) return
    applyOps(ops)
    setHistory(current => intraopHistoryPush(current, intraopUndoEntry(before, next, label)))
    setHistoryAt(Date.now())
    showBar(label, before, next)
  }, [applyOps, showBar])
  const step = useCallback((direction: "undo" | "redo") => {
    const result = (direction === "undo" ? intraopHistoryUndo : intraopHistoryRedo)(historyRef.current, logRef.current)
    if (!result) return false
    applyOps(intraopOpsBetween(logRef.current, result.events))
    setHistory(result.history)
    historyRef.current = result.history
    setUndo(null)
    setRefusal(`${direction === "undo" ? copy.done.undone : copy.redone}: ${result.entry.label}`)
    setTimeout(() => setRefusal(null), 4000)
    return true
  }, [applyOps, copy])
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current) }, [])
  const commitRef = useRef(commit)
  const deletedLabelRef = useRef(copy.done.deleted)
  useEffect(() => { commitRef.current = commit; deletedLabelRef.current = copy.done.deleted }, [commit, copy])

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
    deleteAt: target => {
      if (readOnly) return
      if ("eventId" in target) {
        const event = logRef.current.find(item => item.id === target.eventId)
        if (!event) return
        if (intraopDeleteAsksAboutPair(logRef.current, event.id)) { setPairQuestion(event.id); return }
        commitRef.current(intraopDeleteHere(logRef.current, event.id), deletedLabelRef.current(event.name ?? event.label ?? ""))
        return
      }
      const cell = cellOf(target.col)
      const here = sortIntraopEvents(logRef.current).find(event => {
        const ref = intraopItemRef(event)
        const at = Date.parse(event.ts)
        return ref && ref.kind === target.kind && ref.key === target.key && at >= cell.start && at < cell.end
      })
      if (here) commitRef.current(intraopDeleteHere(logRef.current, here.id), deletedLabelRef.current(target.key))
    },
    facts: facts ?? { ibw: null, tbw: null, tciPatient: null, nowCol: null },
    history: {
      canUndo: history.done.length > 0,
      canRedo: history.undone.length > 0,
      lastAt: historyAt,
      undo: () => step("undo"),
      redo: () => step("redo"),
    },
  }), [cellOf, endedAt, facts, history, historyAt, now, readOnly, step])

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
      case "repeat_dose": {
        if (dialogs.repeatDose(event, target.rect) === true) return
        const { id: _id, recordedAt: _recordedAt, ...fields } = event, ts = now().toISOString()
        return commit([...logRef.current, { ...fields, id: uid(), ts, recordedAt: ts } as LogEvent], copy.done.repeated(target.title, timeOf(ts)))
      }
      case "edit":
        if (dialogs.editPoint(event, target.rect) === true) return
      // falls through: an entry with no editor of its own has its time edited
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
      {cursor ? <ChartCursor /> : null}
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
          title={wheel.title}
          initial={wheel.value}
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
        <PairQuestion copy={copy}
          onBoth={() => { commit(intraopDeleteHere(logRef.current, pairQuestion, { withPair: true }), copy.pair.both); setPairQuestion(null) }}
          onOnlyThis={() => { commit(intraopDeleteHere(logRef.current, pairQuestion), copy.pair.onlyThis); setPairQuestion(null) }}
          onCancel={() => setPairQuestion(null)} />
      ) : null}
      {stillRunning && !wheel ? (
        <StillRunningBar copy={copy} title={stillRunning.name ?? stillRunning.label ?? ""} time={timeOf(stillRunning.ts)}
          onRunning={() => answerStillRunning(stillRunning.id)}
          onStopped={() => {
            const start = stillRunning
            answerStillRunning(start.id)
            const reference = now()
            setWheel({
              title: copy.stillRunning.stopped, value: clockOf(reference), reference,
              apply: instant => {
                const result = intraopStopAt(logRef.current, start.id, instant, editContext())
                if (!result.ok) return result.refusal
                commit(result.events, copy.done.stopped(start.name ?? "", timeOf(instant)))
                return null
              },
            })
          }} />
      ) : null}
      {(undo || refusal) ? (
        <UndoBar copy={copy} text={refusal ?? undo?.label ?? ""} canUndo={!!undo && !refusal} onUndo={() => { step("undo") }} />
      ) : null}
    </MenuContext.Provider>
  )
}

