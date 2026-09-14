// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ProcedureOperationPicker } from "./ProcedureOperationPicker"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))

const GROUP = { label: "Cholecystectomy", code: "Cholecystectomy", system: "LOSPOR_PROCEDURE_GROUP", group: "Cholecystectomy", domain: "Hepatobiliary System and Pancreas", source: "manual" as const }
const CODES = {
  group: "Cholecystectomy",
  total: 2,
  codes: [
    { code: "0FT40ZZ", description: "Resection of Gallbladder, Open Approach", domain: "Hepatobiliary System and Pancreas" },
    { code: "0FT44ZZ", description: "Resection of Gallbladder, Percutaneous Endoscopic Approach", domain: "Hepatobiliary System and Pancreas" },
  ],
}

afterEach(() => vi.unstubAllGlobals())

describe("choosing the exact operation of a planned procedure", () => {
  it("replaces the group with the operation picked, keeping its provenance", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(CODES)))
    vi.stubGlobal("fetch", fetchMock)
    const onChange = vi.fn()
    render(<ProcedureOperationPicker value={[GROUP]} onChange={onChange} />)

    expect(screen.getByText("procedureNoExact")).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByText("procedureSpecifyExact")) })
    await waitFor(() => expect(screen.getByText("Resection of Gallbladder, Percutaneous Endoscopic Approach")).toBeTruthy())
    expect(fetchMock).toHaveBeenCalledWith("/api/search/procedures/codes?group=Cholecystectomy&q=")

    fireEvent.click(screen.getByText("Resection of Gallbladder, Percutaneous Endoscopic Approach"))
    expect(onChange).toHaveBeenCalledWith([{
      label: "Cholecystectomy", code: "0FT44ZZ", system: "ICD-10-PCS", group: "Cholecystectomy",
      domain: "Hepatobiliary System and Pancreas", description: "Resection of Gallbladder, Percutaneous Endoscopic Approach",
      sub: "0FT44ZZ · Resection of Gallbladder, Percutaneous Endoscopic Approach", source: "manual",
    }])
  })

  it("shows a chosen operation and can go back to the group alone", () => {
    const onChange = vi.fn()
    const exact = { ...GROUP, code: "0FT44ZZ", system: "ICD-10-PCS", description: "Resection of Gallbladder, Percutaneous Endoscopic Approach" }
    render(<ProcedureOperationPicker value={[exact]} onChange={onChange} />)

    expect(screen.getByText("0FT44ZZ · Resection of Gallbladder, Percutaneous Endoscopic Approach")).toBeTruthy()
    fireEvent.click(screen.getByText("procedureGroupOnly"))
    expect(onChange).toHaveBeenCalledWith([{
      label: "Cholecystectomy", code: "Cholecystectomy", system: "LOSPOR_PROCEDURE_GROUP", group: "Cholecystectomy",
      domain: "Hepatobiliary System and Pancreas", sub: "Hepatobiliary System and Pancreas", source: "manual",
    }])
  })

  it("keeps the group when the list cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline") }))
    const onChange = vi.fn()
    render(<ProcedureOperationPicker value={[GROUP]} onChange={onChange} />)
    await act(async () => { fireEvent.click(screen.getByText("procedureSpecifyExact")) })
    await waitFor(() => expect(screen.getByText("procedureExactUnavailable")).toBeTruthy())
    expect(onChange).not.toHaveBeenCalled()
  })
})
