// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { parseIntraopAutomation } from "@lospor/core/intraop-automation"
import type { LogEvent } from "@lospor/core/intraop-types"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "en" }))

import { useIntraopAttention } from "@/lib/use-intraop-attention"
import { parseIntraopAutomationResponse } from "@/lib/use-intraop-automation"
import { DefibrillationDialog } from "./DefibrillationDialog"
import { IntraopAttentionPanel } from "./IntraopAttentionPanel"
import { defibrillationDialogProps, extraComplicationOptions } from "./event-picker-extras"

const vitals = { settings: parseIntraopAutomation({ enabled: true, vitalQuestions: { enabled: true } }), stats: null, ageDays: 40 * 365, keepLogging: true }

describe("vitals questions on the web (10.1.0)", () => {
  it("lists the question with why and when logging stops, and writes Core's complication", () => {
    vi.useFakeTimers({ now: new Date("2026-11-01T09:01:00.000Z") })
    try {
      const log: LogEvent[] = [{ id: "r1", type: "vital", ts: "2026-11-01T09:00:00.000Z", heartRate: 45, systolic: 120, diastolic: 70 }]
      const onEventOps = vi.fn()
      const { result } = renderHook(() => useIntraopAttention({ log, timeZone: "Europe/Sofia", onEventOps, vitals }))
      expect(result.current.entries.map(entry => entry.key)).toEqual(["vital:bradycardia:r1"])
      render(<IntraopAttentionPanel entries={result.current.entries} onAnswer={result.current.answer} />)
      expect(screen.getByTestId("attention-detail-vital:bradycardia:r1").textContent).toContain("below the fixed limit of 50 bpm")
      expect(screen.getByText("Automatic logging stops when HR is 50 or higher.")).toBeTruthy()
      act(() => { fireEvent.click(screen.getByTestId("attention-log_complication-vital:bradycardia:r1")) })
      expect(onEventOps.mock.calls[0][0].add).toEqual([expect.objectContaining({ type: "complication", label: "Bradycardia", ts: log[0].ts })])
    } finally {
      vi.useRealTimers()
    }
  })

  it("asks nothing on a read-only screen, and nothing when the API sends nothing usable", () => {
    const log: LogEvent[] = [{ id: "r1", type: "vital", ts: "2026-11-01T09:00:00.000Z", heartRate: 45 }]
    const { result } = renderHook(() => useIntraopAttention({ log, timeZone: "Europe/Sofia", vitals: null, readOnly: true }))
    expect(result.current.entries).toEqual([])
    expect(parseIntraopAutomationResponse(null)).toMatchObject({ settings: { enabled: false }, stats: null })
  })
})

describe("the Defibrillation dialog", () => {
  it("saves nothing until energy and synchronisation are set, with keyboard steps on the dial", () => {
    const onSave = vi.fn()
    render(<DefibrillationDialog timeLabel="09:10" shockNumber={1} prefillJoules={null} onCancel={() => {}} onSave={onSave} />)
    const save = screen.getByTestId("defib-save") as HTMLButtonElement
    expect(save.disabled).toBe(true)
    const dial = screen.getByTestId("defib-dial")
    act(() => { fireEvent.keyDown(dial, { key: "PageUp" }) })
    act(() => { fireEvent.keyDown(dial, { key: "ArrowUp" }) })
    expect(screen.getByTestId("defib-readout").textContent).toBe("11")
    expect(save.disabled).toBe(true)
    act(() => { fireEvent.click(screen.getByTestId("defib-sync")) })
    act(() => { fireEvent.click(save) })
    expect(onSave).toHaveBeenCalledWith(11, true)
  })

  it("prefills a child's energy from the reference at the right shock number", () => {
    const markers = [{ colIdx: 1, label: "Defibrillation", color: "#f59e0b", kind: "defibrillation" as const, energyJ: 64, synchronized: false }]
    expect(defibrillationDialogProps(markers, 3, "09:15", { ageValue: 4, ageUnit: "YEARS", weightKg: 16 }))
      .toEqual({ timeLabel: "09:15", shockNumber: 2, prefillJoules: 64 })
    expect(defibrillationDialogProps([], 3, "09:15", { ageValue: 40, ageUnit: "YEARS", weightKg: 80 }).prefillJoules).toBeNull()
  })
})

describe("the chart's complications", () => {
  it("offer the whole taxonomy after the quick ones", () => {
    const extra = extraComplicationOptions([{ label: "Hypotension" }], "en")
    expect(extra.some(option => option.label === "Hypotension")).toBe(false)
    expect(extra.some(option => option.label === "Ventricular fibrillation")).toBe(true)
  })
})
