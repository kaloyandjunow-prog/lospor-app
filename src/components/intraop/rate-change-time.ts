import { floorTo5, timeToMins } from "@/lib/timetable-time"

/**
 * The chart column a wall-clock time falls in.
 *
 * Used when an anaesthetist records a rate change that happened earlier — the
 * pump was turned down at 14:20, entered at 14:35 — so the change lands against
 * the time it happened rather than the time it was typed.
 *
 * Two things make it worth having on its own. Night lists cross midnight, and a
 * naive subtraction gives a negative offset that would place the change before
 * the start of the case. And a time after the end of the chart has to clamp to
 * the last column rather than index past it.
 *
 * A candidate for @lospor/core/timetable, where the time primitives it uses
 * already live; kept here for now because promoting it means tagging core and
 * bumping both consumers.
 */
export function columnForWallClock({
  time,
  caseStart,
  intervalMinutes,
  columnCount,
}: {
  /** "HH:MM" the change happened at. */
  time: string
  /** "HH:MM" the case started at. */
  caseStart: string
  intervalMinutes: number
  columnCount: number
}): number {
  const startMinutes = timeToMins(floorTo5(caseStart || "08:00"))
  const changeMinutes = timeToMins(time)

  // Wrap forward over midnight rather than going negative: a case starting at
  // 23:00 and a change at 00:30 is ninety minutes in, not a day back.
  const elapsed = (changeMinutes - startMinutes + 1440) % 1440

  return Math.min(Math.floor(elapsed / intervalMinutes), columnCount - 1)
}
