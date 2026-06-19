import { describe, expect, it } from "vitest"
import { checkClinicalPayloadPII, checkEventPII } from "@/lib/clinical-pii"

describe("clinical PII gate", () => {
  it("checks all major free-text clinical save fields", () => {
    const result = checkClinicalPayloadPII({
      preop: { physicalExamReport: "Contact test@example.com" },
      intraop: { bloodProductsNote: "No issue" },
      postop: {},
    })

    expect(result).toContain("physicalExamReport")
  })

  it("checks intraop/postop notes that were previously easy to miss", () => {
    expect(checkClinicalPayloadPII({ intraop: { bloodProductsNote: "File 1234567" } })).toContain("bloodProductsNote")
    expect(checkClinicalPayloadPII({ postop: { dispositionNotes: "Seen on 01.02.2026" } })).toContain("dispositionNotes")
  })

  it("checks free-text event labels before event append", () => {
    expect(checkEventPII({ label: "Ivan Petrov" })).toContain("label")
  })
})
