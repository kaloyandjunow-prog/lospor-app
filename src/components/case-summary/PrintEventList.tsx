import { format } from "date-fns"
import { writtenEventList, writtenEventTime, type WrittenEventEntry } from "@lospor/core/written-event-list"

/**
 * The written event list on the printed record (10.2.0, the maintainer's choice B): every clinical event and
 * complication in time order under the timeline, complications in red with their end time, and "≈" on a time
 * that was charted afterwards. Sheet 1 holds the first entries; the rest continue on their own sheets, as the
 * drug log does, because an event left off the paper is an event nobody can find later. The list itself is
 * Core's (the phone's case summary shows the same one).
 *
 * Its own file because `CaseSummary` is under a size budget.
 */

type LogLike = { id?: unknown; timeApproximate?: unknown }
export type PrintEventEntry = WrittenEventEntry

/** Sheet 1: four columns, three rows under the timeline. */
export const EVENT_LIST_SHEET_LIMIT = 12
/** A continuation sheet: four columns of the full page. */
export const EVENT_LIST_CONT_LIMIT = 160

const COPY = {
  en: { title: "Events", ongoing: "ongoing", approximate: "≈ time approximate (charted afterwards)", identity: "identity fields on Sheet 1", continues: "Continues on Sheet", page: "Page", of: "of" },
  bg: { title: "Събития", ongoing: "продължава", approximate: "≈ приблизителен час (записан впоследствие)", identity: "самоличността — на лист 1", continues: "Продължава на лист", page: "Стр.", of: "от" },
}
const copyFor = (locale: string) => (locale === "bg" ? COPY.bg : COPY.en)

export const buildPrintEventList = writtenEventList

export function splitPrintEventList<T>(entries: T[]): { first: T[]; continued: T[][] } {
  const continued: T[][] = []
  for (let at = EVENT_LIST_SHEET_LIMIT; at < entries.length; at += EVENT_LIST_CONT_LIMIT) {
    continued.push(entries.slice(at, at + EVENT_LIST_CONT_LIMIT))
  }
  return { first: entries.slice(0, EVENT_LIST_SHEET_LIMIT), continued }
}

/**
 * The drug log with "≈" on a dose time charted afterwards (an arrest dose spread across the arrest). Matches the
 * log to the doses in the order Core builds it: by column, stably.
 */
export function withApproximateDrugTimes<T extends { time: string }>(
  drugLog: T[],
  timetable: { drugs?: unknown; log?: unknown },
): T[] {
  const log = (Array.isArray(timetable.log) ? timetable.log : []) as LogLike[]
  const approximate = new Set(log.filter(event => event.timeApproximate === true && typeof event.id === "string").map(event => event.id as string))
  if (approximate.size === 0) return drugLog
  const drugs = (Array.isArray(timetable.drugs) ? [...timetable.drugs] : []) as Array<{ colIdx: number; eventId?: string }>
  drugs.sort((a, b) => a.colIdx - b.colIdx)
  return drugLog.map((entry, index) => {
    const eventId = drugs[index]?.eventId
    return eventId && approximate.has(eventId) ? { ...entry, time: `≈${entry.time}` } : entry
  })
}

function EventCell({ entry, locale }: { entry: PrintEventEntry; locale: string }) {
  const C = copyFor(locale)
  return (
    <div data-testid="print-event" data-complication={entry.complication ? "true" : undefined} className="flex items-center gap-1.5 text-[8.5px] leading-[12px] min-w-0">
      <span className={`font-bold text-[8px] shrink-0 ${entry.complication ? "text-red-700" : "text-slate-500"}`} style={{ fontFamily: "Consolas, monospace" }}>{writtenEventTime(entry, C.ongoing)}</span>
      <span className={`truncate flex-1 ${entry.complication ? "text-red-700 font-semibold" : "text-slate-700"}`}>{entry.label}</span>
    </div>
  )
}

const hasApproximate = (entries: readonly PrintEventEntry[]) => entries.some(entry => entry.approximate)

/** Under the timeline on sheet 1. Renders nothing when there are no events, so a quiet case keeps its full chart. */
export function PrintEventStrip({ entries, total, locale }: { entries: PrintEventEntry[]; total: number; locale: string }) {
  if (entries.length === 0) return null
  const C = copyFor(locale)
  return (
    <div data-testid="print-event-list" className="border border-slate-200 rounded-lg px-2 py-1 bg-white shrink-0">
      <p className="text-[8.5px] font-bold tracking-[0.1em] text-blue-900 mb-0.5">
        {C.title.toUpperCase()}{total > entries.length ? ` · ${entries.length} / ${total}` : ""}
        {hasApproximate(entries) ? <span className="font-normal tracking-normal text-slate-400"> · {C.approximate}</span> : null}
      </p>
      <div className="grid grid-cols-4 gap-x-3">
        {entries.map(entry => <EventCell key={entry.id} entry={entry} locale={locale} />)}
      </div>
    </div>
  )
}

/** The events that did not fit on sheet 1. */
export function PrintEventListSheet({ entries, locale, patientLine, caseCode, continuedWord, footerLine, generatedLbl, sheetNumber, sheetCount, hasNext }: {
  entries: PrintEventEntry[]
  locale: string
  patientLine: string
  caseCode?: string | null
  continuedWord: string
  footerLine: string
  generatedLbl: string
  sheetNumber: number
  sheetCount: number
  hasNext: boolean
}) {
  const C = copyFor(locale)
  return (
    <div data-testid="print-event-sheet" className="page-intraop border border-slate-200 rounded-xl bg-white p-3 flex flex-col gap-2 min-h-[520px]">
      <div className="flex items-center justify-between border-b-2 border-blue-900 pb-1.5 gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[13px] font-black tracking-tight text-slate-900">LOSPOR</span>
          <span className="text-[9.5px] font-bold tracking-[0.14em] text-blue-900">{C.title.toUpperCase()} · {continuedWord}</span>
          <span className="text-[9px] text-slate-500 truncate">{[patientLine, C.identity].filter(Boolean).join(" · ")}</span>
        </div>
        <div className="text-right text-[9px] text-slate-500 shrink-0">
          <span className="font-bold text-slate-800">{entries[0].time} – {entries[entries.length - 1].time}</span>
          {" · "}{caseCode ? `${caseCode} · ` : ""}{C.page} {sheetNumber} {C.of} {sheetCount}
        </div>
      </div>
      <div className="border border-slate-200 rounded-lg bg-white flex-1 min-h-0 overflow-hidden p-2">
        <div className="grid grid-cols-4 gap-x-3">
          {entries.map(entry => <EventCell key={entry.id} entry={entry} locale={locale} />)}
        </div>
        {hasApproximate(entries) ? <p className="text-[7.5px] text-slate-400 mt-1">{C.approximate}</p> : null}
      </div>
      <div className="flex justify-between text-[7.5px] text-slate-400 border-t border-slate-200 pt-1">
        <span>{footerLine}</span>
        <span>{hasNext ? `${C.continues} ${sheetNumber + 1} · ` : ""}{generatedLbl} {format(new Date(), "dd MMM yyyy")}</span>
      </div>
    </div>
  )
}
