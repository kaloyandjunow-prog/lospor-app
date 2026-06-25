// AIRWAY_MANAGEMENT — devices (IntraopForm.tsx inline DEVICES array) and
// instruments (separate multi-select) are seeded into this one category,
// distinguished by `group: "Device"` vs `group: "Instrument"`.
export const AIRWAY_DEVICES: [string, string][] = [
  ["FACE_MASK", "Face Mask"], ["OPA", "Oral airway"], ["NPA", "Nasal airway"],
  ["LMA", "LMA"], ["ORAL_ETT", "Oral ETT"], ["NASAL_ETT", "Nasal ETT"],
  ["DOUBLE_LUMEN_TUBE", "Double Lumen Tube"], ["ENDOBRONCHIAL_TUBE", "Endobronchial Tube"],
  ["SURGICAL_AIRWAY", "Surgical Airway"],
]

export const AIRWAY_TOOLS: [string, string][] = [
  ["VIDEO_LARY", "Video laryngoscopy"], ["DIRECT_LARY", "Direct laryngoscopy"],
  ["FOB", "Fibreoptic bronchoscopy"], ["BOUGIE", "Bougie"], ["STYLET", "Intubation stylet"],
  ["AWAKE", "Awake intubation"], ["RETROGRADE", "Retrograde intubation"],
  ["SUPRAGLOTTIC", "Supraglottic as conduit"],
]
