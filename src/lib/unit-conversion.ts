// Canonical-unit conversion library. The DB always stores canonical values
// (°C, mmHg, cm, kg, mL) — these functions exist purely for the UI boundary:
// convert canonical→preferred for display, preferred→canonical before save.
// Never persist a non-canonical value.
//
// Canonical units: temperature °C, pressure mmHg (covers BP and EtCO2),
// length cm, mass mg (kg for body weight specifically), volume mL.
// Labs are NOT covered here — LabLoinc already has its own canonical-unit
// system (`unitCanon`) and conversion handling; do not touch.

// ── Temperature ──────────────────────────────────────────────────────────────
export function celsiusToFahrenheit(c: number): number { return c * 9 / 5 + 32 }
export function fahrenheitToCelsius(f: number): number { return (f - 32) * 5 / 9 }
export function celsiusToKelvin(c: number): number { return c + 273.15 }
export function kelvinToCelsius(k: number): number { return k - 273.15 }

// ── Pressure (BP, EtCO2) ─────────────────────────────────────────────────────
const MMHG_PER_KPA = 7.50062
export function mmHgToKPa(mmHg: number): number { return mmHg / MMHG_PER_KPA }
export function kPaToMmHg(kPa: number): number { return kPa * MMHG_PER_KPA }
// 1 Torr = 101325/760000 mmHg ≈ 1.000000142 mmHg — close enough to treat 1:1
// for clinical display purposes.
export function mmHgToTorr(mmHg: number): number { return mmHg }
export function torrToMmHg(torr: number): number { return torr }
// EtCO2-specific: % of one atmosphere (760 mmHg), not a generic pressure
// conversion — do not use this for BP.
export function etco2MmHgToPercent(mmHg: number): number { return (mmHg / 760) * 100 }
export function etco2PercentToMmHg(pct: number): number { return (pct / 100) * 760 }

// ── Length (height) ──────────────────────────────────────────────────────────
export function cmToMm(cm: number): number { return cm * 10 }
export function mmToCm(mm: number): number { return mm / 10 }
export function cmToM(cm: number): number { return cm / 100 }
export function mToCm(m: number): number { return m * 100 }
export function cmToKm(cm: number): number { return cm / 100_000 }
export function kmToCm(km: number): number { return km * 100_000 }
export function cmToMicrometers(cm: number): number { return cm * 10_000 }
export function micrometersToCm(um: number): number { return um / 10_000 }
export function cmToInches(cm: number): number { return cm / 2.54 }
export function inchesToCm(inches: number): number { return inches * 2.54 }
export function cmToFeet(cm: number): number { return cm / 30.48 }
export function feetToCm(feet: number): number { return feet * 30.48 }

// ── Mass (body weight + drug doses) ─────────────────────────────────────────
export function kgToMg(kg: number): number { return kg * 1_000_000 }
export function mgToKg(mg: number): number { return mg / 1_000_000 }
export function mgToMcg(mg: number): number { return mg * 1000 }
export function mcgToMg(mcg: number): number { return mcg / 1000 }
export function mgToG(mg: number): number { return mg / 1000 }
export function gToMg(g: number): number { return g * 1000 }
export function kgToMetricTon(kg: number): number { return kg / 1000 }
export function metricTonToKg(t: number): number { return t * 1000 }
export function kgToLb(kg: number): number { return kg / 0.45359237 }
export function lbToKg(lb: number): number { return lb * 0.45359237 }
export function kgToStone(kg: number): number { return kgToLb(kg) / 14 }
export function stoneToKg(stone: number): number { return lbToKg(stone * 14) }
export function mgToGrains(mg: number): number { return mg / 64.79891 }
export function grainsToMg(grains: number): number { return grains * 64.79891 }
export function gToOz(g: number): number { return g / 28.349523125 }
export function ozToG(oz: number): number { return oz * 28.349523125 }

// ── Volume (fluids) ──────────────────────────────────────────────────────────
export function mlToL(ml: number): number { return ml / 1000 }
export function lToMl(l: number): number { return l * 1000 }
