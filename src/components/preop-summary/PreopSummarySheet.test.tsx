// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { BUNDLED_CONSENT_TEMPLATES } from "@lospor/core/preop-documents"
import { ConsentSheet } from "./ConsentSheet"
import { PreopSummarySheet, type PreopSummaryData } from "./PreopSummarySheet"

const PRINTED = new Date("2026-10-16T08:00:00Z")

function data(preop: Record<string, unknown>, extra: Partial<PreopSummaryData> = {}): PreopSummaryData {
  return {
    caseCode: "2026-0007",
    institution: { name: "МБАЛ Пример", city: "София" },
    intraop: { timezone: "Europe/Sofia" },
    createdBy: { name: "А. Николов", title: "д-р" },
    user: { name: "А. Николов", title: "д-р" },
    preop: { ageYears: 55, sex: "FEMALE", heightCm: 164, weightKg: 78, allergies: false, latexAllergy: false, ...preop },
    ...extra,
  } as unknown as PreopSummaryData
}

describe("the preop summary sheet", () => {
  it("prints findings, follow-ups under their question, allergies in a frame and the scores", () => {
    render(<PreopSummarySheet locale="bg" printedAt={PRINTED} data={data(
      { allergies: true, allergyDetails: "[{\"label\":\"Латекс\"}]", asaScore: "II", apfelScore: 3, plannedProcedure: "Хистеректомия", emergencySurgery: false, elective: true },
      { preopFindings: [
        { stableKey: "A11_DYSPHAGIA_ASPIRATION", parentKey: null, label: { en: "Dysphagia", bg: "Дисфагия" }, option: null },
        { stableKey: "A11_LIQUIDS", parentKey: "A11_DYSPHAGIA_ASPIRATION", label: { en: "Liquids", bg: "Течности" }, option: null },
      ] },
    )} />)
    expect(screen.getByTestId("preop-summary-allergy").textContent).toBe("АЛЕРГИЯ: Латекс")
    expect(screen.getByTestId("preop-summary-findings").textContent).toBe("Дисфагия– Течности")
    expect(screen.getByTestId("preop-summary-scores").textContent).toContain("ASA II")
    expect(screen.getByTestId("preop-summary-scores").textContent).toContain("Apfel 3 / 4")
    expect(screen.getByText("Хистеректомия · планова")).toBeTruthy()
  })

  it("leaves the name and ID as lines for the pen, and the plan to be written by hand", () => {
    render(<PreopSummarySheet locale="en" printedAt={PRINTED} data={data({})} />)
    const sheet = screen.getByTestId("preop-summary-sheet")
    expect(sheet.textContent).toContain("Patient name")
    expect(sheet.textContent).not.toContain("Findings")
    expect(sheet.textContent).toContain("Conclusion")
  })

  it("names the colleague the case was handed to", () => {
    render(<PreopSummarySheet locale="en" printedAt={PRINTED} data={data({}, { user: { name: "S. Dimitrova", title: "Dr" } })} />)
    expect(screen.getByTestId("preop-summary-sheet").textContent).toContain("Handed over for the intraoperative stage to:Dr S. Dimitrova")
  })
})

describe("the consent pages", () => {
  const template = { population: "PEDIATRIC" as const, version: 0, sha256: "a".repeat(64), ...BUNDLED_CONSENT_TEMPLATES.PEDIATRIC }

  it("prints the text, and the parent signs for a child under 14", () => {
    render(<ConsentSheet template={template} values={{ procedure: "Херниотомия" }} ageYears={7} locale="bg" caseCode="2026-0007" />)
    const sheet = screen.getByTestId("consent-sheet")
    expect(sheet.textContent).toContain("Обща анестезия")
    expect(sheet.textContent).toContain("Херниотомия")
    expect(screen.getByTestId("consent-signers").textContent).toMatch(/^Родител, настойник, попечител.*Лекар анестезиолог/)
    expect(screen.getByTestId("consent-signers").textContent).not.toContain("Пациент")
    expect(sheet.textContent).toContain("вграден")
  })

  it("has the patient and a parent sign from 14 to 18", () => {
    render(<ConsentSheet template={{ ...template, population: "ADULT", version: 3, ...BUNDLED_CONSENT_TEMPLATES.ADULT }} values={{}} ageYears={16} locale="bg" />)
    const signers = screen.getByTestId("consent-signers").textContent ?? ""
    expect(signers).toContain("Пациент")
    expect(signers).toContain("Родител")
    expect(screen.getByTestId("consent-sheet").textContent).toContain("вариант 3")
  })
})
