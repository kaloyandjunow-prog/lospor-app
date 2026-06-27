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

  it("does not treat controlled event labels as free-text PII", () => {
    const labels = [
      "Face Mask",
      "Oral ETT",
      "Double Lumen Tube",
      "Surgical Airway",
      "General Anaesthesia",
      "Regional Anaesthesia",
      "To PACU",
      "To ICU",
      "Vital Signs & Monitoring",
      "Angiotensin II",
      "Lloyd Davies",
    ]

    for (const label of labels) {
      expect(checkEventPII({ label })).toBeNull()
    }
  })

  it("checks free-text event notes before event append", () => {
    expect(checkEventPII({ label: "Complication", notes: "Ivan Petrov" })).toContain("notes")
  })

  it("allows drug names with two capitalised words in allergyDetails and currentMedications", () => {
    // Drug names like "Morphine Sulfate" or "Sodium Chloride" must not trigger the name check
    expect(checkClinicalPayloadPII({ preop: { allergyDetails: [{ label: "Morphine Sulfate" }] } })).toBeNull()
    expect(checkClinicalPayloadPII({ preop: { currentMedications: [{ label: "Sodium Chloride" }] } })).toBeNull()
    expect(checkClinicalPayloadPII({ preop: { allergyDetails: [{ label: "Potassium Chloride" }] } })).toBeNull()
  })

  it("still blocks EGN and long digit strings inside drug fields", () => {
    // Even in structured fields, clear PII like EGNs must be caught
    expect(checkClinicalPayloadPII({ preop: { allergyDetails: [{ label: "1234567890" }] } })).toBeTruthy()
  })
})
