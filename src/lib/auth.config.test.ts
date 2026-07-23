import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/token-blocklist", () => ({
  isRevoked: vi.fn(() => false),
}))

vi.mock("@/lib/password-epoch", () => ({
  isIssuedBeforePasswordChange: vi.fn(() => false),
}))

import { authConfig } from "./auth.config"

describe("authConfig callbacks", () => {
  it("treats sessions without a concrete user id as logged out", () => {
    const authorized = authConfig.callbacks?.authorized as (args: {
      auth: { user?: { id?: string } } | null
      request: { nextUrl: URL }
    }) => boolean | Response

    expect(authorized({
      auth: { user: { id: "" } },
      request: { nextUrl: new URL("https://app.lospor.org/dashboard") },
    })).toBe(false)

    expect(authorized({
      auth: { user: { id: "user-1" } },
      request: { nextUrl: new URL("https://app.lospor.org/dashboard") },
    })).toBe(true)
  })

  it("copies token iat and nullable institution into the web session", async () => {
    const sessionCallback = authConfig.callbacks?.session as unknown as (args: {
      session: { user: Record<string, unknown> }
      token: Record<string, unknown>
    }) => Promise<{ user: Record<string, unknown> }> | { user: Record<string, unknown> }

    const session = await sessionCallback({
      session: { user: {} },
      token: { id: "user-1", role: "MEMBER", institutionId: null, iat: 1_780_000_000 },
    })

    expect(session.user.id).toBe("user-1")
    expect(session.user.institutionId).toBeNull()
    expect(session.user.iat).toBe(1_780_000_000)
  })
})
