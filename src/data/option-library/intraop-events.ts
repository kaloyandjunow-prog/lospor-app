// INTRAOP_EVENT — clinical event categories (IntraopTimetable.tsx
// CLINICAL_EVENT_CATS), including complications (isComplication: true).
export const CLINICAL_EVENT_CATS: { cat: string; color: string; isComplication?: boolean; events: { label: string; color: string }[] }[] = [
  { cat: "Airway", color: "#6366f1", events: [
    { label: "Induction", color: "#3b82f6" }, { label: "Mask vent", color: "#0891b2" }, { label: "Intubated", color: "#6366f1" },
    { label: "LMA in", color: "#6366f1" }, { label: "Extubated", color: "#22c55e" }, { label: "Failed intubation", color: "#ef4444" },
    { label: "Airway exchange", color: "#f97316" }, { label: "DLT placed", color: "#6366f1" },
  ]},
  { cat: "Regional", color: "#a855f7", events: [
    { label: "Spinal in", color: "#a855f7" }, { label: "Epidural in", color: "#a855f7" }, { label: "CSE", color: "#a855f7" },
    { label: "Block done", color: "#8b5cf6" }, { label: "LA top-up", color: "#8b5cf6" }, { label: "Spinal removed", color: "#64748b" },
    { label: "Epidural removed", color: "#64748b" },
  ]},
  { cat: "Access", color: "#f59e0b", events: [
    { label: "Art line in", color: "#f59e0b" }, { label: "CVC in", color: "#f59e0b" }, { label: "PA cath", color: "#d97706" },
    { label: "PICC", color: "#d97706" }, { label: "IO access", color: "#d97706" },
  ]},
  { cat: "Surgical", color: "#ef4444", events: [
    { label: "Positioned", color: "#64748b" }, { label: "Incision", color: "#ef4444" }, { label: "Procedure started", color: "#ef4444" },
    { label: "Procedure ended", color: "#22c55e" }, { label: "Tourniquet on", color: "#f97316" }, { label: "Tourniquet off", color: "#22c55e" },
    { label: "Closure", color: "#22c55e" },
  ]},
  { cat: "Transfer", color: "#22c55e", events: [
    { label: "To PACU", color: "#22c55e" }, { label: "To ICU", color: "#f97316" }, { label: "To HDU", color: "#f59e0b" }, { label: "To ward", color: "#22c55e" },
  ]},
  { cat: "Complications", color: "#ef4444", isComplication: true, events: [
    { label: "Hypotension", color: "#ef4444" }, { label: "Hypertension", color: "#ef4444" }, { label: "Bradycardia", color: "#ef4444" },
    { label: "Tachycardia", color: "#ef4444" }, { label: "Cardiac arrest", color: "#ef4444" }, { label: "Hypoxia / desaturation", color: "#ef4444" },
    { label: "Laryngospasm", color: "#ef4444" }, { label: "Bronchospasm", color: "#ef4444" }, { label: "Aspiration", color: "#ef4444" },
    { label: "Anaphylaxis / allergic reaction", color: "#ef4444" }, { label: "Drug error", color: "#ef4444" }, { label: "LAST", color: "#ef4444" },
    { label: "Massive haemorrhage", color: "#ef4444" }, { label: "Awareness under anaesthesia", color: "#ef4444" },
  ]},
]
