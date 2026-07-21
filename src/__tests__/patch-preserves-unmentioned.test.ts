import { describe, it, expect } from "vitest"
import { preopSchema } from "@/lib/schemas/case"
import { mapPreopUpdate } from "@/app/api/cases/_mappers"

// Regression guard for a data-loss bug: a field-level PATCH used to wipe every
// numeric field it did not mention. The schema's preprocessor turned
// `undefined` ("not sent") into `null` ("cleared"), so the update mapper saw an
// explicit null and wrote it. Mobile sends diffs, so a save that touched only
// weight silently erased height and age.
describe("partial PATCH preserves unmentioned fields", () => {
  it("does not emit keys the client never sent", () => {
    const parsed = preopSchema.parse({ weightKg: 99 })
    const update = mapPreopUpdate(parsed as Record<string, unknown>)

    expect(update.weightKg).toBe(99)
    expect("heightCm" in update).toBe(false)
    expect("ageYears" in update).toBe(false)
    expect("bpSystolic" in update).toBe(false)
  })

  it("still clears a field the user explicitly emptied", () => {
    // "" and null are the user actively blanking the field — that must persist
    // as null, otherwise a value could never be removed once entered.
    const update = mapPreopUpdate(preopSchema.parse({ heightCm: "", weightKg: null }) as Record<string, unknown>)
    expect(update.heightCm).toBeNull()
    expect(update.weightKg).toBeNull()
  })

  it("passes through values that were sent", () => {
    const update = mapPreopUpdate(preopSchema.parse({ heightCm: 176, ageYears: 40 }) as Record<string, unknown>)
    expect(update.heightCm).toBe(176)
    expect(update.ageYears).toBe(40)
  })

  it("keeps integer rounding for values that are sent", () => {
    const update = mapPreopUpdate(preopSchema.parse({ ageYears: 40.6 }) as Record<string, unknown>)
    expect(update.ageYears).toBe(41)
  })

  it("an empty patch updates nothing at all", () => {
    const update = mapPreopUpdate(preopSchema.parse({}) as Record<string, unknown>)
    for (const k of ["heightCm", "weightKg", "ageYears", "bpSystolic", "spO2"]) {
      expect(k in update).toBe(false)
    }
  })
})
