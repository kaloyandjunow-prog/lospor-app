// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, cleanup } from "@testing-library/react"
import { LABELS } from "@/components/case-summary/labels"
import { CaseSummary } from "@/components/CaseSummary"

// The printed sheet states findings, and stays silent otherwise.
//
// It is the end of the case: it goes into the notes and it is read by people
// who were not in the room. The preoperative history questions are tri-state --
// yes, no, and never asked -- and `null` is falsy, so anything rendered on an
// else branch is printed for the unasked question too.
//
// That is not hypothetical. This sheet used to print a green "No
// difficult-airway history" box whenever the field was not true, so a case
// where nobody asked came out of the printer carrying the reassurance in the
// reassuring colour, indistinguishable from one where the anaesthetist asked
// and was told no.
//
// A documented "no" is still recorded, still in the database, and still in the
// OMOP export as a coded answer. It is only the paper that will not assert it,
// because on paper the two cannot be told apart.

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/cases/x/print",
}))

// The timetable measures itself to lay out its lanes. jsdom has no layout, so
// it reports nothing and the chart stays empty — which is what this sheet shows
// anyway for a case with no intraoperative data.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const EN = LABELS.en

const preopWith = (state: boolean | null) => ({
  ageYears: 66, sex: "FEMALE", heightCm: 160, weightKg: 74, asaScore: "II",
  difficultAirwayHistory: state,
  anticipatedDifficultAirway: state,
  malignantHyperthermiaHistory: state,
  unexplainedAnaesthesiaComplications: state,
  familyAnesthesiaProblems: state,
})

const sheet = (state: boolean | null) => {
  cleanup()
  const data = {
    id: "case-1", caseCode: "2026-0001", status: "FINALIZED",
    preop: {
      ...preopWith(state),
      diagnoses: [{ label: "Inguinal hernia" }],
      procedures: [{ label: "Open hernia repair" }],
    },
    intraop: null, postop: null,
    institution: { name: "Test Hospital" },
  }
  // initialData is the print-token path: the server already fetched the case,
  // so the component renders it without going near the network.
  const { container } = render(
    <CaseSummary caseId="case-1" mode="print" initialData={data as never} />,
  )
  const text = container.textContent ?? ""
  // Guard against the whole suite passing vacuously. Three of these assertions
  // are "does not contain", and every one of them holds trivially against a
  // loading placeholder or an empty container.
  // "Class II" comes from p.asaScore, so it proves the preop record reached the
  // sheet — not merely that something rendered.
  expect(text).toContain("Class II")
  return text
}

describe("the printed sheet prints findings, not silence", () => {
  it("prints every finding when the answers are yes", () => {
    const text = sheet(true)

    expect(text).toContain(EN.difficultAirway)
    expect(text).toContain(EN.anticipatedDifficultAirway)
    expect(text).toContain(EN.malignantHyperthermia)
    expect(text).toContain(EN.unexplainedAnaesthesiaComplications)
    expect(text).toContain(EN.familyHistory)
    // Under a heading of its own rather than trailing the allergy list, where a
    // bold red "Malignant hyperthermia history" read as an allergy entry.
    expect(text).toContain(EN.anaestheticHistory.toUpperCase())
  })

  it("says nothing about a question that was answered no", () => {
    const text = sheet(false)

    expect(text).not.toContain(EN.difficultAirway)
    expect(text).not.toContain(EN.anticipatedDifficultAirway)
    expect(text).not.toContain(EN.malignantHyperthermia)
    expect(text).not.toContain(EN.unexplainedAnaesthesiaComplications)
    expect(text).not.toContain(EN.familyHistory)
    // An empty heading would itself be a claim: that the history was taken and
    // found unremarkable.
    expect(text).not.toContain(EN.anaestheticHistory.toUpperCase())
  })

  it("prints the same sheet whether the answer was no or the question was never asked", () => {
    // The point of the rule. These two states are different in the database and
    // in the export, and the paper deliberately does not distinguish them,
    // because the only honest way to do so is to assert something about one of
    // them.
    expect(sheet(false)).toBe(sheet(null))
  })

  it("never prints a reassurance for an unasked question", () => {
    // The specific regression. Any future else-branch on these fields will fail
    // here rather than on a printed page in a patient's notes.
    const text = sheet(null).toLowerCase()

    expect(text).not.toContain("no difficult-airway history")
    expect(text).not.toContain("без анамнеза за труден дихателен път")
  })
})
