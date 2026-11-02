// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { calcEquipment } from "@lospor/core/equipment"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "en" }))

import { EquipmentSmart } from "./EquipmentSmart"

const adult = calcEquipment({ clinicalMode: "ADULT", age: null, ageYears: 44, weightKg: 82, heightCm: 182, sex: "MALE", airway: { mallampati: "III", neckMobility: "REDUCED", mouthOpeningCm: 3, cormackLehane: null } } as never)
const child = calcEquipment({ clinicalMode: "PEDIATRIC", age: { value: 4, unit: "YEARS" }, ageYears: null, weightKg: 16, heightCm: 102, sex: "FEMALE", airway: { mallampati: null, neckMobility: null, mouthOpeningCm: null, cormackLehane: null } } as never)

function setup(overrides: Partial<Parameters<typeof EquipmentSmart>[0]> = {}) {
  const onFlag = vi.fn()
  const onUseAirway = vi.fn()
  render(<EquipmentSmart categories={adult} flags={{ urinaryCatheter: false, stomachTube: false }} airwayInUse={[]} onFlag={onFlag} onUseAirway={onUseAirway}
    categoryName={name => name} labelOf={label => label} textOf={text => text} {...overrides} />)
  return { onFlag, onUseAirway }
}

describe("Smart selection, the Equipment card (10.2.0)", () => {
  it("shows the six airway numbers, the difficult airway group and a progress count", () => {
    setup()
    for (const label of ["ETT size", "ETT depth (lip)", "LMA size", "Laryngoscope", "Guedel OPA", "Suction catheter"]) expect(screen.getByTestId(`equipment-cell-${label}`)).toBeTruthy()
    expect(screen.getByTestId("equipment-group-Difficult Airway")).toBeTruthy()
    expect(screen.queryByTestId("equipment-group-Airway")).toBeNull()
    expect(screen.getByTestId("equipment-progress").textContent).toMatch(/^0 \/ \d+$/)
  })

  it("a first tap on the tube only marks it ready; a second marks it in use and writes it", () => {
    const { onUseAirway } = setup()
    fireEvent.click(screen.getByTestId("equipment-cell-ETT size"))
    expect(onUseAirway).not.toHaveBeenCalled()
    expect(screen.getByTestId("equipment-cell-ETT size").getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(screen.getByTestId("equipment-cell-ETT size"))
    expect(onUseAirway).toHaveBeenCalledWith("ORAL_ETT")
  })

  it("the LMA writes the LMA, and a tube already in use is not written again", () => {
    const { onUseAirway } = setup({ airwayInUse: ["ORAL_ETT"] })
    fireEvent.click(screen.getByTestId("equipment-cell-LMA size"))
    fireEvent.click(screen.getByTestId("equipment-cell-LMA size"))
    expect(onUseAirway).toHaveBeenCalledWith("LMA")
    onUseAirway.mockClear()
    fireEvent.click(screen.getByTestId("equipment-cell-ETT size"))
    expect(onUseAirway).not.toHaveBeenCalled()
  })

  it("the catheter and the NGT set their flag at once, and the flag is the tick", () => {
    const { onFlag } = setup()
    fireEvent.click(screen.getByTestId("equipment-row-Catheters-NGT"))
    expect(onFlag).toHaveBeenCalledWith("stomachTube")
    fireEvent.click(screen.getByTestId("equipment-row-Catheters-Urinary catheter"))
    expect(onFlag).toHaveBeenCalledWith("urinaryCatheter")
  })

  it("shows a flag that is already set as ticked", () => {
    setup({ flags: { urinaryCatheter: true, stomachTube: false } })
    expect(screen.getByTestId("equipment-row-Catheters-Urinary catheter").getAttribute("aria-pressed")).toBe("true")
  })

  it("any other item is a plain tick that writes nothing", () => {
    const { onFlag, onUseAirway } = setup()
    fireEvent.click(screen.getByTestId("equipment-cell-Guedel OPA"))
    fireEvent.click(screen.getByTestId("equipment-row-Ventilation-PEEP"))
    expect(onFlag).not.toHaveBeenCalled()
    expect(onUseAirway).not.toHaveBeenCalled()
    expect(screen.getByTestId("equipment-row-Ventilation-PEEP").getAttribute("aria-pressed")).toBe("true")
  })

  it("never writes a size the calculator leaves to the clinician, but a child catheter still sets its flag", () => {
    const { onFlag, onUseAirway } = setup({ categories: child })
    fireEvent.click(screen.getByTestId("equipment-cell-Laryngoscope"))
    fireEvent.click(screen.getByTestId("equipment-cell-Laryngoscope"))
    expect(onUseAirway).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId("equipment-row-Catheters-Urinary catheter"))
    expect(onFlag).toHaveBeenCalledWith("urinaryCatheter")
  })
})
