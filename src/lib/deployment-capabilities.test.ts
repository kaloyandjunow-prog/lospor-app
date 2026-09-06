import { afterEach, describe, expect, it, vi } from "vitest"
import { parsePediatricModeCapability } from "@lospor/core/deployment-capabilities"
import {
  capabilityMessageKey,
  clearPediatricModeCapabilityCache,
  loadPediatricModeCapability,
  pediatricCapabilityMessageKey,
} from "./deployment-capabilities"

/**
 * Reading the declaration is core's, and tested there. What is this app's is
 * the copy it chooses and what it does when the endpoint will not answer.
 */

const pediatricCapability = {
  enabled: true,
  productionReady: true,
  rulesetVersion: "2026.08.04-release.1",
  minimumClientVersion: "8.0.0",
  reviewedDoseProfilesRequired: true,
}

function capability(over: Record<string, unknown> = {}) {
  return parsePediatricModeCapability(
    { features: { pediatricMode: { ...pediatricCapability, ...over } } },
    "9.7.0",
  )
}

describe("what this app says about an unavailable capability", () => {
  afterEach(() => {
    clearPediatricModeCapabilityCache()
    vi.restoreAllMocks()
  })

  it("distinguishes deployment policy from provider availability", () => {
    expect(capabilityMessageKey("DISABLED_BY_DEPLOYMENT"))
      .toBe("deploymentCapabilities.externalAiDisabled")
    expect(capabilityMessageKey("PROVIDER_NOT_CONFIGURED"))
      .toBe("deploymentCapabilities.externalAiUnavailable")
  })

  it("uses distinct copy for a new selection and a preserved existing record", () => {
    const disabled = capability({ enabled: false })
    expect(pediatricCapabilityMessageKey(disabled, false)).toBe("newSelectionDisabled")
    expect(pediatricCapabilityMessageKey(disabled, true)).toBe("existingRecordReadOnlyDisabled")
  })

  it("tells a clinician to update the app only when that is the reason", () => {
    const stale = capability({ minimumClientVersion: "99.0.0" })
    expect(pediatricCapabilityMessageKey(stale, false)).toBe("newSelectionClientUpdate")
    expect(pediatricCapabilityMessageKey(stale, true)).toBe("existingRecordReadOnlyClientUpdate")
  })

  /**
   * An unreviewed ruleset and an unreadable answer are different facts but the
   * same instruction at the bedside: this is not something you can turn on from
   * here. Both reach the unavailable copy.
   */
  it.each([
    ["an unreviewed ruleset", capability({ productionReady: false })],
    ["an answer it cannot read", capability({ reviewedDoseProfilesRequired: false })],
  ])("reads %s as unavailable rather than as switched off", (_name, value) => {
    expect(pediatricCapabilityMessageKey(value, false)).toBe("newSelectionUnavailable")
    expect(pediatricCapabilityMessageKey(value, true)).toBe("existingRecordReadOnlyUnavailable")
  })

  it("fails closed when the capability endpoint is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"))
    await expect(loadPediatricModeCapability()).resolves.toMatchObject({
      enabled: false,
      reason: "INVALID_CONTRACT",
    })
  })

  it("fails closed when the endpoint answers with an error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 503 }),
    )
    await expect(loadPediatricModeCapability()).resolves.toMatchObject({
      enabled: false,
      reason: "INVALID_CONTRACT",
    })
  })
})
