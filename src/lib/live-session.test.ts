import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  resolveAccount: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}))

vi.mock("@/lib/password-epoch", () => ({
  resolveAccount: mocks.resolveAccount,
}))

import { getLiveSession } from "./live-session"

function session() {
  return {
    user: {
      id: "user-1",
      role: "ADMIN",
      institutionId: "old-inst",
      institutionName: "Old Hospital",
      iat: 1_780_000_000,
    },
  }
}

describe("getLiveSession", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("revalidates cookie sessions and replaces stale role/institution claims", async () => {
    mocks.auth.mockResolvedValue(session())
    mocks.resolveAccount.mockResolvedValue({
      role: "MEMBER",
      institutionId: null,
      institutionName: null,
    })

    const live = await getLiveSession()

    expect(mocks.resolveAccount).toHaveBeenCalledWith("user-1", 1_780_000_000)
    expect(live?.user.role).toBe("MEMBER")
    expect(live?.user.institutionId).toBeNull()
    expect(live?.user.institutionName).toBe("")
  })

  it("rejects sessions refused by the live account gate", async () => {
    mocks.auth.mockResolvedValue(session())
    mocks.resolveAccount.mockResolvedValue(null)

    await expect(getLiveSession()).resolves.toBeNull()
  })

  it("rejects empty cookie sessions without a database lookup", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "" } })

    await expect(getLiveSession()).resolves.toBeNull()
    expect(mocks.resolveAccount).not.toHaveBeenCalled()
  })
})
