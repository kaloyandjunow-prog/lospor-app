"use client"

import type { CaseReadiness, IntraopArea } from "@lospor/core/case-readiness"
import { READINESS_COPY } from "@/components/case-summary/readiness-labels"

const TEXT = {
  en: {
    title: "Still missing from the intraoperative record",
    note: "Best filled in now, while the team is still in theatre.",
    goTo: "Go to",
    dismiss: "Later",
  },
  bg: {
    title: "Все още липсва в интраоперативния запис",
    note: "Най-добре да се попълни сега, докато екипът е още в залата.",
    goTo: "Към",
    dismiss: "По-късно",
  },
} as const

/**
 * The readiness list at End case, intraoperative part only (1.5.0).
 *
 * Shown the moment the case is ended because that is when the people who know
 * the answers are still in the room. Recovery has not happened yet, so the
 * postoperative items wait for the summary; and the buttons stay inside the
 * form, switching tabs rather than leaving the chart.
 */
export function EndCaseReadiness({
  readiness,
  locale,
  onGo,
  onDismiss,
}: {
  readiness: CaseReadiness
  locale: "en" | "bg"
  onGo: (area: IntraopArea) => void
  onDismiss: () => void
}) {
  const copy = READINESS_COPY[locale]
  const text = TEXT[locale]
  const items = [...readiness.blockers, ...readiness.warnings]
  if (items.length === 0) return null

  return (
    <section
      role="status"
      aria-label={text.title}
      className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-600/60 dark:bg-amber-950/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">{text.title}</h3>
          <p className="text-xs text-amber-800 dark:text-amber-300">{text.note}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs font-semibold text-amber-800 hover:underline dark:text-amber-300"
        >
          {text.dismiss}
        </button>
      </div>
      <ul className="mt-2 flex flex-wrap gap-2">
        {items.map(item => item.target.stage === "intraop" ? (
          <li key={item.kind}>
            <button
              type="button"
              onClick={() => onGo((item.target as { area: IntraopArea }).area)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                item.severity === "blocker"
                  ? "border-rose-300 bg-white text-rose-700 hover:bg-rose-50 dark:border-rose-500/50 dark:bg-transparent dark:text-rose-300"
                  : "border-amber-300 bg-white text-amber-800 hover:bg-amber-100 dark:border-amber-500/50 dark:bg-transparent dark:text-amber-300"
              }`}
            >
              {copy[item.kind]} · {text.goTo} →
            </button>
          </li>
        ) : null)}
      </ul>
    </section>
  )
}
