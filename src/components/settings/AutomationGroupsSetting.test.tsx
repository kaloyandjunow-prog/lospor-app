// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))
const patch = vi.fn(async () => ({}))
vi.mock("@/lib/clinical-preferences-web", () => ({
  readWebClinicalPreferences: () => ({ automationGroups: { timers: false } }),
  syncWebClinicalPreferences: async () => ({ automationGroups: { timers: false } }),
  patchWebClinicalPreferences: (...args: unknown[]) => patch(...(args as [])),
}))

import { AutomationGroupsSetting } from "./AutomationGroupsSetting"

function hospital(settings: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ settings, stats: null }) })))
}

describe("the clinician's own suggestion switches", () => {
  beforeEach(() => { patch.mockClear() })

  it("lists only the groups the hospital has on, each on unless turned off", async () => {
    hospital({ enabled: true, groups: { treatmentSuggestions: true, timers: true }, vitalQuestions: { enabled: false } })
    await act(async () => { render(<AutomationGroupsSetting />) })
    const rows = screen.getByTestId("automation-groups-setting").textContent ?? ""
    expect(rows).toContain("treatmentSuggestions.label")
    expect(rows).toContain("timers.label")
    expect(rows).not.toContain("labQuestions.label")
    expect(rows).not.toContain("vitalQuestions.label")
  })

  it("sends the whole set, so turning one on keeps another off", async () => {
    hospital({ enabled: true, groups: { treatmentSuggestions: true, timers: true }, vitalQuestions: { enabled: false } })
    await act(async () => { render(<AutomationGroupsSetting />) })
    const toggles = screen.getByTestId("automation-groups-setting").querySelectorAll("button")
    await act(async () => { fireEvent.click(toggles[0]!) })
    expect(patch).toHaveBeenCalledWith({ automationGroups: { timers: false, treatmentSuggestions: false } })
  })

  it("shows nothing when the hospital has the automation off", async () => {
    hospital({ enabled: false })
    await act(async () => { render(<AutomationGroupsSetting />) })
    expect(screen.queryByTestId("automation-groups-setting")).toBeNull()
  })
})
