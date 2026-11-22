"use client"

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { MoreHorizontal } from "lucide-react"
import { calendarDateKey, parseCalendarDateKey, type CalendarDate } from "@lospor/core/time-entry"
import { calendarDayKey } from "@lospor/core/dashboard-date-scope"
import { DateWheel } from "@/components/time/DateWheel"

/**
 * A dashboard row's menu (10.8.0). The actions that can do harm -- delete a
 * draft, mark the procedure cancelled -- are no longer buttons beside the row
 * where a finger lands on them by mistake: they are in here, with the planned
 * date of the operation and the case's anaesthesia nurses.
 */
type Nurse = { id: string; name: string; firstName?: string; lastName?: string; title?: string }

const COPY = {
  bg: { menu: "Действия със случая", planned: "Планирана дата на операцията", clear: "Изчисти датата", nurses: "Анестезиологични сестри", none: "Няма анестезиологични сестри в отделението.", save: "Запази", cancel: "Отказ", day: "Ден", month: "Месец", year: "Година" },
  en: { menu: "Case actions", planned: "Planned operation date", clear: "Clear the date", nurses: "Anaesthesia nurses", none: "No anaesthesia nurses in the department.", save: "Save", cancel: "Cancel", day: "Day", month: "Month", year: "Year" },
} as const
type Copy = (typeof COPY)[keyof typeof COPY]

export function CaseRowMenu({ caseId, locale, plannedSurgeryDate, canPlan, canAssignNurses, children }: {
  caseId: string
  locale: string
  plannedSurgeryDate: string | null
  canPlan: boolean
  canAssignNurses: boolean
  /** The row's own harmful actions (delete, cancel), shown inside the menu. */
  children?: ReactNode
}) {
  const copy = COPY[locale === "bg" ? "bg" : "en"]
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState<"date" | "nurses" | null>(null)
  const ref = useRef<HTMLDivElement | null>(null)
  const panel = useRef<HTMLDivElement | null>(null)
  const [up, setUp] = useState(false)

  useLayoutEffect(() => {
    if (!open || !panel.current) return
    const rect = panel.current.getBoundingClientRect()
    setUp(rect.bottom > (window.visualViewport?.height ?? window.innerHeight) - 8)
  }, [open])
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false) }
    window.addEventListener("pointerdown", close, true)
    return () => window.removeEventListener("pointerdown", close, true)
  }, [open])

  const item = "flex w-full min-h-11 items-center rounded-lg px-3 text-left text-sm font-semibold hover:bg-slate-100 dark:hover:bg-[#2a2a2a]"
  return (
    <div ref={ref} className="relative" onClick={event => event.stopPropagation()}>
      <button type="button" aria-label={copy.menu} aria-haspopup="menu" aria-expanded={open} data-testid="case-row-menu"
        onClick={() => setOpen(value => !value)}
        className="flex size-11 items-center justify-center rounded-lg border border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-[#bbb] hover:bg-slate-100 dark:hover:bg-[#2a2a2a]">
        <MoreHorizontal className="h-5 w-5" />
      </button>
      {open ? (
        <div ref={panel} role="menu" className={`absolute right-0 z-50 w-72 rounded-xl border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#1f1f1f] p-1.5 shadow-xl ${up ? "bottom-full mb-1" : "top-full mt-1"}`}>
          {canPlan ? <button type="button" role="menuitem" className={item} data-testid="case-row-planned-date" onClick={() => { setOpen(false); setDialog("date") }}>{copy.planned}{plannedSurgeryDate ? ` · ${plannedSurgeryDate.split("-").reverse().join(".")}` : ""}</button> : null}
          {canAssignNurses ? <button type="button" role="menuitem" className={item} data-testid="case-row-nurses" onClick={() => { setOpen(false); setDialog("nurses") }}>{copy.nurses}</button> : null}
          {children ? <div className="mt-1 border-t border-slate-100 dark:border-[#2a2a2a] pt-1 flex flex-col gap-1 [&>*]:min-h-11 [&>*]:w-full">{children}</div> : null}
        </div>
      ) : null}
      {dialog === "date" ? (
        <PlannedDateDialog caseId={caseId} value={plannedSurgeryDate} copy={copy} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); router.refresh() }} />
      ) : null}
      {dialog === "nurses" ? <NursesDialog caseId={caseId} copy={copy} onClose={() => { setDialog(null); router.refresh() }} /> : null}
    </div>
  )
}

