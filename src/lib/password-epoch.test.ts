import { describe, expect, it, vi } from "vitest"

// The module eagerly touches prisma at import time — stub it so the pure
// epoch logic is testable without a database.
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findMany: vi.fn(async () => []) } },
}))

import { issuedBeforeEpoch, isIssuedBeforePasswordChange, notePasswordChanged } from "./password-epoch"

describe("issuedBeforeEpoch", () => {
  it("accepts every token when the user never reset their password", () => {
    expect(issuedBeforeEpoch(1_700_000_000, undefined)).toBe(false)
    expect(issuedBeforeEpoch(1_700_000_000, 0)).toBe(false)
  })

  it("rejects tokens issued before the epoch and accepts ones issued after", () => {
    const epochMs = 1_700_000_000_000
    expect(issuedBeforeEpoch(epochMs / 1000 - 60, epochMs)).toBe(true)  // 1 min before reset
    expect(issuedBeforeEpoch(epochMs / 1000 + 60, epochMs)).toBe(false) // 1 min after reset
  })

  it("treats a missing iat as stale once an epoch exists", () => {
    expect(issuedBeforeEpoch(undefined, 1_700_000_000_000)).toBe(true)
  })
})

describe("isIssuedBeforePasswordChange (cache)", () => {
  it("reflects notePasswordChanged immediately on this instance", () => {
    const userId = "user-epoch-test"
    const changedAt = new Date("2026-07-13T10:00:00.000Z")
    expect(isIssuedBeforePasswordChange(userId, changedAt.getTime() / 1000 - 100)).toBe(false)

    notePasswordChanged(userId, changedAt)

    // Token minted 100s BEFORE the reset → dead.
    expect(isIssuedBeforePasswordChange(userId, changedAt.getTime() / 1000 - 100)).toBe(true)
    // Fresh token minted after the reset → fine.
    expect(isIssuedBeforePasswordChange(userId, changedAt.getTime() / 1000 + 100)).toBe(false)
  })
})
