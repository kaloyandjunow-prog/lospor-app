// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { AirwayDeviceEntry } from "@lospor/core/airway-device-entries"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "en" }))

import { AirwaySmart } from "./AirwaySmart"

const START = "2026-11-02T09:30:00.000Z"
const NOW = "2026-11-02T09:55:00.000Z"
const ADULT = { clinicalMode: "ADULT" as const, ageYears: 45, weightKg: 82, heightCm: 182, sex: "MALE" }

function setup(overrides: Partial<Parameters<typeof AirwaySmart>[0]> = {}) {
  const onChange = vi.fn()
  const props = {
    entries: [] as AirwayDeviceEntry[], onChange, patient: ADULT, techniques: ["GENERAL_TIVA"], startedAt: START, now: () => NOW, timeZone: "UTC",
    difficultAirway: false, deviceLabel: (code: string) => code, toolLabel: (code: string) => code,
    describe: (entry: AirwayDeviceEntry) => `${entry.device} ${entry.details.oralTubeSize ?? ""}`.trim(), timeOf: (iso: string) => iso.slice(11, 16),
    ...overrides,
  }
  render(<AirwaySmart {...props} />)
  return { onChange }
}

describe("Smart selection, the Airway tab (10.2.0)", () => {
  it("leads with the tube, the LMA and the mask for general anaesthesia, and keeps every other device behind More devices", () => {
    setup()
    expect(screen.getByTestId("airway-smart-card-ORAL_ETT")).toBeTruthy()
    expect(screen.getByTestId("airway-smart-card-LMA")).toBeTruthy()
    expect(screen.getByTestId("airway-smart-card-FACE_MASK")).toBeTruthy()
    expect(screen.queryByTestId("airway-smart-other-NASAL_ETT")).toBeNull()
    fireEvent.click(screen.getByTestId("airway-smart-more"))
    for (const device of ["NASAL_ETT", "DOUBLE_LUMEN_TUBE", "ENDOBRONCHIAL_TUBE", "SURGICAL_AIRWAY", "OPA", "NPA"]) expect(screen.getByTestId(`airway-smart-other-${device}`)).toBeTruthy()
  })

  it("leads with what keeps the airway open for sedation", () => {
    setup({ techniques: ["SEDATION_DEEP"] })
    expect(screen.getByTestId("airway-smart-card-NPA")).toBeTruthy()
    expect(screen.queryByTestId("airway-smart-card-ORAL_ETT")).toBeNull()
  })

  it("opens the panel with this patient's size and cuff, and adds the tube at the start of anaesthesia", () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByTestId("airway-smart-card-ORAL_ETT"))
    expect(screen.getByTestId("airway-smart-panel")).toBeTruthy()
    fireEvent.click(screen.getByTestId("airway-smart-how-VIDEO_LARY"))
    fireEvent.click(screen.getByTestId("airway-smart-add"))
    const next = onChange.mock.calls[0]![0] as AirwayDeviceEntry[]
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({ device: "ORAL_ETT", details: { oralTubeSize: 8, oralCuffed: true }, insertedAt: START, instruments: ["VIDEO_LARY"], status: "in_use" })
  })

  it("takes a size picked instead of the suggestion, and the time now", () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByTestId("airway-smart-card-ORAL_ETT"))
    fireEvent.click(screen.getByTestId("airway-smart-oralTubeSize-7.5"))
    fireEvent.click(screen.getByTestId("airway-smart-uncuffed"))
    fireEvent.click(screen.getByTestId("airway-smart-time-now"))
    fireEvent.click(screen.getByTestId("airway-smart-add"))
    expect((onChange.mock.calls[0]![0] as AirwayDeviceEntry[])[0]).toMatchObject({ details: { oralTubeSize: 7.5, oralCuffed: false }, insertedAt: NOW })
  })

  it("a child gets the child's size and the LMA from weight", () => {
    const { onChange } = setup({ patient: { clinicalMode: "PEDIATRIC", ageYears: 6, weightKg: 20 } })
    fireEvent.click(screen.getByTestId("airway-smart-card-LMA"))
    fireEvent.click(screen.getByTestId("airway-smart-add"))
    expect((onChange.mock.calls[0]![0] as AirwayDeviceEntry[])[0]).toMatchObject({ device: "LMA", details: { lmaSize: 2.5 } })
  })

  it("Reintubate asks why, then keeps both tubes: the first failed, the second in use", () => {
    const first: AirwayDeviceEntry = { id: "a1", device: "ORAL_ETT", details: { oralTubeSize: 8, oralCuffed: true }, insertedAt: START, status: "in_use" }
    const { onChange } = setup({ entries: [first] })
    fireEvent.click(screen.getByTestId("airway-smart-reintubate-a1"))
    expect((screen.getByTestId("airway-smart-add") as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByTestId("airway-smart-add"))
    const next = onChange.mock.calls[0]![0] as AirwayDeviceEntry[]
    expect(next.map(entry => [entry.id, entry.status])).toEqual([["a1", "failed"], [expect.stringMatching(/^airway-/), "in_use"]])
    expect(next[0]!.endedAt).toBe(NOW)
  })

  it("shows what is in place first, a failed device struck and marked, and the tools that placed it", () => {
    const entries: AirwayDeviceEntry[] = [
      { id: "a1", device: "ORAL_ETT", details: { oralTubeSize: 8, oralCuffed: true }, insertedAt: START, status: "failed", endedAt: NOW, instruments: ["VIDEO_LARY", "BOUGIE"] },
      { id: "a2", device: "ORAL_ETT", details: { oralTubeSize: 7.5, oralCuffed: true }, insertedAt: NOW, status: "in_use" },
    ]
    setup({ entries })
    const lines = screen.getAllByTestId(/^airway-smart-entry-/)
    expect(lines[0]!.getAttribute("data-testid")).toBe("airway-smart-entry-a2")
    expect(screen.getByTestId("airway-smart-entry-a1").textContent).toContain("failed")
    expect(screen.getByTestId("airway-smart-entry-a1").textContent).toContain("via")
    expect(screen.queryByTestId("airway-smart-empty")).toBeNull()
  })

  it("says so when nothing is in place yet", () => {
    setup()
    expect(screen.getByTestId("airway-smart-empty")).toBeTruthy()
  })
})
