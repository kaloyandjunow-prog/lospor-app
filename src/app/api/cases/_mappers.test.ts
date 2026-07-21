import { describe, expect, it } from "vitest"
import { Prisma } from "@/generated/prisma/client"
import { mapPreop } from "./_mappers"

describe("mapPreop — mobile/legacy aliases → canonical fields", () => {
  it("maps ulbt / difficultAirway / familyProblems aliases", () => {
    const r = mapPreop({ ulbt: "II", difficultAirway: true, familyProblems: true, familyProblemNotes: "MH risk" })
    expect(r.upperLipBiteTest).toBe("CLASS_II")
    expect(r.difficultAirwayHistory).toBe(true)
    expect(r.familyAnesthesiaProblems).toBe(true)
    expect(r.familyAnesthesiaDetails).toBe("MH risk")
  })

  it("drops family details when there is no family problem", () => {
    const r = mapPreop({ familyProblems: false, familyProblemNotes: "ignored" })
    expect(r.familyAnesthesiaProblems).toBe(false)
    expect(r.familyAnesthesiaDetails).toBeNull()
  })
})

describe("mapPreop — BMI validation", () => {
  it("computes BMI from height+weight when none supplied", () => {
    const r = mapPreop({ heightCm: 180, weightKg: 80 })
    expect(r.bmi).toBeCloseTo(24.69, 1)
  })
  it("keeps a client BMI within 10% of computed", () => {
    const r = mapPreop({ heightCm: 180, weightKg: 80, bmi: 24.7 })
    expect(r.bmi).toBe(24.7)
  })
  it("discards a client BMI that diverges >10%", () => {
    const r = mapPreop({ heightCm: 180, weightKg: 80, bmi: 50 })
    expect(r.bmi).toBeCloseTo(24.69, 1)
  })
  it("BMI null when biometrics missing", () => {
    expect(mapPreop({}).bmi).toBeNull()
  })
})

describe("mapPreop — biometrics + enums + structured lists", () => {
  it("uses null (not 0) for missing biometrics and UNKNOWN for missing sex", () => {
    const r = mapPreop({})
    expect(r.ageYears).toBeNull()
    expect(r.heightCm).toBeNull()
    expect(r.weightKg).toBeNull()
    // Not OTHER: "nobody recorded it" and "recorded as other" are different
    // facts, and a research register must not merge them.
    expect(r.sex).toBe("UNKNOWN")
  })

  it("keeps an explicitly recorded OTHER distinct from unrecorded", () => {
    expect(mapPreop({ sex: "OTHER" }).sex).toBe("OTHER")
    expect(mapPreop({}).sex).toBe("UNKNOWN")
  })

  it("validates blood-type enum", () => {
    expect(mapPreop({ bloodType: "A" }).bloodType).toBe("A")
    expect(mapPreop({ bloodType: "Z" }).bloodType).toBeNull()
  })

  it("builds legacy strings + JSON columns + icdCode from diagnoses/procedures", () => {
    const r = mapPreop({
      diagnoses: [{ label: "Appendicitis", sub: "K35.8" }],
      procedures: [{ label: "Appendectomy", code: "0DTJ4ZZ" }],
    })
    expect(r.diagnosis).toBe("Appendicitis")
    expect(r.plannedProcedure).toBe("Appendectomy")
    expect(r.icdCode).toBe("K35.8")
    expect(Array.isArray(r.diagnosesJson)).toBe(true)
  })

  it("uses Prisma.JsonNull for empty diagnosis/procedure arrays", () => {
    const r = mapPreop({})
    expect(r.diagnosesJson).toBe(Prisma.JsonNull)
    expect(r.proceduresJson).toBe(Prisma.JsonNull)
    expect(r.diagnosis).toBe("")
  })

  it("serializes tagged medication lists to JSON storage", () => {
    const r = mapPreop({ currentMedications: [{ label: "Aspirin", atcCode: "B01AC06" }] })
    expect(typeof r.currentMedications).toBe("string")
    expect(JSON.parse(r.currentMedications as string)[0]).toMatchObject({ label: "Aspirin", atcCode: "B01AC06" })
  })
})
