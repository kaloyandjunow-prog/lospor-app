// Palettes — light "paper" (print + light theme) and dark (summary only;
// the print page strips the theme class so the record always prints white).
export type Palette = {
  bg: string; side: string; pinBg: string; timeBg: string
  ink: string; faint: string; lbl: string; timeTxt: string; cap: string
  gridMaj: string; gridMin: string; sep: string
  event: string; sbp: string; hr: string; pos: string
}
export const PAL_LIGHT: Palette = {
  bg: "#ffffff", side: "#f8fafc", pinBg: "#fbfcfe", timeBg: "#f1f5f9",
  ink: "#1e293b", faint: "#94a3b8", lbl: "#475569", timeTxt: "#334155", cap: "#64748b",
  gridMaj: "#e2e8f0", gridMin: "#f1f5f9", sep: "#e8edf3",
  event: "#4c6ef5", sbp: "#e03131", hr: "#2f9e44", pos: "#475569",
}
export const PAL_DARK: Palette = {
  bg: "#1c1c1c", side: "#181818", pinBg: "#1a1c1e", timeBg: "#262626",
  ink: "#e5e5e5", faint: "#7d7d7d", lbl: "#b0b0b0", timeTxt: "#d0d0d0", cap: "#909090",
  gridMaj: "#3a3a3a", gridMin: "#262626", sep: "#2c2c2c",
  event: "#748ffc", sbp: "#ff6b6b", hr: "#51cf66", pos: "#64748b",
}
