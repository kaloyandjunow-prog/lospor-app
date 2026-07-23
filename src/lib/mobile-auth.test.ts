import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const mocks = vi.hoisted(() => ({
  jwtVerify: vi.fn(),
  isRevokedAsync: vi.fn(),
  resolveAccount: vi.fn(),
  getLiveSession: vi.fn(),
}))

vi.mock("jose", () => ({
  jwtVerify: mocks.jwtVerify,
  SignJWT: class {
    setProtectedHeader() { return this }
    setIssuedAt() { return this }
    setJti() { return this }
    setExpirationTime() { return this }
    sign() { return Promise.resolve("token") }
  },
}))

vi.mock("@/lib/token-blocklist", () => ({
  isRevokedAsync: mocks.isRevokedAsync,
}))

vi.mock("@/lib/password-epoch", () => ({
  resolveAccount: mocks.resolveAccount,
}))

vi.mock("@/lib/live-session", () => ({
  getLiveSession: mocks.getLiveSession,
}))

import { getAuthUser } from "./mobile-auth"

describe("getAuthUser", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isRevokedAsync.mockResolvedValue(false)
  })

  it("uses live account role and nullable institution for bearer tokens", async () => {
    mocks.jwtVerify.mockResolvedValue({
      payload: {
        id: "user-1",
        role: "ADMIN",
        institutionId: "old-inst",
        institutionName: "Old Hospital",
        iat: 1_780_000_000,
        jti: "token-1",
      },
    })
    mocks.resolveAccount.mockResolvedValue({
      role: "MEMBER",
      institutionId: null,
      institutionName: null,
    })

    const user = await getAuthUser(new Request("https://app.lospor.org/api/cases", {
      headers: { authorization: "Bearer abc" },
    }))

    expect(mocks.resolveAccount).toHaveBeenCalledWith("user-1", 1_780_000_000)
    expect(user).toEqual(expect.objectContaining({
      id: "user-1",
      role: "MEMBER",
      institutionId: null,
      institutionName: null,
    }))
  })

  it("uses the live-session gate for cookie sessions", async () => {
    mocks.getLiveSession.mockResolvedValue({
      user: {
        id: "user-1",
        role: "HEAD_OF_DEPT",
        institutionId: "inst-2",
        institutionName: "Live Hospital",
        firstName: "Ada",
        lastName: "Lovelace",
        title: "Dr",
        jti: "cookie-1",
      },
    })

    const user = await getAuthUser(new Request("https://app.lospor.org/api/cases", {
      headers: { cookie: "next-auth.session-token=abc" },
    }))

    expect(user).toEqual({
      id: "user-1",
      role: "HEAD_OF_DEPT",
      institutionId: "inst-2",
      institutionName: "Live Hospital",
      firstName: "Ada",
      lastName: "Lovelace",
      title: "Dr",
      jti: "cookie-1",
    })
  })

  it("rejects cookie sessions refused by live-session revalidation", async () => {
    mocks.getLiveSession.mockResolvedValue(null)

    const user = await getAuthUser(new Request("https://app.lospor.org/api/cases", {
      headers: { cookie: "next-auth.session-token=abc" },
    }))

    expect(user).toBeNull()
  })
})
