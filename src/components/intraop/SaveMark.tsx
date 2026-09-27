"use client"

import { useTranslations } from "next-intl"
import { eventsSaveState } from "@lospor/core/intraop-save-state"

import { useChartSaveState } from "@/lib/use-case-save-state"

/**
 * The mark on one chart item that has not reached the server (9.13.0): a
 * clock while queued or saving, a red cross when refused. Never a dashed
 * outline -- dashes already mean planned on this chart. Nothing when saved.
 * Which state, for which events, is Core's rule, the same as the PWA's.
 */
export function SaveMark({ eventIds, className = "absolute -top-1 -right-1" }: {
  eventIds: readonly (string | undefined)[]
  className?: string
}) {
  const save = useChartSaveState()
  const t = useTranslations("intraop.timelineRules")
  const state = eventsSaveState(eventIds, save)
  if (!state) return null
  const label = t(state === "refused" ? "refusedShort" : state === "sending" ? "sendingShort" : "queuedShort")
  return (
    <span
      title={label}
      aria-label={label}
      data-testid={`save-mark-${state}`}
      className={`${className} z-40 pointer-events-none select-none text-[10px] leading-none font-bold rounded-full px-0.5 ${
        state === "refused" ? "text-red-600 bg-red-50 dark:bg-red-900/40" : "text-amber-600 bg-amber-50 dark:bg-amber-900/40"
      } ${state === "sending" ? "animate-pulse" : ""}`}
    >
      {state === "refused" ? "✕" : "◷"}
    </span>
  )
}
