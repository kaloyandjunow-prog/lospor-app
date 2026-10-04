// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { caseReadiness } from "@lospor/core/case-readiness"
import { EndCaseReadiness } from "./EndCaseReadiness"

describe("the check at End case", () => {
  it("names what the intraoperative record still lacks and goes straight to it", () => {
    const readiness = caseReadiness(
      { clinicalMode: "ADULT", preop: {}, intraop: { startedAt: "2026-10-04T08:00:00Z", endedAt: "2026-10-04T09:00:00Z" }, postop: null },
      { omitPostop: true },
    )
    const onGo = vi.fn()
    render(<EndCaseReadiness readiness={readiness} locale="en" onGo={onGo} onDismiss={() => {}} />)

    fireEvent.click(screen.getByRole("button", { name: /Anaesthetic technique/ }))
    expect(onGo).toHaveBeenCalledWith("technique")
    // Recovery has not happened yet: nothing postoperative is asked for here.
    expect(screen.queryByText(/postoperative record/)).toBeNull()
  })

  it("can be put off without losing the case", () => {
    const onDismiss = vi.fn()
    render(
      <EndCaseReadiness
        readiness={{ ready: false, blockers: [{ kind: "missing_technique", severity: "blocker", target: { stage: "intraop", area: "technique" } }], warnings: [] }}
        locale="bg" onGo={() => {}} onDismiss={onDismiss}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "По-късно" }))
    expect(onDismiss).toHaveBeenCalled()
  })
})
