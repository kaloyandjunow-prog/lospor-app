// MONITORING — groups use mobile's lowercase keys
// (standard/respiratory/haemodynamic/depth/other) as the canonical shared
// scheme, finer than web's old 4-group split which lumped
// capnography/temperature into "Standard" and only separated them via a
// display-label hack. Both web and mobile now read these same groups.
export const MONITORING = [
  { field: "ecg", label: "ECG", cat: "standard" },
  { field: "spO2Monitor", label: "SpO₂", cat: "standard" },
  { field: "nbpMonitor", label: "NBP", cat: "standard" },
  { field: "etco2Monitor", label: "Capnography (EtCO₂)", cat: "respiratory" },
  { field: "tempMonitor", label: "Temperature", cat: "respiratory" },
  { field: "invasiveBP", label: "IBP (invasive BP)", cat: "haemodynamic" },
  { field: "cvpMonitor", label: "CVP", cat: "haemodynamic" },
  { field: "paCatheter", label: "PA catheter", cat: "haemodynamic" },
  { field: "tee", label: "TEE", cat: "haemodynamic" },
  { field: "bis", label: "BIS", cat: "depth" },
  { field: "entropyMonitor", label: "Entropy (pEEG)", cat: "depth" },
  { field: "nirsMonitor", label: "NIRS / rSO₂", cat: "depth" },
  { field: "evokedPotentials", label: "SSEP / MEP", cat: "depth" },
  { field: "tofMonitor", label: "TOF / NMT", cat: "depth" },
  { field: "bglMonitor", label: "Serum/peripheral glucose", cat: "other" },
  { field: "bloodGasMonitor", label: "Blood gases (ABG)", cat: "other" },
  { field: "urinaryCatheter", label: "Urine output", cat: "other" },
  { field: "stomachTube", label: "Gastric tube (NGT)", cat: "other" },
]
