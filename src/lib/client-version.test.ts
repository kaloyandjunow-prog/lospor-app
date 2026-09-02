import { describe, expect, it } from "vitest"

import packageJson from "../../package.json"
import { LOSPOR_WEB_CLIENT_VERSION } from "./client-version"

/**
 * The version this app claims must be the version it is.
 *
 * It is sent as `x-lospor-client-version` and compared against
 * `PEDIATRIC_MIN_CLIENT_VERSION` before the server permits a paediatric write.
 * Understating it refuses clinical work the app can do, and tells the clinician
 * to update an app that is already current.
 *
 * A release bumps package.json. Nothing made this follow, and nothing
 * complained, because a stale version string breaks nothing on the day it goes
 * stale — it waits until the minimum moves.
 */
describe("the version this client reports", () => {
  it("matches the package it was built from", () => {
    expect(LOSPOR_WEB_CLIENT_VERSION).toBe(packageJson.version)
  })

  it("is a plain three-part version, which is what the server compares", () => {
    expect(LOSPOR_WEB_CLIENT_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
