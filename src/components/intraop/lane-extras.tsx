"use client"

import { INTRAOP_COLUMN_MINUTES } from "@lospor/core/intraop-engine"

/**
 * Small pieces every continuous lane shares (10.8.0, rule 5 web):
 * the total in the cell after a bar's end (or after now while it runs),
 * and a duration written the way the record writes it.
 */
export function laneDuration(startCol: number, endCol: number): string {
  const minutes = Math.max(0, endCol - startCol + 1) * INTRAOP_COLUMN_MINUTES
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

/** The column the total goes in: after the end of a stopped bar, after now on a running one. */
export function totalColumn(seg: { endCol: number; stopped?: boolean }, nowCol: number | null): number {
  return seg.stopped || nowCol == null ? seg.endCol + 1 : nowCol + 1
}

export function LaneTotal({ text, color, testId = "lane-total" }: { text: string; color?: string; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className="pointer-events-none absolute inset-y-0 left-1 z-30 flex items-center whitespace-nowrap text-xs font-bold tabular-nums text-slate-600 dark:text-slate-300"
      style={color ? { color } : undefined}
    >
      Σ {text}
    </span>
  )
}
