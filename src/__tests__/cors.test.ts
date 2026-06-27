import { afterEach, describe, expect, it, vi } from "vitest"
import { allowedCorsOrigin } from "@/lib/cors"

afterEach(() => {
  vi.unstubAllEnvs()
  delete process.env.CORS_ALLOW_ORIGIN
  delete process.env.CORS_ALLOW_ORIGINS
})

describe("CORS config", () => {
  it("allows permissive origin outside production deployment", () => {
    delete process.env.CORS_ALLOW_ORIGIN
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("VERCEL_ENV", undefined as unknown as string)
    expect(allowedCorsOrigin()).toBe("*")
  })

  it("fails closed in Vercel production when origin is missing", () => {
    delete process.env.CORS_ALLOW_ORIGIN
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("VERCEL_ENV", "production")
    expect(() => allowedCorsOrigin()).toThrow("CORS_ALLOW_ORIGIN")
  })

  it("accepts the first origin from CORS_ALLOW_ORIGINS", () => {
    vi.stubEnv("CORS_ALLOW_ORIGINS", "https://pwa.lospor.org, https://preview.lospor.org")
    expect(allowedCorsOrigin()).toBe("https://pwa.lospor.org")
  })
})
