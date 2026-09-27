// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { applyIntraopEventOps } from "@lospor/core/intraop-timetable-edit"
import { INTRAOP_ATTENTION_SCENARIOS } from "@lospor/core/intraop-attention-scenarios"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))

import { useIntraopAttention } from "@/lib/use-intraop-attention"
import { IntraopAttentionPanel } from "./IntraopAttentionPanel"

// The web app against Core's shared scenarios (9.13.0). The PWA runs the same
// scenarios; if either lists or writes differently, its own test fails.

describe.each(INTRAOP_ATTENTION_SCENARIOS)("$name", scenario => {
  const now = new Date(scenario.context.now)
  const endedAt = scenario.context.endedAt == null ? null : new Date(scenario.context.endedAt).toISOString()

  it("shows exactly the items Core lists, and each answer writes Core's operations", () => {
    vi.useFakeTimers({ now })
    try {
      const onEventOps = vi.fn()
      const { result } = renderHook(() => useIntraopAttention({ log: scenario.log, endedAt, timeZone: "Europe/Sofia", onEventOps }))
      expect(result.current.entries.map(entry => ({ key: entry.key, kind: entry.kind }))).toEqual(scenario.expected)

      render(<IntraopAttentionPanel entries={result.current.entries} onAnswer={result.current.answer} />)
      for (const resolution of scenario.resolutions) {
        onEventOps.mockClear()
        act(() => { fireEvent.click(screen.getByTestId(`attention-${resolution.action}-${resolution.key}`)) })
        const next = applyIntraopEventOps(scenario.log, onEventOps.mock.calls[0][0])
        for (const removed of resolution.removes ?? []) expect(next.some(event => event.id === removed)).toBe(false)
        for (const [id, fields] of Object.entries(resolution.updates ?? {})) {
          expect(next.find(event => event.id === id)).toMatchObject(fields)
        }
      }
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("a screen watching another screen's case", () => {
  it("shows the questions and cannot answer them", () => {
    const [scenario] = INTRAOP_ATTENTION_SCENARIOS
    vi.useFakeTimers({ now: new Date(scenario.context.now) })
    try {
      const onEventOps = vi.fn()
      const { result } = renderHook(() => useIntraopAttention({ log: scenario.log, onEventOps, readOnly: true }))
      expect(result.current.canAnswer).toBe(false)
      result.current.answer("stop", "stopped")
      expect(onEventOps).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
