// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it } from "vitest"
import enMessages from "../../../messages/en.json"
import { PediatricIntraopReference } from "./PediatricIntraopReference"

const show = (preop: Record<string, unknown>) => render(
  <NextIntlClientProvider locale="en" messages={enMessages}>
    <PediatricIntraopReference preop={preop as never} />
  </NextIntlClientProvider>,
)

describe("the paediatric reference in intraop", () => {
  it("shows BSA, maintenance fluid and resuscitation without anything to accept", () => {
    show({ clinicalMode: "PEDIATRIC", weightKg: 24, heightCm: 122, ageValue: 7, ageUnit: "YEARS" })
    const text = screen.getByTestId("pediatric-intraop-reference").textContent ?? ""
    expect(text).toContain("0.9018 m²")
    expect(text).toContain("1580 ml/day · 65.8 ml/h")
    expect(text).toContain("Shock 96 J (4 J/kg); from the 5th shock up to 192 J (8 J/kg, max 360 J)")
    expect(text).toContain("Adrenaline 240 mcg")
    expect(text).toContain("Amiodarone 120 mg after the 3rd shock, 120 mg after the 5th")
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("shows nothing until there is a weight", () => {
    show({ clinicalMode: "PEDIATRIC", heightCm: 122 })
    expect(screen.queryByTestId("pediatric-intraop-reference")).toBeNull()
  })
})
