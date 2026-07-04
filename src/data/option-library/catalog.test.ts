import { describe, expect, it } from "vitest"
import { parseDoseProfile } from "./dose-profile"
import { DRUG_CATALOG } from "./intraop-drugs"
import { INFUSION_CATALOG } from "./intraop-infusions"
import { FLUID_CATALOG } from "./intraop-fluids"
import { AGENT_CATALOG } from "./inhalational-agents"

// Guards clinical data at the source: a malformed dose profile (bad range,
// missing unit, routeModes without min/max, etc.) fails here at test time
// rather than at seed time or — worse — silently in the app.
describe("option-library catalogs are valid dose profiles", () => {
  it("every intraop drug parses", () => {
    for (const e of DRUG_CATALOG) expect(() => parseDoseProfile(e.name, "bolus", e.profile), e.name).not.toThrow()
  })
  it("every infusion parses", () => {
    for (const e of INFUSION_CATALOG) expect(() => parseDoseProfile(e.name, "infusion", e.profile), e.name).not.toThrow()
  })
  it("every fluid parses", () => {
    for (const e of FLUID_CATALOG) expect(() => parseDoseProfile(e.name, "fluid", e.profile), e.name).not.toThrow()
  })
  it("every inhalational agent parses", () => {
    for (const e of AGENT_CATALOG) expect(() => parseDoseProfile(e.label, "agent", e.profile), e.label).not.toThrow()
  })

  it("catalogs are non-empty (guards against accidental wipe)", () => {
    expect(DRUG_CATALOG.length).toBeGreaterThan(0)
    expect(INFUSION_CATALOG.length).toBeGreaterThan(0)
    expect(FLUID_CATALOG.length).toBeGreaterThan(0)
    expect(AGENT_CATALOG.length).toBeGreaterThan(0)
  })
})
