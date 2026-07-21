import { describe, it, expect } from "vitest"
import { chartAnchorFor, resolveChartStart } from "@/lib/case-events"

// Column 0 of the intraoperative chart must be the start time the clinician
// entered — the induction time — not the moment they first got a hand free to
// document. Reported symptom: a case begun at 08:00 but first charted at 08:25
// reopened on another device with its chart starting at 08:25.
//
// The projection used to anchor on the earliest event, while the web client
// re-derived the origin from startTime locally. Both now use this helper, so
// the stored projection and every client agree.

/** startTime is stored on a fixed dummy date; only HH:MM is meaningful. */
const startTimeOf = (hhmm: string) => new Date(`2000-01-01T${hhmm}:00.000Z`)

describe("chartAnchorFor", () => {
  it("uses the entered start time, not when charting began", () => {
    // Case happened on 4 March; induction entered as 08:00; the record was
    // created at 08:25 because that is when someone had a free hand.
    const anchor = chartAnchorFor({
      startTime: startTimeOf("08:00"),
      createdAt: new Date("2026-03-04T08:25:00.000Z"),
    })
    expect(anchor?.toISOString()).toBe("2026-03-04T08:00:00.000Z")
  })

  it("combines the case's real day with the start time's clock reading", () => {
    const anchor = chartAnchorFor({
      startTime: startTimeOf("14:35"),
      createdAt: new Date("2026-11-20T15:02:11.000Z"),
    })
    expect(anchor?.toISOString()).toBe("2026-11-20T14:35:00.000Z")
  })

  it("never inherits the dummy reference date the start time is stored on", () => {
    const anchor = chartAnchorFor({
      startTime: startTimeOf("09:15"),
      createdAt: new Date("2026-07-21T09:40:00.000Z"),
    })
    expect(anchor?.getUTCFullYear()).toBe(2026)
    expect(anchor?.getUTCFullYear()).not.toBe(2000)
  })

  it("returns null when no start time was recorded, so callers can fall back", () => {
    expect(chartAnchorFor({ startTime: null, createdAt: new Date() })).toBeNull()
    expect(chartAnchorFor(null)).toBeNull()
  })

  it("keeps midnight as a real value rather than treating it as missing", () => {
    const anchor = chartAnchorFor({
      startTime: startTimeOf("00:00"),
      createdAt: new Date("2026-03-04T00:20:00.000Z"),
    })
    expect(anchor?.toISOString()).toBe("2026-03-04T00:00:00.000Z")
  })

  it("puts an event charted 25 minutes late in column 5, not column 0", () => {
    const anchor = chartAnchorFor({
      startTime: startTimeOf("08:00"),
      createdAt: new Date("2026-03-04T08:25:00.000Z"),
    })!
    const firstCharted = new Date("2026-03-04T08:25:00.000Z")
    const col = Math.floor((firstCharted.getTime() - anchor.getTime()) / (5 * 60_000))
    expect(col).toBe(5)
  })
})

// The anchor is only trusted when the events it describes sit alongside it.
// Older records were written with a different startTime encoding, and one has
// event timestamps still on the 2000-01-01 dummy date — anchoring those to the
// real day would push every event before column 0, where colFor clamps them,
// collapsing an entire operation into a single column.
describe("resolveChartStart", () => {
  const ev = (ts: string) => ({ id: ts, ts, type: "vital" }) as Parameters<typeof resolveChartStart>[1][number]
  const intraop = (hhmm: string, day: string) => ({
    startTime: new Date(`2000-01-01T${hhmm}:00.000Z`),
    createdAt: new Date(day),
  })

  it("uses the entered start time for a normally-charted case", () => {
    const start = resolveChartStart(
      intraop("08:00", "2026-03-04T08:25:00.000Z"),
      [ev("2026-03-04T08:25:00.000Z")],
    )
    expect(start.toISOString()).toBe("2026-03-04T08:00:00.000Z")
  })

  it("tolerates an entry made shortly before the recorded start", () => {
    const start = resolveChartStart(
      intraop("08:00", "2026-03-04T08:00:00.000Z"),
      [ev("2026-03-04T07:40:00.000Z")],
    )
    expect(start.toISOString()).toBe("2026-03-04T08:00:00.000Z")
  })

  it("falls back to the events when they predate the anchor by years", () => {
    // The legacy dummy-date corruption. Anchoring here would collapse the chart.
    const start = resolveChartStart(
      intraop("08:35", "2026-07-06T11:24:00.000Z"),
      [ev("2000-01-01T08:35:00.000Z")],
    )
    expect(start.toISOString()).toBe("2000-01-01T08:35:00.000Z")
  })

  it("falls back when the anchor would stretch a short case across the day", () => {
    // startTime encoded on a different clock: a ~1 h case would become ~21 h.
    const start = resolveChartStart(
      intraop("01:21", "2026-06-21T19:09:00.000Z"),
      [ev("2026-06-21T19:20:00.000Z"), ev("2026-06-21T20:36:00.000Z")],
    )
    expect(start.toISOString()).toBe("2026-06-21T19:20:00.000Z")
  })

  it("uses the anchor when there are no events to contradict it", () => {
    const start = resolveChartStart(intraop("08:15", "2026-07-18T15:37:00.000Z"), [])
    expect(start.toISOString()).toBe("2026-07-18T08:15:00.000Z")
  })

  it("falls back to the earliest event when no start time was recorded", () => {
    const start = resolveChartStart(
      { startTime: null, createdAt: new Date("2026-03-04T09:00:00.000Z") },
      [ev("2026-03-04T09:05:00.000Z")],
    )
    expect(start.toISOString()).toBe("2026-03-04T09:05:00.000Z")
  })
})