function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onPointerDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="w-full max-w-sm rounded-xl bg-white dark:bg-[#1f1f1f] p-4 shadow-xl">
        <p className="mb-3 text-base font-bold text-slate-900 dark:text-white">{title}</p>
        {children}
      </div>
    </div>
  )
}

function PlannedDateDialog({ caseId, value, copy, onClose, onSaved }: {
  caseId: string
  value: string | null
  copy: Copy
  onClose: () => void
  onSaved: () => void
}) {
  const [date, setDate] = useState<CalendarDate>(() => parseCalendarDateKey(value) ?? parseCalendarDateKey(calendarDayKey(new Date()))!)
  const [busy, setBusy] = useState(false)
  const save = async (plannedSurgeryDate: string | null) => {
    setBusy(true)
    const response = await fetch(`/api/cases/${caseId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plannedSurgeryDate }) })
    setBusy(false)
    if (response.ok) onSaved()
  }
  return (
    <Dialog title={copy.planned} onClose={onClose}>
      <DateWheel value={date} onChange={setDate} labels={{ day: copy.day, month: copy.month, year: copy.year }} />
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" className="min-h-11 rounded-lg border border-slate-300 dark:border-[#4a4a4a] font-semibold" onClick={onClose}>{copy.cancel}</button>
        <button type="button" disabled={busy} data-testid="planned-date-save" className="min-h-11 rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50" onClick={() => void save(calendarDateKey(date))}>{copy.save}</button>
      </div>
      {value ? <button type="button" className="mt-2 min-h-11 w-full rounded-lg font-semibold text-slate-500" onClick={() => void save(null)}>{copy.clear}</button> : null}
    </Dialog>
  )
}

function NursesDialog({ caseId, copy, onClose }: { caseId: string; copy: Copy; onClose: () => void }) {
  const [all, setAll] = useState<Nurse[] | null>(null)
  const [assigned, setAssigned] = useState<Set<string>>(new Set())
  useEffect(() => {
    void (async () => {
      const [list, current] = await Promise.all([
        fetch("/api/users/nurses").then(response => response.ok ? response.json() : { nurses: [] }),
        fetch(`/api/cases/${caseId}/nurses`).then(response => response.ok ? response.json() : { nurses: [] }),
      ])
      setAll(list.nurses ?? [])
      setAssigned(new Set((current.nurses ?? []).map((row: { userId: string }) => row.userId)))
    })()
  }, [caseId])
  const toggle = async (id: string) => {
    const on = assigned.has(id)
    const response = await fetch(`/api/cases/${caseId}/nurses`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(on ? { remove: id } : { assign: id }) })
    if (!response.ok) return
    const next = await response.json()
    setAssigned(new Set((next.nurses ?? []).map((row: { userId: string }) => row.userId)))
  }
  const name = (nurse: Nurse) => [nurse.title, nurse.firstName, nurse.lastName].filter(Boolean).join(" ") || nurse.name
  return (
    <Dialog title={copy.nurses} onClose={onClose}>
      {all === null ? null : all.length === 0 ? <p className="text-sm text-slate-500">{copy.none}</p> : (
        <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
          {all.map(nurse => (
            <label key={nurse.id} className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-slate-100 dark:hover:bg-[#2a2a2a]">
              <input type="checkbox" className="size-5" checked={assigned.has(nurse.id)} onChange={() => void toggle(nurse.id)} data-testid={`case-nurse-${nurse.id}`} />
              <span className="text-sm font-semibold">{name(nurse)}</span>
            </label>
          ))}
        </div>
      )}
      <button type="button" className="mt-4 min-h-11 w-full rounded-lg border border-slate-300 dark:border-[#4a4a4a] font-semibold" onClick={onClose}>{copy.save}</button>
    </Dialog>
  )
}
