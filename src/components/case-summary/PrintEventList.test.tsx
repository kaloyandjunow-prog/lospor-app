// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import React from "react"
import { describe, expect, it } from "vitest"
import { EVENT_LIST_SHEET_LIMIT, PrintEventListSheet, PrintEventStrip, buildPrintEventList, splitPrintEventList, withApproximateDrugTimes } from "./PrintEventList"

const log = [
  { id: "e1", ts: "2026-11-07T08:05:00.000Z", type: "clinical_event", label: "Induction" },
  { id: "c1", ts: "2026-11-07T08:30:00.000Z", type: "complication", label: "Hypotension", endTs: "2026-11-07T08:42:00.000Z" },
  { id: "d1", ts: "2026-11-07T08:50:00.000Z", type: "drug", name: "Epinephrine / Adrenaline", timeApproximate: true },
  { id: "e2", ts: "2026-11-07T09:10:00.000Z", type: "clinical_event", label: "ROSC", timeApproximate: true },
]

describe("the written event list on the printed record", () => {
  it("prints the events under the timeline: complication in red with its end, approximate times marked", () => {
    const entries = buildPrintEventList(log, "Europe/Sofia", "en")
    render(<PrintEventStrip entries={entries} total={entries.length} locale="en" />)
    expect(screen.getByTestId("print-event-list").textContent).toContain("EVENTS")
    expect(screen.getByText("10:30–10:42").closest("[data-complication]")).not.toBeNull()
    expect(screen.getByText("≈11:10")).toBeTruthy()
    expect(screen.getByTestId("print-event-list").textContent).toContain("time approximate")
  })

  it("prints nothing for a case without events", () => {
    const { container } = render(<PrintEventStrip entries={[]} total={0} locale="en" />)
    expect(container.textContent).toBe("")
  })

  it("continues past sheet 1 on its own sheets instead of clipping", () => {
    const many = Array.from({ length: EVENT_LIST_SHEET_LIMIT + 3 }, (_, index) => ({ id: `e${index}`, ts: new Date(Date.UTC(2026, 10, 7, 8, index)).toISOString(), type: "clinical_event", label: "Positioned" }))
    const { first, continued } = splitPrintEventList(buildPrintEventList(many, null, "bg"))
    expect(first).toHaveLength(EVENT_LIST_SHEET_LIMIT)
    expect(continued).toEqual([expect.any(Array)])
    render(<PrintEventListSheet entries={continued[0]!} locale="bg" patientLine="54г." caseCode="A1" continuedWord="ПРОДЪЛЖЕНИЕ" footerLine="LOSPOR" generatedLbl="Създадено" sheetNumber={2} sheetCount={3} hasNext={false} />)
    expect(screen.getByTestId("print-event-sheet").textContent).toContain("СЪБИТИЯ · ПРОДЪЛЖЕНИЕ")
    expect(screen.getByTestId("print-event-sheet").textContent).toContain("Стр. 2 от 3")
  })

  it("marks an approximate dose in the drug log", () => {
    const drugLog = [{ time: "10:40", name: "Propofol" }, { time: "10:50", name: "Epinephrine / Adrenaline" }]
    const timetable = { drugs: [{ colIdx: 4, eventId: "d1" }, { colIdx: 2, eventId: "p1" }], log }
    expect(withApproximateDrugTimes(drugLog, timetable).map(entry => entry.time)).toEqual(["10:40", "≈10:50"])
    expect(withApproximateDrugTimes(drugLog, { drugs: [], log: [] })).toBe(drugLog)
  })
})
