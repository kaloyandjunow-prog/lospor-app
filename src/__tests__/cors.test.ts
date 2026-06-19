import { afterEach, describe, expect, it } from "vitest"
import { allowedCorsOrigin } from "@/lib/cors"

const oldEnv = { ...process.env }

afterEach(() => {
  process.env = { ...oldEnv }
})

describe("CORS config", () => {
  it("allows permissive origin outside production deployment", () => {
    delete process.env.CORS_ALLOW_ORIGIN
    process.env.NODE_ENV = "development"
    delete process.env.VERCEL_ENV
    expect(allowedCorsOrigin()).toBe("*")
  })

  it("fails closed in Vercel production when origin is missing", () => {
    delete process.env.CORS_ALLOW_ORIGIN
    process.env.NODE_ENV = "production"
    process.env.VERCEL_ENV = "production"
    expect(() => allowedCorsOrigin()).toThrow("CORS_ALLOW_ORIGIN")
  })
})
