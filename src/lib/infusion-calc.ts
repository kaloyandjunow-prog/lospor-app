import type { TimetableInfusion } from "@/components/IntraopTimetable"

// Weight basis for per-kg infusion units.
// IBW = ideal body weight (default for most CNS/anaesthetic agents)
// TBW = total (actual) body weight (haemodynamic agents dosed by actual weight per label)
export type WeightBasisMap = Record<string, "IBW" | "TBW" | "none">

// Used by IntraopTimetable.tsx (the live chart), IntraopForm.tsx (the
// running drug-totals panel), and EndCaseModal.tsx (estimated total at end
// of case) — pulled out of IntraopTimetable.tsx so it's not "import a
// calculation function from a giant component file." Takes the weight-basis
// map as an explicit parameter rather than reading shared module state —
// callers get it from their own useOptionLibrary("INTRAOP_INFUSION") call.
export function calcInfusionTotal(
  seg: TimetableInfusion,
  ibw: number | null = null,
  tbw: number | null = null,
  weightBasisMap: WeightBasisMap = {},
): { amount: number; unit: string; weightUsed: number | null; weightBasis: "IBW" | "TBW" | "none" | null } {
  // Determine whether this drug is dosed per-kg and which weight to use
  const basis    = weightBasisMap[seg.name] ?? "IBW"
  const bodyWt   = basis === "TBW" ? (tbw ?? ibw) : (ibw ?? tbw)

  function segmentTotal(rate: number, unit: string, cols: number): number {
    const isPerKg  = unit.includes("/kg/")
    const wt       = isPerKg && bodyWt ? bodyWt : isPerKg ? 1 : 1  // fallback to 1 if no weight
    const mins     = unit.includes("/min") ? cols * 5 : cols * 5 / 60
    return rate * wt * mins
  }

  const sorted = (seg.rateChanges ?? []).slice().sort((a, b) => a.col - b.col)
  let total = 0; let prevCol = seg.startCol; let prevRate = seg.rate; let prevUnit = seg.unit
  for (const rc of sorted) {
    total += segmentTotal(prevRate, prevUnit, rc.col - prevCol)
    prevCol = rc.col; prevRate = rc.rate; prevUnit = rc.unit
  }
  total += segmentTotal(prevRate, prevUnit, seg.endCol - prevCol + 1)

  const baseUnit = prevUnit
    .replace(/\/kg\/min$/, "").replace(/\/kg\/hr$/, "")
    .replace(/\/min$/, "").replace(/\/hr$/, "").trim()

  const anyPerKg = seg.unit.includes("/kg/") || (seg.rateChanges ?? []).some(rc => rc.unit.includes("/kg/"))
  const weightUsed = anyPerKg && bodyWt ? Math.round(bodyWt * 10) / 10 : null

  return {
    amount: Math.round(total * 100) / 100,
    unit: baseUnit,
    weightUsed,
    weightBasis: anyPerKg ? basis : null,
  }
}
