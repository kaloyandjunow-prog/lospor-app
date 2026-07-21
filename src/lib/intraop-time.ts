/**
 * Converting between a clinician's local wall clock and a real instant.
 *
 * Start and end times are entered as a local wall clock — "08:00" means eight
 * in the morning where the anaesthetist is standing. Events, by contrast, are
 * recorded as true instants. Until now the two were stored as if they were the
 * same kind of quantity: a wall clock was written onto a dummy date
 * (2000-01-01T08:00:00Z) with no record of which zone it belonged to, then
 * compared against real instants. That is an offset's worth of error — three
 * hours in Bulgaria in summer — and it is silent, because the digits still
 * round-trip and the UI looks correct.
 *
 * Nothing here uses a fixed offset. An offset cannot survive a daylight-saving
 * boundary, and a register that outlives one summer must still render last
 * winter's cases at the time they actually happened. The IANA zone name is the
 * only thing that carries that history, so it is what gets stored.
 */

/**
 * How far ahead of UTC `timeZone` was at `instant`, in milliseconds.
 *
 * Derived by asking Intl to render the instant in that zone and reading the
 * result back as if it were UTC — the difference is the offset that applied at
 * that moment, daylight saving included.
 */
function offsetMsAt(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23", // never yields "24" for midnight, unlike hour12: false
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(instant)

  const f: Record<string, number> = {}
  for (const p of parts) if (p.type !== "literal") f[p.type] = Number(p.value)

  const asIfUtc = Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second)
  return asIfUtc - instant.getTime()
}

/** True when a string names a zone this runtime can actually resolve. */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
    return true
  } catch {
    return false
  }
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

/**
 * The instant at which `hhmm` local time occurred on `day` in `timeZone`.
 *
 * `day` supplies the calendar date only, read in the target zone rather than
 * UTC — a case created at 01:00 in Sofia is still on the previous UTC day, and
 * anchoring to the UTC date would put it twenty-four hours out.
 *
 * Resolved in two passes: the offset itself depends on the instant, so the
 * first pass is an estimate and the second corrects it. This matters exactly at
 * a daylight-saving boundary, where the offset before and after differ.
 *
 * Returns null for a malformed time or an unknown zone rather than guessing —
 * a fabricated timestamp is worse than a missing one in a research record.
 */
export function instantFromLocalTime(day: Date, hhmm: string, timeZone: string): Date | null {
  if (!HHMM.test(hhmm) || !isValidTimeZone(timeZone)) return null

  // The calendar date as it reads in the clinician's zone, not in UTC.
  const local = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(day)
  const d: Record<string, number> = {}
  for (const p of local) if (p.type !== "literal") d[p.type] = Number(p.value)

  const [h, m] = hhmm.split(":").map(Number)
  const wallAsUtc = Date.UTC(d.year, d.month - 1, d.day, h, m)

  const firstPass = wallAsUtc - offsetMsAt(new Date(wallAsUtc), timeZone)
  const corrected = wallAsUtc - offsetMsAt(new Date(firstPass), timeZone)
  return new Date(corrected)
}

/**
 * The local wall clock, "HH:MM", that `instant` reads as in `timeZone`.
 * The inverse of instantFromLocalTime, and what the forms and chart display.
 */
export function localTimeOf(instant: Date, timeZone: string): string | null {
  if (!isValidTimeZone(timeZone) || Number.isNaN(instant.getTime())) return null
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", hour: "2-digit", minute: "2-digit",
  }).formatToParts(instant)
  const f: Record<string, string> = {}
  for (const p of parts) if (p.type !== "literal") f[p.type] = p.value
  if (f.hour === undefined || f.minute === undefined) return null
  return `${f.hour.padStart(2, "0")}:${f.minute.padStart(2, "0")}`
}

/**
 * Reads the bare wall clock out of a legacy startTime/endTime column.
 *
 * Those values carry a dummy date and no zone, so only the hours and minutes
 * mean anything — and they were written as UTC parts, which is how they must be
 * read back. Deliberately separate from the functions above so legacy handling
 * can never be mistaken for a real instant.
 */
export function legacyWallClock(value: Date | null | undefined): string | null {
  if (!value || Number.isNaN(value.getTime())) return null
  return `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`
}

/** Minutes between two instants, or null when either is missing. */
export function durationMinutesBetween(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null
  const diff = Math.round((end.getTime() - start.getTime()) / 60_000)
  return diff >= 0 ? diff : null
}
