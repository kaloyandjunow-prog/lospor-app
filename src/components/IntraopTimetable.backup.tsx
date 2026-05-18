"use client"

import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { Plus, X, ChevronDown, ChevronRight } from "lucide-react"

// ── Constants ─────────────────────────────────────────────────────────────────
const COL_W     = 84
const LABEL_W   = 96
const CHART_H   = 220
const Y_MAX     = 220
const GRID_VALS = [40, 80, 120, 160, 200]
const INTERVAL  = 5

const INH_AGENTS = ["Sevoflurane", "Desflurane", "Isoflurane"]

const AGENT_STYLE: Record<string, { bar: string; text: string; grip: string }> = {
  "Sevoflurane": { bar: "bg-purple-300/40 dark:bg-purple-500/25 border-purple-400 dark:border-purple-500", text: "text-purple-700 dark:text-purple-200", grip: "bg-purple-400 dark:bg-purple-500" },
  "Desflurane":  { bar: "bg-blue-300/40   dark:bg-blue-500/25   border-blue-400   dark:border-blue-500",   text: "text-blue-700   dark:text-blue-200",   grip: "bg-blue-400   dark:bg-blue-500"   },
  "Isoflurane":  { bar: "bg-green-300/40  dark:bg-green-500/25  border-green-400  dark:border-green-500",  text: "text-green-700  dark:text-green-200",  grip: "bg-green-400  dark:bg-green-500"  },
}

// ── Quick-drug & fluid libraries ──────────────────────────────────────────────
const QUICK_DRUGS: { cat: string; color: string; drugs: { name: string; unit: string }[] }[] = [
  { cat: "Induction",    color: "bg-blue-100   dark:bg-blue-900/40   text-blue-800   dark:text-blue-300   border-blue-200   dark:border-blue-700",   drugs: [{ name:"Propofol",unit:"mg"},{name:"Thiopental",unit:"mg"},{name:"Ketamine",unit:"mg"},{name:"Etomidate",unit:"mg"},{name:"Midazolam",unit:"mg"}] },
  { cat: "Opioids",      color: "bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-700", drugs: [{ name:"Fentanyl",unit:"mcg"},{name:"Morphine",unit:"mg"},{name:"Remifentanil",unit:"mcg"},{name:"Sufentanil",unit:"mcg"},{name:"Alfentanil",unit:"mcg"}] },
  { cat: "Relaxants",    color: "bg-amber-100  dark:bg-amber-900/40  text-amber-800  dark:text-amber-300  border-amber-200  dark:border-amber-700",  drugs: [{ name:"Succinylcholine",unit:"mg"},{name:"Rocuronium",unit:"mg"},{name:"Vecuronium",unit:"mg"},{name:"Atracurium",unit:"mg"},{name:"Cisatracurium",unit:"mg"}] },
  { cat: "Reversal",     color: "bg-green-100  dark:bg-green-900/40  text-green-800  dark:text-green-300  border-green-200  dark:border-green-700",  drugs: [{ name:"Sugammadex",unit:"mg"},{name:"Neostigmine",unit:"mg"},{name:"Atropine",unit:"mg"},{name:"Galantamine",unit:"mg"}] },
  { cat: "Vasopressors", color: "bg-red-100    dark:bg-red-900/40    text-red-800    dark:text-red-300    border-red-200    dark:border-red-700",    drugs: [{ name:"Ephedrine",unit:"mg"},{name:"Phenylephrine",unit:"mcg"},{name:"Epinephrine",unit:"mg"},{name:"Norepinephrine",unit:"mg"},{name:"Vasopressin",unit:"IU"}] },
  { cat: "Antiemetics",  color: "bg-teal-100   dark:bg-teal-900/40   text-teal-800   dark:text-teal-300   border-teal-200   dark:border-teal-700",   drugs: [{ name:"Ondansetron",unit:"mg"},{name:"Dexamethasone",unit:"mg"},{name:"Metoclopramide",unit:"mg"},{name:"Droperidol",unit:"mg"}] },
  { cat: "Analgesics",   color: "bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-700", drugs: [{ name:"Paracetamol",unit:"g"},{name:"Ketorolac",unit:"mg"},{name:"Ketoprofen",unit:"mg"},{name:"Lidocaine",unit:"mg"},{name:"Magnesium",unit:"mg"}] },
  { cat: "Local anaesthetics", color: "bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-700", drugs: [{ name:"Lidocaine",unit:"mg"},{name:"Bupivacaine",unit:"mg"},{name:"Ropivacaine",unit:"mg"},{name:"Levobupivacaine",unit:"mg"},{name:"Prilocaine",unit:"mg"},{name:"Mepivacaine",unit:"mg"},{name:"Articaine",unit:"mg"}] },
]
const QUICK_FLUIDS: { cat: string; color: string; fluids: { name: string }[] }[] = [
  { cat: "Crystalloids",  color: "bg-cyan-100   dark:bg-cyan-900/40   text-cyan-800   dark:text-cyan-300   border-cyan-200   dark:border-cyan-700",   fluids: [{name:"NaCl 0.9%"},{name:"Hartmann's"},{name:"Ringer's Acetate"},{name:"Plasma-Lyte"},{name:"D5W"},{name:"D10W"}] },
  { cat: "Colloids",      color: "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700", fluids: [{name:"Gelofusine"},{name:"HES 130/0.4"},{name:"Albumin 4%"},{name:"Albumin 20%"}] },
  { cat: "Blood products",color: "bg-rose-100   dark:bg-rose-900/40   text-rose-800   dark:text-rose-300   border-rose-200   dark:border-rose-700",   fluids: [{name:"PRBC"},{name:"FFP"},{name:"Platelets"},{name:"Cryoprecipitate"}] },
  { cat: "Other",         color: "bg-slate-100  dark:bg-slate-800/60  text-slate-700  dark:text-slate-300  border-slate-200  dark:border-slate-600",  fluids: [{name:"Mannitol 20%"},{name:"NaHCO₃ 8.4%"},{name:"Gelatin 4%"},{name:"Dextran 40"}] },
]

// ── Infusion configs ──────────────────────────────────────────────────────────
const INFUSION_CONFIGS: Record<string, { units: string[]; min: number; max: number; step: number; color: string }> = {
  "Remifentanil":    { units:["mcg/kg/min","mcg/min"],            min:0.01, max:1,    step:0.01, color:"#a855f7" },
  "Propofol":        { units:["mcg/kg/min","mg/kg/hr","ml/hr"],   min:25,   max:200,  step:5,    color:"#6366f1" },
  "Ketamine":        { units:["mg/kg/hr","mg/hr"],                min:0.1,  max:2,    step:0.1,  color:"#f59e0b" },
  "Midazolam":       { units:["mg/hr","mcg/kg/hr"],               min:1,    max:20,   step:0.5,  color:"#4f46e5" },
  "Dexmedetomidine": { units:["mcg/kg/hr"],                       min:0.1,  max:1.5,  step:0.1,  color:"#0ea5e9" },
  "Fentanyl":        { units:["mcg/hr","mcg/kg/hr"],              min:10,   max:200,  step:10,   color:"#9333ea" },
  "Sufentanil":      { units:["mcg/hr"],                          min:1,    max:50,   step:1,    color:"#7c3aed" },
  "Morphine":        { units:["mg/hr"],                           min:1,    max:20,   step:1,    color:"#8b5cf6" },
  "Alfentanil":      { units:["mcg/kg/min","mcg/min"],            min:0.5,  max:5,    step:0.5,  color:"#a78bfa" },
  "Norepinephrine":  { units:["mcg/kg/min","mcg/min"],            min:0.01, max:1,    step:0.01, color:"#ef4444" },
  "Epinephrine":     { units:["mcg/kg/min","mcg/min"],            min:0.01, max:0.5,  step:0.01, color:"#b91c1c" },
  "Phenylephrine":   { units:["mcg/min","mcg/kg/min"],            min:10,   max:300,  step:10,   color:"#dc2626" },
  "Ephedrine":       { units:["mg/hr"],                           min:5,    max:60,   step:5,    color:"#f87171" },
  "Dopamine":        { units:["mcg/kg/min"],                      min:1,    max:20,   step:1,    color:"#f97316" },
  "Dobutamine":      { units:["mcg/kg/min"],                      min:2,    max:20,   step:1,    color:"#fb923c" },
  "Vasopressin":     { units:["units/hr"],                        min:0.01, max:0.04, step:0.01, color:"#991b1b" },
  "Rocuronium":      { units:["mcg/kg/min","mg/hr"],              min:5,    max:15,   step:1,    color:"#d97706" },
  "Cisatracurium":   { units:["mcg/kg/min"],                      min:1,    max:3,    step:0.5,  color:"#b45309" },
  "Lidocaine":       { units:["mg/kg/hr","mg/hr"],                min:1,    max:3,    step:0.5,  color:"#0891b2" },
  "Ropivacaine":     { units:["ml/hr","mg/hr"],                   min:1,    max:20,   step:1,    color:"#0e7490" },
  "Bupivacaine":     { units:["ml/hr","mg/hr"],                   min:1,    max:15,   step:1,    color:"#164e63" },
  "Levobupivacaine": { units:["ml/hr","mg/hr"],                   min:1,    max:15,   step:1,    color:"#155e75" },
  "Prilocaine":      { units:["ml/hr","mg/hr"],                   min:1,    max:20,   step:1,    color:"#0c4a6e" },
  "Magnesium":       { units:["g/hr"],                            min:0.5,  max:3,    step:0.5,  color:"#0d9488" },
  "Oxytocin":        { units:["mIU/min","units/hr"],              min:1,    max:40,   step:1,    color:"#ec4899" },
  "Insulin":         { units:["units/hr"],                        min:1,    max:20,   step:1,    color:"#06b6d4" },
  "Heparin":         { units:["units/hr"],                        min:500,  max:2000, step:100,  color:"#64748b" },
  "Nitroglycerin":   { units:["mcg/min","mcg/kg/min"],            min:5,    max:200,  step:5,    color:"#84cc16" },
  "Labetalol":       { units:["mg/hr"],                           min:10,   max:120,  step:10,   color:"#059669" },
}
const DEFAULT_INF = { units:["mg/hr","mcg/kg/min","ml/hr"], min:0, max:100, step:1, color:"#64748b" }

// Median bolus dose suggestions — mgPerKg is in the same unit as QUICK_DRUGS
// weightBasis: IBW (default) or TBW (succinylcholine, some others)
// flat: a fixed dose in the drug's unit, not weight-based
const BOLUS_DOSES: Record<string, { mgPerKg?: number; flat?: number; basis?: "IBW" | "TBW"; hint: string }> = {
  "Propofol":        { mgPerKg: 2.0,   basis:"IBW", hint:"2.0 mg/kg IBW (1.5–2.5)"         },
  "Thiopental":      { mgPerKg: 4.0,   basis:"IBW", hint:"4 mg/kg IBW (3–5)"                },
  "Ketamine":        { mgPerKg: 1.5,   basis:"IBW", hint:"1.5 mg/kg IBW (1–2)"              },
  "Etomidate":       { mgPerKg: 0.3,   basis:"IBW", hint:"0.3 mg/kg IBW (0.2–0.4)"          },
  "Midazolam":       { mgPerKg: 0.05,  basis:"IBW", hint:"0.05 mg/kg IBW (0.02–0.1)"        },
  "Fentanyl":        { mgPerKg: 2.0,   basis:"IBW", hint:"2 mcg/kg IBW (1–3)"               },
  "Morphine":        { mgPerKg: 0.1,   basis:"IBW", hint:"0.1 mg/kg IBW"                    },
  "Remifentanil":    { mgPerKg: 0.5,   basis:"IBW", hint:"0.5 mcg/kg IBW"                   },
  "Sufentanil":      { mgPerKg: 0.3,   basis:"IBW", hint:"0.3 mcg/kg IBW (0.2–0.5)"         },
  "Alfentanil":      { mgPerKg: 15,    basis:"IBW", hint:"15 mcg/kg IBW (10–20)"             },
  "Succinylcholine": { mgPerKg: 1.5,   basis:"TBW", hint:"1.5 mg/kg TBW (RSI)"              },
  "Rocuronium":      { mgPerKg: 0.6,   basis:"IBW", hint:"0.6 mg/kg IBW (RSI: 1.2)"         },
  "Vecuronium":      { mgPerKg: 0.1,   basis:"IBW", hint:"0.1 mg/kg IBW"                    },
  "Atracurium":      { mgPerKg: 0.5,   basis:"IBW", hint:"0.5 mg/kg IBW"                    },
  "Cisatracurium":   { mgPerKg: 0.15,  basis:"IBW", hint:"0.15 mg/kg IBW"                   },
  "Sugammadex":      { mgPerKg: 4.0,   basis:"IBW", hint:"4 mg/kg IBW (deep block)"          },
  "Neostigmine":     { mgPerKg: 0.05,  basis:"IBW", hint:"0.05 mg/kg IBW"                   },
  "Atropine":        { flat: 0.6,               hint:"0.6 mg (standard)"                    },
  "Galantamine":     { mgPerKg: 0.3,   basis:"IBW", hint:"0.3 mg/kg IBW"                    },
  "Ephedrine":       { flat: 6,                 hint:"6 mg (5–10 mg)"                        },
  "Phenylephrine":   { flat: 50,                hint:"50 mcg (25–100)"                       },
  "Epinephrine":     { flat: 0.1,               hint:"0.1 mg (100 mcg)"                      },
  "Vasopressin":     { flat: 0.4,               hint:"0.4 IU"                                },
  "Ondansetron":     { flat: 4,                 hint:"4 mg"                                  },
  "Dexamethasone":   { flat: 8,                 hint:"8 mg (4–16 mg)"                        },
  "Metoclopramide":  { flat: 10,                hint:"10 mg"                                 },
  "Droperidol":      { flat: 1.25,              hint:"1.25 mg"                               },
  "Paracetamol":     { flat: 1,                 hint:"1 g"                                   },
  "Ketorolac":       { flat: 15,                hint:"15 mg (15–30 mg)"                      },
  "Ketoprofen":      { flat: 100,               hint:"100 mg"                                },
  "Lidocaine":       { mgPerKg: 1.5,  basis:"IBW", hint:"1.5 mg/kg IBW (1–2)"               },
  "Magnesium":       { flat: 2000,              hint:"2 g (2000 mg)"                         },
  "Bupivacaine":     { flat: 20,                hint:"20 mg"                                 },
  "Ropivacaine":     { flat: 20,                hint:"20 mg"                                 },
  "Levobupivacaine": { flat: 20,                hint:"20 mg"                                 },
}

function calcSuggestedDose(name: string, ibw: number | null, tbw: number | null): { dose: string; hint: string } {
  const cfg = BOLUS_DOSES[name]
  if (!cfg) return { dose: "", hint: "" }
  if (cfg.flat !== undefined)
    return { dose: String(cfg.flat), hint: cfg.hint }
  if (cfg.mgPerKg !== undefined) {
    const w = cfg.basis === "TBW" ? (tbw ?? ibw) : (ibw ?? tbw)
    if (!w) return { dose: "", hint: cfg.hint }
    const dose = Math.round(w * cfg.mgPerKg * 10) / 10
    return { dose: String(dose), hint: cfg.hint }
  }
  return { dose: "", hint: "" }
}

const BOLUS_CONFIGS: Record<string, { min: number; max: number; step: number }> = {
  "Propofol":        { min:0,  max:300,  step:5    },
  "Thiopental":      { min:0,  max:500,  step:25   },
  "Ketamine":        { min:0,  max:200,  step:5    },
  "Etomidate":       { min:0,  max:30,   step:2    },
  "Midazolam":       { min:0,  max:20,   step:0.5  },
  "Fentanyl":        { min:0,  max:500,  step:10   },
  "Morphine":        { min:0,  max:20,   step:1    },
  "Remifentanil":    { min:0,  max:200,  step:5    },
  "Sufentanil":      { min:0,  max:50,   step:2.5  },
  "Alfentanil":      { min:0,  max:2000, step:50   },
  "Succinylcholine": { min:0,  max:200,  step:5    },
  "Rocuronium":      { min:0,  max:100,  step:5    },
  "Vecuronium":      { min:0,  max:15,   step:1    },
  "Atracurium":      { min:0,  max:50,   step:5    },
  "Cisatracurium":   { min:0,  max:20,   step:2    },
  "Sugammadex":      { min:0,  max:400,  step:50   },
  "Neostigmine":     { min:0,  max:5,    step:0.5  },
  "Atropine":        { min:0,  max:2,    step:0.1  },
  "Galantamine":     { min:0,  max:50,   step:1    },
  "Ephedrine":       { min:0,  max:50,   step:2    },
  "Phenylephrine":   { min:0,  max:200,  step:25   },
  "Epinephrine":     { min:0,  max:1000, step:50   },
  "Norepinephrine":  { min:0,  max:1000, step:50   },
  "Vasopressin":     { min:0,  max:40,   step:5    },
  "Ondansetron":     { min:0,  max:8,    step:1    },
  "Dexamethasone":   { min:0,  max:16,   step:2    },
  "Metoclopramide":  { min:0,  max:10,   step:1    },
  "Droperidol":      { min:0,  max:2.5,  step:0.25 },
  "Paracetamol":     { min:0,  max:2,    step:0.5  },
  "Ketorolac":       { min:0,  max:30,   step:5    },
  "Ketoprofen":      { min:0,  max:100,  step:25   },
  "Lidocaine":       { min:0,  max:200,  step:10   },
  "Magnesium":       { min:0,  max:4,    step:0.5  },
  "Bupivacaine":     { min:0,  max:150,  step:5    },
  "Ropivacaine":     { min:0,  max:200,  step:10   },
  "Levobupivacaine": { min:0,  max:150,  step:5    },
  "Prilocaine":      { min:0,  max:400,  step:10   },
  "Mepivacaine":     { min:0,  max:400,  step:10   },
  "Articaine":       { min:0,  max:500,  step:10   },
}
function bolusRange(name: string, unit: string) {
  if (BOLUS_CONFIGS[name]) return BOLUS_CONFIGS[name]
  if (unit === "mcg") return { min:0, max:2000, step:10 }
  if (unit === "g")   return { min:0, max:10,   step:0.5 }
  if (unit === "ml")  return { min:0, max:100,  step:1 }
  if (unit === "IU")  return { min:0, max:200,  step:5 }
  return { min:0, max:500, step:5 }
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface VitalsEntry    { systolic?: number; diastolic?: number; heartRate?: number; spO2?: number; etco2?: number; temp?: number; bgl?: number }
export interface TimetableDrug  { colIdx: number; name: string; dose: string; unit: string }
export interface TimetableFluid { id: string; name: string; category?: string; volume: string; color: string; startCol: number; endCol: number }
export interface AgentSegment   { name: string; startCol: number; endCol: number; n2o?: number }
export interface TimetableInfusion { id: string; name: string; rate: number; unit: string; startCol: number; endCol: number; color: string }
export interface TimetableData  { vitals: VitalsEntry[]; drugs: TimetableDrug[]; fluids: TimetableFluid[]; agents: AgentSegment[]; infusions: TimetableInfusion[] }

interface Props { startTime: string; endTime?: string; monitoring?: Record<string, boolean>; ibw?: number | null; tbw?: number | null; showAgentRow?: boolean; data: TimetableData; onChange: (d: TimetableData) => void; onEndCase?: () => void }

// ── Helpers ───────────────────────────────────────────────────────────────────
function addMinutes(hhmm: string, min: number) {
  const [h, m] = (hhmm || "00:00").split(":").map(Number)
  const t = (h * 60 + m + min + 1440) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`
}

function floorTo5(hhmm: string): string {
  const [h, m] = (hhmm || "00:00").split(":").map(Number)
  return `${String(h).padStart(2, "0")}:${String(Math.floor(m / 5) * 5).padStart(2, "0")}`
}
function timeToMins(hhmm: string): number {
  const [h, m] = (hhmm || "00:00").split(":").map(Number)
  return h * 60 + m
}

function calcDuration(start: string, end: string | undefined, cols: number): string {
  if (end && end.includes(":")) {
    const [sh, sm] = start.split(":").map(Number)
    const [eh, em] = end.split(":").map(Number)
    let diff = (eh * 60 + em) - (sh * 60 + sm)
    if (diff < 0) diff += 1440
    const h = Math.floor(diff / 60)
    const mn = diff % 60
    return h > 0 ? `${h}h ${mn}min` : `${mn}min`
  }
  const total = cols * 5
  const h = Math.floor(total / 60)
  const mn = total % 60
  return h > 0 ? `${h}h ${mn}min` : `${mn}min`
}
function yPx(v: number) { return CHART_H - (v / Y_MAX) * CHART_H }
function linePath(pts: { x: number; y: number }[]) {
  return pts.length < 2 ? "" : pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
}

const CHART_LINES: { key: keyof VitalsEntry; color: string; dash?: string; opacity?: number }[] = [
  { key: "systolic",  color: "#f87171" },
  { key: "diastolic", color: "#f87171", dash: "4 2", opacity: 0.7 },
  { key: "heartRate", color: "#22c55e" },
  { key: "spO2",      color: "#06b6d4" },
  { key: "etco2",     color: "#f59e0b" },
]

const VITAL_ROW_DEFS: {
  key:      keyof VitalsEntry
  label:    string
  unit:     string
  color:    string
  min:      number
  max:      number
  monitors: string[]
}[] = [
  { key:"systolic",  label:"BP Sys",  unit:"mmHg/Torr", color:"#ef4444", min:0,  max:300, monitors:["nbpMonitor","invasiveBP"] },
  { key:"diastolic", label:"BP Dia",  unit:"mmHg/Torr", color:"#ef4444", min:0,  max:200, monitors:["nbpMonitor","invasiveBP"] },
  { key:"heartRate", label:"HR",      unit:"bpm",        color:"#22c55e", min:0,  max:300, monitors:["ecg","spO2Monitor"]       },
  { key:"spO2",      label:"SpO₂",   unit:"%",           color:"#06b6d4", min:0,  max:100, monitors:["spO2Monitor"]             },
  { key:"etco2",     label:"EtCO₂",  unit:"mmHg",       color:"#f59e0b", min:0,  max:80,  monitors:["etco2Monitor"]            },
  { key:"temp",      label:"Temp",    unit:"°C",          color:"#a78bfa", min:30, max:42,  monitors:["tempMonitor"]             },
  { key:"bgl",       label:"BGL",     unit:"mmol/L",     color:"#34d399", min:0,  max:30,  monitors:["bglMonitor"]              },
]

// ── Div-based chart ───────────────────────────────────────────────────────────
function DivChart({ vitals, colCount, activeRows }: { vitals: VitalsEntry[]; colCount: number; activeRows: typeof VITAL_ROW_DEFS }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [w, setW]    = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setW(el.offsetWidth)
    const obs = new ResizeObserver(([e]) => setW(e.contentRect.width))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const chartW = Math.max(0, w - LABEL_W)
  const colW   = chartW > 0 ? chartW / colCount : COL_W

  function dotX(ci: number) { return (ci + 0.5) * colW }
  function dotY(v: number)   { return CHART_H * (1 - v / Y_MAX) }

  function series(
    key: keyof VitalsEntry, color: string,
    opacity = 1, dashed = false,
  ) {
    const pts = vitals.flatMap((row, ci) =>
      row[key] != null ? [{ ci, x: dotX(ci), y: dotY(row[key]!), val: row[key]! }] : []
    )
    return (
      <>
        {/* connecting lines */}
        {pts.slice(1).map((p, i) => {
          const prev = pts[i]
          const dx = p.x - prev.x, dy = p.y - prev.y
          const len = Math.sqrt(dx * dx + dy * dy)
          const ang = Math.atan2(dy, dx) * 180 / Math.PI
          return (
            <div key={`l${i}`}
              className="absolute pointer-events-none"
              style={{
                left:   LABEL_W + prev.x,
                top:    prev.y,
                width:  len,
                height: 1.5,
                opacity,
                transform:       `rotate(${ang}deg)`,
                transformOrigin: "left center",
                backgroundColor: dashed ? "transparent" : color,
                borderTop:       dashed ? `1.5px dashed ${color}` : undefined,
              }}
            />
          )
        })}
        {/* dots */}
        {pts.map(p => (
          <div key={`d${p.ci}`}
            title={String(p.val)}
            className="absolute rounded-full cursor-default z-10"
            style={{ left: LABEL_W + p.x - 3, top: p.y - 3, width: 6, height: 6, backgroundColor: color, opacity }}
          />
        ))}
      </>
    )
  }

  return (
    <div ref={containerRef}
      className="relative border-b border-slate-100 dark:border-[#2a2a2a] overflow-hidden"
      style={{ height: CHART_H }}>

      {/* grid lines */}
      {GRID_VALS.map(v => {
        const y = dotY(v)
        return (
          <div key={v}>
            <div className="absolute border-t border-slate-100 dark:border-[#282828] pointer-events-none"
                 style={{ left: LABEL_W, right: 0, top: y }} />
            <span className="absolute text-[9px] text-slate-300 dark:text-[#444] select-none"
                  style={{ right: w - LABEL_W + 4, top: y - 5 }}>{v}</span>
          </div>
        )
      })}

      {/* col separators */}
      {w > 0 && Array.from({ length: colCount }, (_, ci) => (
        <div key={ci} className="absolute top-0 bottom-0 border-l border-slate-50 dark:border-[#222] pointer-events-none"
             style={{ left: LABEL_W + ci * colW }} />
      ))}

      {/* BP pulse-pressure fill — trapezoids between consecutive sys/dia pairs */}
      {w > 0 && vitals.slice(0, -1).map((row, ci) => {
        const next = vitals[ci + 1]
        if (row.systolic == null || row.diastolic == null ||
            next?.systolic == null || next?.diastolic == null) return null
        const x1 = dotX(ci), x2 = dotX(ci + 1)
        const sy1 = dotY(row.systolic),  dy1 = dotY(row.diastolic)
        const sy2 = dotY(next.systolic), dy2 = dotY(next.diastolic)
        const top    = Math.min(sy1, sy2)
        const bottom = Math.max(dy1, dy2)
        const h      = bottom - top
        if (h <= 0) return null
        const pct = (v: number) => `${((v - top) / h * 100).toFixed(1)}%`
        return (
          <div key={ci} className="absolute pointer-events-none"
            style={{
              left:   LABEL_W + x1,
              top,
              width:  x2 - x1,
              height: h,
              backgroundColor: "#ef4444",
              opacity: 0.18,
              clipPath: `polygon(0% ${pct(sy1)}, 100% ${pct(sy2)}, 100% ${pct(dy2)}, 0% ${pct(dy1)})`,
            }}
          />
        )
      })}

      {w > 0 && activeRows.map(row => (
        <div key={row.key}>
          {series(row.key, row.color, row.key === "diastolic" ? 0.55 : 0.9, row.key === "diastolic")}
        </div>
      ))}
    </div>
  )
}

// ── Fluid color by category ───────────────────────────────────────────────────
const FLUID_CAT_COLOR: Record<string, string> = {
  "Crystalloids":   "#06b6d4",
  "Colloids":       "#818cf8",
  "Blood products": "#fb7185",
  "Other":          "#94a3b8",
}
function fluidColor(name: string): string {
  for (const cat of QUICK_FLUIDS) {
    if (cat.fluids.some(f => f.name === name)) return FLUID_CAT_COLOR[cat.cat] ?? "#94a3b8"
  }
  return "#94a3b8"
}
function fluidCategory(name: string): string {
  for (const cat of QUICK_FLUIDS) {
    if (cat.fluids.some(f => f.name === name)) return cat.cat
  }
  return "Other"
}

interface FluidLaneRow { label: string; cat: string; color: string; segs: TimetableFluid[] }

function computeFluidRows(fluids: TimetableFluid[]): FluidLaneRow[] {
  const byCat = new Map<string, TimetableFluid[]>()
  for (const f of fluids) {
    const cat = f.category ?? fluidCategory(f.name)
    const list = byCat.get(cat) ?? []; list.push(f); byCat.set(cat, list)
  }
  const rows: FluidLaneRow[] = []
  for (const [cat, catFluids] of byCat) {
    const sorted = [...catFluids].sort((a, b) => a.startCol - b.startCol)
    const lanes: TimetableFluid[][] = []
    for (const fluid of sorted) {
      let placed = false
      for (const lane of lanes) {
        if (!lane.some(l => !(fluid.endCol < l.startCol || fluid.startCol > l.endCol))) {
          lane.push(fluid); placed = true; break
        }
      }
      if (!placed) lanes.push([fluid])
    }
    const catColor = FLUID_CAT_COLOR[cat] ?? "#94a3b8"
    lanes.forEach((lane, idx) => {
      rows.push({ label: idx === 0 ? cat : `${cat} ${idx + 1}`, cat, color: catColor, segs: lane })
    })
  }
  return rows
}

type FConflictAnchor = { top: number; bottom: number; left: number; right: number; width: number }
type FluidConflict =
  | { phase: "choose";   newName: string; newCat: string; newColor: string; newVol: string; newCol: number; existingId: string; existingName: string; anchor: FConflictAnchor }
  | { phase: "finished"; newName: string; newCat: string; newColor: string; newVol: string; newCol: number; existingId: string; anchor: FConflictAnchor }
  | { phase: "volume";   newName: string; newCat: string; newColor: string; newVol: string; newCol: number; existingId: string; volInput: string; anchor: FConflictAnchor }

// ── Module-level types ────────────────────────────────────────────────────────
type TtSel = { type: "drug"; idx: number } | { type: "infusion"; id: string } | { type: "fluid"; id: string } | { type: "agent"; startCol: number }
type TtFPMode = "choose" | "bolus" | "infusion" | "fluid"
type TtFP = {
  col: number; name: string; unit: string; mode: TtFPMode; dose: string; doseHint: string;
  rate: number; rateUnit: string; rateUnits: string[];
  rateMin: number; rateMax: number; rateStep: number;
  color: string; fluidScale?: "S" | "L";
  anchor: { top: number; bottom: number; left: number; right: number; width: number };
}

// ── Component ─────────────────────────────────────────────────────────────────
export function IntraopTimetable({ startTime, endTime, monitoring, ibw, tbw, showAgentRow = false, data, onChange, onEndCase }: Props) {
  const [colCount, setColCount]           = useState(24)
  const [chartOpen, setChartOpen]         = useState(false)
  const [chartMode, setChartMode]         = useState<"div" | "svg">("div")
  const [addingDrug, setAddingDrug]       = useState<number | null>(null)
  const [draft, setDraft]                 = useState({ name: "", dose: "", unit: "mg" })
  const [dragOver, setDragOver]           = useState<number | null>(null)
  // Extending an infusion segment
  const [extendingInf, setExtendingInf]   = useState<string | null>(null)
  const [extInfHover, setExtInfHover]     = useState<number | null>(null)
  // Fluid volume slider scale: S=small 10ml steps, L=large 50ml steps
  const [fluidScale, setFluidScale]       = useState<"S"|"L">("L")
  // Item-level selection (pill or infusion bar)
  const [sel, setSel] = useState<TtSel | null>(null)
  // Floating prompt portal
  const [fp, setFp] = useState<TtFP | null>(null)
  // Quick-pick column (header click) + live "now" tracking
  const [selectedCol, setSelectedCol] = useState<number>(0)
  const [nowOffsetPx, setNowOffsetPx] = useState<number | null>(null)
  const gridScrollRef                 = useRef<HTMLDivElement>(null)
  const prevColRef                    = useRef<number | null>(null)
  // Custom drug popup + saved list
  const [customDrugOpen, setCustomDrugOpen]   = useState(false)
  const [customDrugRect, setCustomDrugRect]   = useState<DOMRect | null>(null)
  const [customDrugName, setCustomDrugName]   = useState("")
  const [customDrugUnit, setCustomDrugUnit]   = useState("mg")
  const [customDrugDose, setCustomDrugDose]   = useState("")
  const [customDrugs, setCustomDrugs]         = useState<{name:string; unit:string}[]>([])

  // Stable refs
  const dataRef     = useRef(data)
  const onChangeRef = useRef(onChange)
  useEffect(() => { dataRef.current = data },       [data])
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  function openFP(col: number, name: string, unit: string, anchorEl: Element) {
    const r    = anchorEl.getBoundingClientRect()
    const cfg  = INFUSION_CONFIGS[name]
    const sugg = calcSuggestedDose(name, ibw ?? null, tbw ?? null)
    setFp({ col, name, unit,
      mode: cfg ? "choose" : "bolus",
      dose: sugg.dose, doseHint: sugg.hint,
      rate: cfg?.min ?? 0, rateUnit: cfg?.units[0] ?? "mg/hr", rateUnits: cfg?.units ?? DEFAULT_INF.units,
      rateMin: cfg?.min ?? DEFAULT_INF.min, rateMax: cfg?.max ?? DEFAULT_INF.max, rateStep: cfg?.step ?? DEFAULT_INF.step,
      color: cfg?.color ?? DEFAULT_INF.color,
      anchor: { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width },
    })
  }
  function fpCommitBolus() {
    if (!fp) return
    onChange({ ...data, drugs: [...data.drugs, { colIdx: fp.col, name: fp.name, dose: fp.dose, unit: fp.unit }] })
    setFp(null)
  }
  function addFluidDirect(name: string, cat: string, vol: string, col: number) {
    const color = FLUID_CAT_COLOR[cat] ?? fluidColor(name)
    const id = `${name}-${col}-${Date.now()}`
    const d = dataRef.current
    onChangeRef.current({ ...d, fluids: [...(d.fluids ?? []), { id, name, category: cat, volume: vol, color, startCol: col, endCol: col }] })
  }
  function checkFluidConflict(name: string, vol: string, col: number, anchor: FConflictAnchor): boolean {
    const cat = fluidCategory(name)
    const existing = (dataRef.current.fluids ?? []).find(f =>
      (f.category ?? fluidCategory(f.name)) === cat && f.startCol <= col && f.endCol >= col
    )
    if (!existing) return false
    setFluidConflict({ phase: "choose", newName: name, newCat: cat, newColor: FLUID_CAT_COLOR[cat] ?? fluidColor(name), newVol: vol, newCol: col, existingId: existing.id, existingName: existing.name, anchor })
    return true
  }
  function fpCommitFluid() {
    if (!fp) return
    const anchor = fp.anchor
    const conflict = checkFluidConflict(fp.name, fp.dose, fp.col, anchor)
    setFp(null)
    if (!conflict) addFluidDirect(fp.name, fluidCategory(fp.name), fp.dose, fp.col)
  }
  function fpCommitInfusion() {
    if (!fp) return
    const cfg = INFUSION_CONFIGS[fp.name] ?? DEFAULT_INF
    const id  = `${fp.name}-${fp.col}-${Date.now()}`
    onChange({ ...data, infusions: [...(data.infusions??[]), { id, name:fp.name, rate:fp.rate, unit:fp.rateUnit, startCol:fp.col, endCol:fp.col, color:cfg.color }] })
    setFp(null)
  }

  // Keyboard navigation on selected items
  useEffect(() => {
    if (!sel) return
    function handle(e: KeyboardEvent) {
      if (!sel) return
      const d  = dataRef.current
      const oc = onChangeRef.current
      if (e.key === "Escape") { setSel(null); return }

      const col = sel.type === "drug"     ? d.drugs[sel.idx]?.colIdx
                : sel.type === "fluid"    ? (d.fluids??[]).find(f=>f.id===(sel as any).id)?.startCol
                : (d.infusions??[]).find(i=>i.id===(sel as any).id)?.startCol
      if (col == null) return

      // Tab: cycle drug→fluid→next col drug
      if (e.key === "Tab") {
        e.preventDefault()
        // Build ordered list for cycling
        const items: TtSel[] = []
        for (let c = 0; c < colCount; c++) {
          d.drugs.forEach((x,i)     => { if (x.colIdx===c)     items.push({type:"drug",idx:i}) })
          ;(d.infusions??[]).forEach(x => { if (x.startCol===c) items.push({type:"infusion",id:x.id}) })
          ;(d.fluids??[]).forEach(x  => { if (x.startCol===c)  items.push({type:"fluid",id:x.id}) })
          ;(d.agents??[]).forEach(x  => { if (x.startCol===c)  items.push({type:"agent",startCol:x.startCol}) })
        }
        const ci = items.findIndex(it =>
          it.type===sel.type && ((it.type==="infusion"||it.type==="fluid") ? (it as any).id===(sel as any).id : (it as any).idx===(sel as any).idx)
        )
        setSel(items[(ci+1)%items.length] ?? null)
        return
      }

      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault()
        if (sel.type==="drug")     { oc({...d,drugs:d.drugs.filter((_,i)=>i!==sel.idx)}); setSel(null) }
        if (sel.type==="fluid")    { oc({...d,fluids:(d.fluids??[]).filter(f=>f.id!==(sel as any).id)}); setSel(null) }
        if (sel.type==="infusion") { oc({...d,infusions:(d.infusions??[]).filter(x=>x.id!==(sel as any).id)}); setSel(null) }
        if (sel.type==="agent") {
          const a = d.agents.find(a => a.startCol===(sel as any).startCol)
          if (a) { oc({...d, agents:d.agents.filter(x=>x.startCol!==a.startCol)}); setSel(null) }
        }
        return
      }

      if (e.key === "ArrowRight") {
        e.preventDefault()
        if (sel.type==="agent") {
          const a = d.agents.find(a => a.startCol===(sel as any).startCol)
          if (a && a.endCol+1 < colCount) oc({...d, agents:d.agents.map(x=>x.startCol===a.startCol?{...x,endCol:x.endCol+1}:x)})
          return
        }
        if (col+1 >= colCount) return
        if (sel.type==="drug") {
          const last = d.drugs[sel.idx]
          const newDrugs = [...d.drugs, {...last, colIdx:col+1}]
          oc({...d, drugs:newDrugs, infusions:(d.infusions??[]).map(i=>i.startCol<=col&&i.endCol===col?{...i,endCol:col+1}:i)})
          setSel({type:"drug", idx:newDrugs.length-1})
        }
        if (sel.type==="infusion") {
          oc({...d, infusions:(d.infusions??[]).map(i=>i.id===sel.id?{...i,endCol:i.endCol+1}:i)})
        }
        if (sel.type==="fluid") {
          const fl = (d.fluids??[]).find(f=>f.id===(sel as any).id)
          if (fl && fl.endCol+1 < colCount) oc({...d, fluids:(d.fluids??[]).map(f=>f.id===(sel as any).id?{...f,endCol:f.endCol+1}:f)})
        }
        return
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault()
        if (sel.type==="agent") {
          const a = d.agents.find(a => a.startCol===(sel as any).startCol)
          if (a && a.endCol > a.startCol) oc({...d, agents:d.agents.map(x=>x.startCol===a.startCol?{...x,endCol:x.endCol-1}:x)})
          return
        }
        if (sel.type==="drug") {
          const idx = sel.idx
          oc({...d, drugs:d.drugs.filter((_,i)=>i!==idx)}); setSel(null)
        }
        if (sel.type==="infusion") {
          const inf = (d.infusions??[]).find(i=>i.id===sel.id)
          if (inf && inf.endCol > inf.startCol) oc({...d, infusions:(d.infusions??[]).map(i=>i.id===sel.id?{...i,endCol:i.endCol-1}:i)})
        }
        if (sel.type==="fluid") {
          const fl = (d.fluids??[]).find(f=>f.id===(sel as any).id)
          if (fl && fl.endCol > fl.startCol) oc({...d, fluids:(d.fluids??[]).map(f=>f.id===(sel as any).id?{...f,endCol:f.endCol-1}:f)})
        }
        return
      }

      if (/^[0-9]$/.test(e.key) && sel.type==="drug") {
        setDraft({name:"", dose:e.key, unit:"mg"})
        setAddingDrug(col)
      }
    }
    window.addEventListener("keydown", handle)
    return () => window.removeEventListener("keydown", handle)
  }, [sel, colCount])

  // ── Live clock: advance selectedCol + pixel offset every 10 s ──────────────
  useEffect(() => {
    function tick() {
      const now = new Date()
      const diffSecs = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds())
                     - (timeToMins(floorTo5(startTime || "08:00")) * 60)
      if (diffSecs >= 0) {
        const px  = diffSecs / (INTERVAL * 60) * COL_W
        const col = Math.min(Math.floor(diffSecs / (INTERVAL * 60)), colCount - 1)
        setNowOffsetPx(Math.min(px, colCount * COL_W))
        setSelectedCol(col)

        // Auto-extend live bars when the column advances
        const prev = prevColRef.current
        if (prev !== null && col > prev) {
          const d  = dataRef.current
          const oc = onChangeRef.current
          const extended = {
            ...d,
            infusions: (d.infusions ?? []).map(i => i.endCol === prev ? { ...i, endCol: col } : i),
            fluids:    (d.fluids    ?? []).map(f => f.endCol === prev ? { ...f, endCol: col } : f),
            agents:    (d.agents   ?? []).map(a => a.endCol === prev ? { ...a, endCol: col } : a),
          }
          oc(extended)
        }
        prevColRef.current = col
      }
    }
    tick()
    const id = setInterval(tick, 10_000)
    return () => clearInterval(id)
  }, [startTime, colCount])

  const nowCol     = nowOffsetPx !== null ? Math.min(Math.floor(nowOffsetPx / COL_W), colCount - 1) : null
  // pixel offset of the now-line within the nowCol cell (for button positioning)
  const nowCellPx  = nowOffsetPx !== null && nowCol !== null ? nowOffsetPx - nowCol * COL_W : null

  // ── Auto-scroll to keep "now" column in view ─────────────────────────────────
  useEffect(() => {
    if (nowOffsetPx === null) return
    const el = gridScrollRef.current
    if (!el) return
    const lineX    = LABEL_W + nowOffsetPx
    const { scrollLeft, clientWidth } = el
    if (lineX < scrollLeft + 40 || lineX > scrollLeft + clientWidth - 40) {
      el.scrollTo({ left: lineX - clientWidth / 2, behavior: "smooth" })
    }
  }, [nowOffsetPx])
  const [fluidDragOver, setFluidDragOver]   = useState<number | null>(null)
  const [extendingFluid, setExtendingFluid] = useState<string | null>(null)
  const [extFluidHover, setExtFluidHover]   = useState<number | null>(null)
  const [fluidConflict, setFluidConflict]   = useState<FluidConflict | null>(null)
  const [agentPicker, setAgentPicker]     = useState<number | null>(null)
  const [agentPickerRect, setAgentPickerRect] = useState<DOMRect | null>(null)
  const [pickerN2o, setPickerN2o] = useState<number | null>(null)
  // Drag-to-extend state: startCol of segment being extended
  const [extendingAgent, setExtendingAgent]   = useState<number | null>(null)
  const [extendHoverCol, setExtendHoverCol]   = useState<number | null>(null)

  const roundedStart = floorTo5(startTime || "08:00")
  const times  = Array.from({ length: colCount }, (_, i) => addMinutes(roundedStart, i * INTERVAL))
  const totalW = LABEL_W + colCount * COL_W
  const agents = data.agents ?? []

  // Show only rows whose monitor is active; fall back to all rows if no monitoring passed
  const activeRows = monitoring
    ? VITAL_ROW_DEFS.filter(row => row.monitors.some(m => monitoring[m]))
    : VITAL_ROW_DEFS

  // Find segment that covers column ci (strict range check)
  function segmentAt(ci: number): AgentSegment | null {
    return agents.find(a => ci >= a.startCol && ci <= a.endCol) ?? null
  }

  // ── Vitals ──────────────────────────────────────────────────────────────────
  function setVital(col: number, key: keyof VitalsEntry, raw: string) {
    const val  = raw === "" ? undefined : Number(raw)
    const next = [...data.vitals]
    while (next.length <= col) next.push({})
    next[col] = { ...next[col], [key]: val }
    onChange({ ...data, vitals: next })
  }

  // ── Drugs ───────────────────────────────────────────────────────────────────
  function commitDrug(col: number) {
    if (!draft.name.trim()) { setAddingDrug(null); return }
    onChange({ ...data, drugs: [...data.drugs, { colIdx: col, name: draft.name.trim(), dose: draft.dose, unit: draft.unit }] })
    setDraft({ name: "", dose: "", unit: "mg" }); setAddingDrug(null)
  }
  function removeDrug(idx: number) { onChange({ ...data, drugs: data.drugs.filter((_, i) => i !== idx) }) }

  // ── Infusions ────────────────────────────────────────────────────────────────
  function removeInfusion(id: string) { onChange({ ...data, infusions: (data.infusions ?? []).filter(i => i.id !== id) }) }
  function extendInfusion(id: string, newEnd: number) {
    onChange({ ...data, infusions: (data.infusions ?? []).map(i => i.id === id ? { ...i, endCol: newEnd } : i) })
  }

  // ── Fluids ──────────────────────────────────────────────────────────────────
  function removeFluid(id: string) { onChange({ ...data, fluids: (data.fluids ?? []).filter(f => f.id !== id) }) }
  function extendFluid(id: string, newEnd: number) {
    onChange({ ...data, fluids: (data.fluids ?? []).map(f => f.id === id ? { ...f, endCol: newEnd } : f) })
  }

  // ── Agents ──────────────────────────────────────────────────────────────────
  function startAgent(col: number, name: string) {
    const filtered = agents.filter(a => !(a.startCol <= col && col <= a.endCol) && a.startCol !== col)
    const n2o = pickerN2o !== null ? pickerN2o : undefined
    onChange({ ...data, agents: [...filtered, { name, startCol: col, endCol: col, n2o }] })
    closeAgentPicker(); setPickerN2o(null)
  }
  function updateAgentExtras(startCol: number) {
    const n2o = pickerN2o !== null ? pickerN2o : undefined
    onChange({ ...data, agents: agents.map(a => a.startCol === startCol ? { ...a, n2o } : a) })
    closeAgentPicker(); setPickerN2o(null)
  }
  function openPickerForSeg(ci: number, seg: AgentSegment, rect: DOMRect) {
    if (agentPicker === ci) { setAgentPicker(null); setAgentPickerRect(null); return }
    setPickerN2o(seg.n2o ?? null)
    setAgentPicker(ci)
    setAgentPickerRect(rect)
  }
  function openPickerEmpty(ci: number, rect: DOMRect) {
    if (agentPicker === ci) { setAgentPicker(null); setAgentPickerRect(null); return }
    setPickerN2o(null)
    setAgentPicker(ci)
    setAgentPickerRect(rect)
  }
  function closeAgentPicker() { setAgentPicker(null); setAgentPickerRect(null) }
  function removeSegment(startCol: number) {
    onChange({ ...data, agents: agents.filter(a => a.startCol !== startCol) })
    closeAgentPicker()
  }
  function extendSegment(startCol: number, newEndCol: number) {
    onChange({ ...data, agents: agents.map(a => a.startCol === startCol ? { ...a, endCol: newEndCol } : a) })
  }

  // ── Extend drag-and-drop ─────────────────────────────────────────────────────
  function onGripDragStart(e: React.DragEvent, startCol: number) {
    e.dataTransfer.setData("extend-agent", String(startCol))
    e.dataTransfer.effectAllowed = "move"
    setExtendingAgent(startCol)
  }
  function onAgentCellDragOver(e: React.DragEvent, col: number) {
    if (extendingAgent === null) return
    e.preventDefault()
    e.stopPropagation()
    if (col >= extendingAgent) setExtendHoverCol(col)
    else setExtendHoverCol(extendingAgent) // retract to minimum = startCol
  }
  function onAgentCellDrop(e: React.DragEvent, col: number) {
    if (extendingAgent === null) return
    e.preventDefault()
    const startCol = parseInt(e.dataTransfer.getData("extend-agent"))
    if (isNaN(startCol)) return
    extendSegment(startCol, Math.max(col, startCol))
    setExtendingAgent(null); setExtendHoverCol(null)
  }
  function onAgentDragEnd() { setExtendingAgent(null); setExtendHoverCol(null) }

  // ── Drug/fluid drag ──────────────────────────────────────────────────────────
  function onItemDragStart(e: React.DragEvent, name: string, unit: string, type: "drug" | "fluid") {
    e.dataTransfer.setData("item-type", type); e.dataTransfer.setData("item-name", name); e.dataTransfer.setData("item-unit", unit)
    e.dataTransfer.effectAllowed = "copy"
  }
  function onDrugDragOver(e: React.DragEvent, col: number)  { if (e.dataTransfer.types.includes("ext-inf") || e.dataTransfer.types.includes("ext-fluid") || e.dataTransfer.types.includes("extend-agent")) return; e.preventDefault(); setDragOver(col) }
  function onDrugDrop(e: React.DragEvent, col: number) {
    e.preventDefault(); setDragOver(null)
    const type = e.dataTransfer.getData("item-type")
    if (type === "move-drug") {
      const idx = parseInt(e.dataTransfer.getData("item-idx"))
      if (!isNaN(idx)) onChange({ ...data, drugs: data.drugs.map((d, i) => i === idx ? { ...d, colIdx: col } : d) })
      return
    }
    if (type !== "drug") return
    openFP(col, e.dataTransfer.getData("item-name"), e.dataTransfer.getData("item-unit"), e.currentTarget)
  }
  function onFluidDragOver(e: React.DragEvent, col: number) { e.preventDefault(); setFluidDragOver(col) }
  function onFluidDrop(e: React.DragEvent, col: number) {
    e.preventDefault(); setFluidDragOver(null)
    const type = e.dataTransfer.getData("item-type")
    if (type === "move-fluid") {
      const id = e.dataTransfer.getData("item-id")
      if (id) {
        const fl = (data.fluids ?? []).find(f => f.id === id)
        if (fl) {
          const span = fl.endCol - fl.startCol
          onChange({ ...data, fluids: (data.fluids ?? []).map(f => f.id === id ? { ...f, startCol: col, endCol: col + span } : f) })
        }
      }
      return
    }
    if (type !== "fluid") return
    const name = e.dataTransfer.getData("item-name")
    const anchor = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const conflict = checkFluidConflict(name, "", col, anchor)
    if (!conflict) addFluidDirect(name, fluidCategory(name), "", col)
  }

  const [showEndPrompt, setShowEndPrompt] = useState(false)

  // ── Chart ─────────────────────────────────────────────────────────────────────
  function pts(key: keyof VitalsEntry) {
    return times.flatMap((_, ci) => {
      const v = data.vitals[ci]?.[key]; return v == null ? [] : [{ x: LABEL_W + ci * COL_W + COL_W / 2, y: yPx(v) }]
    })
  }
  const bpAreaPath = (() => {
    const pairs = times.flatMap((_, ci) => {
      const s = data.vitals[ci]?.systolic, d = data.vitals[ci]?.diastolic
      return (s != null && d != null) ? [{ x: LABEL_W + ci * COL_W + COL_W / 2, sy: yPx(s), dy: yPx(d) }] : []
    })
    if (pairs.length < 2) return ""
    const fwd = pairs.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.sy}`).join(" ")
    const bwd = [...pairs].reverse().map(p => `L ${p.x} ${p.dy}`).join(" ")
    return `${fwd} ${bwd} Z`
  })()

  // ── Shared styles ─────────────────────────────────────────────────────────────
  const cellCls     = "w-full text-center text-sm font-mono bg-transparent outline-none focus:bg-blue-50 dark:focus:bg-blue-900/30 rounded transition-colors py-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-slate-700 dark:text-[#d0d0d0]"
  const rowLabelCls = "text-xs font-semibold text-slate-400 dark:text-[#888] uppercase tracking-wide text-right pr-2 leading-none select-none"
  const inlineInput = "w-full text-xs bg-white dark:bg-[#2a2a2a] border border-slate-200 dark:border-[#3a3a3a] rounded px-1.5 py-1 outline-none"

  return (
    <>
    <div className="space-y-3">
      {/* Chart toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => setChartOpen(o => !o)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors select-none ${
            chartOpen
              ? "bg-slate-800 dark:bg-slate-200 border-slate-700 dark:border-slate-300 text-white dark:text-slate-900"
              : "bg-white dark:bg-[#2a2a2a] border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-[#999] hover:border-slate-300"}`}>
          {chartOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {chartOpen ? "Hide chart" : "Show chart"}
          {chartOpen && (
            <span className="flex items-center gap-2 ml-1 text-[10px] font-normal opacity-70">
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-[2px] bg-red-400 rounded" />BP</span>
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-[2px] bg-green-500 rounded" />HR</span>
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-[2px] bg-cyan-500 rounded" />SpO₂</span>
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-[2px] bg-amber-500 rounded" />EtCO₂</span>
            </span>
          )}
        </button>
        {chartOpen && (
          <div className="flex rounded-full border border-slate-200 dark:border-[#3a3a3a] overflow-hidden text-[10px] font-medium">
            <button type="button"
              onClick={() => setChartMode("div")}
              className={`px-2.5 py-1 transition-colors ${chartMode === "div" ? "bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900" : "text-slate-400 dark:text-[#777] hover:bg-slate-50 dark:hover:bg-[#2a2a2a]"}`}>
              Grid
            </button>
            <button type="button"
              onClick={() => setChartMode("svg")}
              className={`px-2.5 py-1 border-l border-slate-200 dark:border-[#3a3a3a] transition-colors ${chartMode === "svg" ? "bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900" : "text-slate-400 dark:text-[#777] hover:bg-slate-50 dark:hover:bg-[#2a2a2a]"}`}>
              SVG
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-3 items-start">
        {/* ── Timetable grid ──────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-2">
          <div ref={gridScrollRef} className="overflow-x-auto rounded-lg border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#1c1c1c]">
            <div style={{ minWidth: totalW, position: "relative" }}>

              {/* Chart */}
              {chartOpen && chartMode === "div" && (
                <DivChart vitals={data.vitals} colCount={colCount} activeRows={activeRows} />
              )}
              {chartOpen && chartMode === "svg" && (
                <svg width={totalW} height={CHART_H + 4} className="block border-b border-slate-100 dark:border-[#2a2a2a]">
                  {GRID_VALS.map(v => {
                    const y = yPx(v)
                    return <g key={v}>
                      <line x1={LABEL_W} x2={totalW} y1={y} y2={y} stroke="currentColor" strokeOpacity={0.08} strokeWidth={1} />
                      <text x={LABEL_W-4} y={y+3.5} textAnchor="end" fontSize={9} fill="currentColor" fillOpacity={0.4}>{v}</text>
                    </g>
                  })}
                  {times.map((_, ci) => (
                    <line key={ci} x1={LABEL_W+ci*COL_W} x2={LABEL_W+ci*COL_W} y1={0} y2={CHART_H} stroke="currentColor" strokeOpacity={0.05} strokeWidth={1} />
                  ))}
                  {bpAreaPath && <path d={bpAreaPath} fill="rgba(239,68,68,0.12)" />}
                  {CHART_LINES.map(({ key, color, dash, opacity }) => {
                    const p = pts(key)
                    return <g key={key}>
                      {p.length >= 2 && <path d={linePath(p)} fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={opacity ?? 0.9} strokeLinejoin="round" strokeDasharray={dash} />}
                      {p.map((pt, i) => <circle key={i} cx={pt.x} cy={pt.y} r={2.5} fill={color} fillOpacity={opacity ?? 1} />)}
                    </g>
                  })}
                </svg>
              )}

              {/* "Now" vertical line overlay — sub-column precision */}
              {nowOffsetPx !== null && (
                <div
                  style={{ position: "absolute", left: LABEL_W + nowOffsetPx - 1, top: 0, bottom: 0, width: 2, zIndex: 6, pointerEvents: "none" }}
                  className="bg-orange-400/50 dark:bg-orange-500/40"
                />
              )}

              {/* Vital rows — shown based on active monitoring, above the time header */}
              {activeRows.length === 0 && (
                <div className="flex items-center border-b border-slate-50 dark:border-[#222] py-2">
                  <div style={{ width: LABEL_W, minWidth: LABEL_W }} className={rowLabelCls + " py-2"} />
                  <span className="text-[10px] text-slate-300 dark:text-[#555] italic px-3">Select monitoring to populate vitals</span>
                </div>
              )}
              {activeRows.map((row, ri) => (
                <div key={row.key} className={`flex items-center border-b border-slate-50 dark:border-[#222] ${ri % 2 === 1 ? "bg-slate-50/40 dark:bg-[#1a1a1a]/60" : ""}`}>
                  <div style={{ width: LABEL_W, minWidth: LABEL_W }}
                    className="flex flex-col items-end justify-center pr-2 py-1.5 gap-0 select-none">
                    <span className="text-xs font-semibold text-slate-400 dark:text-[#888] uppercase tracking-wide leading-tight">{row.label}</span>
                    <span className="text-[10px] text-slate-300 dark:text-[#555] leading-tight">({row.unit})</span>
                  </div>
                  {times.map((_, ci) => (
                    <div key={ci} style={{ width: COL_W, minWidth: COL_W }} className="border-l border-slate-100 dark:border-[#2a2a2a] px-1 py-1.5">
                      <input type="number" tabIndex={-1} min={row.min} max={row.max} placeholder="·"
                        value={data.vitals[ci]?.[row.key] ?? ""}
                        onChange={e => setVital(ci, row.key, e.target.value)}
                        className={cellCls} />
                    </div>
                  ))}
                </div>
              ))}

              {/* Time header */}
              <div className="flex border-b border-slate-100 dark:border-[#2a2a2a] bg-slate-50 dark:bg-[#1a1a1a]">
                <div style={{ width: LABEL_W, minWidth: LABEL_W }} className="text-[10px] text-slate-300 dark:text-[#555] px-2 py-1.5 text-right">Time</div>
                {times.map((t, ci) => (
                  <div key={ci} style={{ width: COL_W, minWidth: COL_W }}
                    onClick={() => setSelectedCol(ci)}
                    className={`relative text-xs font-mono font-semibold text-center py-2 border-l border-slate-100 dark:border-[#2a2a2a] cursor-pointer transition-colors select-none ${
                      selectedCol === ci
                        ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"
                        : "text-slate-500 dark:text-[#888] hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/10"
                    }`}>
                    {t}
                    {nowCol === ci && (
                      <span className="absolute top-0.5 right-0.5 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
                      </span>
                    )}
                    {selectedCol === ci && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400" />}
                  </div>
                ))}
              </div>

              {/* ── Inhalational agent row — only when gas technique selected */}
              {showAgentRow && (() => {
                const nowAgentSeg = nowCol !== null ? segmentAt(nowCol) : null
                return (
                <div className="flex items-stretch border-b border-slate-200 dark:border-[#2e2e2e] bg-slate-50/60 dark:bg-[#1a1a1a]/60 relative" style={{ minHeight: 32 }}>
                <div style={{ width: LABEL_W, minWidth: LABEL_W }} className={rowLabelCls + " flex items-center justify-end py-2"}>
                  Inh. Agent
                </div>
                {/* Line-attached STOP button */}
                {nowOffsetPx !== null && nowAgentSeg && (
                  <button type="button" title="Stop inhalation at current time"
                    onClick={e => { e.stopPropagation(); extendSegment(nowAgentSeg.startCol, nowCol!) }}
                    style={{ position:"absolute", left: LABEL_W + nowOffsetPx + 2, top:"50%", transform:"translateY(-50%)", zIndex:20 }}
                    className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-red-700 dark:bg-red-900/80 hover:bg-red-600 dark:hover:bg-red-800 text-white border border-red-600 dark:border-red-800 whitespace-nowrap cursor-pointer">
                    STOP
                  </button>
                )}
                {times.map((_, ci) => {
                  const committedSeg = segmentAt(ci)
                  // During drag, extend the bar visually into preview cells
                  const draggingSeg = (() => {
                    if (extendingAgent === null || extendHoverCol === null) return null
                    const s = agents.find(a => a.startCol === extendingAgent)
                    if (!s) return null
                    return (ci > s.endCol && ci <= extendHoverCol) ? s : null
                  })()
                  const seg      = committedSeg ?? draggingSeg
                  const isDragPreview = !committedSeg && !!draggingSeg
                  const style    = seg ? (AGENT_STYLE[seg.name] ?? AGENT_STYLE["Sevoflurane"]) : null
                  const isStart  = seg?.startCol === ci
                  // During drag, visual end follows hover (supports both extend and retract)
                  const effectiveEnd = seg && extendingAgent === seg.startCol && extendHoverCol !== null
                    ? extendHoverCol : (seg?.endCol ?? -1)
                  const isEnd    = seg !== null && ci === effectiveEnd

                  return (
                    <div key={ci} style={{ width: COL_W, minWidth: COL_W }}
                      data-agent-cell
                      className="group relative border-l border-slate-100 dark:border-[#2a2a2a] flex items-center"
                      onDragOver={e => onAgentCellDragOver(e, ci)}
                      onDrop={e => onAgentCellDrop(e, ci)}
                      onClick={e => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        if (seg && isStart) openPickerForSeg(ci, seg, rect)
                        else if (!seg) openPickerEmpty(ci, rect)
                      }}>

                      {/* "choose" placeholder on empty cells */}
                      {!seg && (
                        <span className="w-full text-center text-[10px] text-slate-300 dark:text-[#444] select-none pointer-events-none">choose</span>
                      )}

                      {/* Bar spanning this column */}
                      {seg && style && (() => {
                        const isAgentSel = sel?.type === "agent" && (sel as any).startCol === seg.startCol
                        const label = isStart ? [
                          seg.name,
                          seg.n2o != null ? `+ N₂O ${seg.n2o}%` : null,
                        ].filter(Boolean).join(" ") : null
                        return (
                          <>
                            <div
                              onClick={e => { e.stopPropagation(); const rect = (e.currentTarget as HTMLElement).closest("[data-agent-cell]")?.getBoundingClientRect() ?? (e.currentTarget as HTMLElement).getBoundingClientRect(); setSel({ type:"agent", startCol: seg.startCol }); if (isStart) openPickerForSeg(ci, seg, rect) }}
                              className={`absolute inset-y-1 border-y cursor-pointer transition-all ${style.bar}
                                ${isStart ? "left-1 border-l rounded-l-full" : "left-0"}
                                ${isEnd   ? "right-1 border-r rounded-r-sm"  : "right-0 border-r-0"}
                                ${isDragPreview ? "opacity-60" : ""}
                                ${isAgentSel ? "brightness-125 ring-1 ring-inset ring-white/40" : ""}`}
                            />
                            {label && (
                              <span
                                className={`absolute top-1/2 -translate-y-1/2 left-2 text-xs font-bold whitespace-nowrap pointer-events-none select-none z-10 ${style.text}`}
                                style={{ minWidth: (effectiveEnd - seg.startCol + 1) * COL_W - 16 }}>
                                {label}
                              </span>
                            )}
                          </>
                        )
                      })()}

                      {/* Drag grip */}
                      {isEnd && style && seg && (
                        <div draggable
                          onDragStart={e => { e.stopPropagation(); onGripDragStart(e, seg.startCol) }}
                          onDragEnd={onAgentDragEnd}
                          className={`absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize z-10 ${style.grip} opacity-70 hover:opacity-100 rounded-r-sm`}>
                          <span className="text-white text-[8px] font-bold select-none">⋮</span>
                        </div>
                      )}

                      {/* Remove button */}
                      {isStart && seg && (
                        <button type="button"
                          onClick={e => { e.stopPropagation(); removeSegment(seg.startCol) }}
                          className="absolute top-0.5 right-3 z-10 opacity-0 hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity">
                          <X className="h-2.5 w-2.5" />
                        </button>
                      )}
                      {/* Hover STOP button for non-nowCol cells */}
                      {ci !== nowCol && seg && !isDragPreview && (
                        <button type="button" title="Stop inhalation here"
                          onClick={e => { e.stopPropagation(); extendSegment(seg.startCol, ci) }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 z-20 text-[8px] font-bold px-1.5 py-0.5 rounded bg-red-700 dark:bg-red-900/80 hover:bg-red-600 dark:hover:bg-red-800 text-white border border-red-600 dark:border-red-800 whitespace-nowrap cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
                          STOP
                        </button>
                      )}

                    </div>
                  )
                })}
              </div>
              )})()}

              {/* Drug row */}
              <div className="flex min-h-[64px] border-t border-slate-100 dark:border-[#2a2a2a]">
                <div style={{ width: LABEL_W, minWidth: LABEL_W }} className={rowLabelCls + " py-3 flex items-start justify-end"}>Drugs</div>
                {times.map((_, ci) => {
                  const colDrugs = data.drugs.filter(d => d.colIdx === ci)
                  return (
                    <div key={ci} style={{ width: COL_W, minWidth: COL_W }}
                      onDragOver={e => onDrugDragOver(e, ci)}
                      onDragLeave={() => setDragOver(null)}
                      onDrop={e => onDrugDrop(e, ci)}

                      className={`border-l border-slate-100 dark:border-[#2a2a2a] px-1 py-1 space-y-0.5 transition-colors ${
                        dragOver === ci ? "bg-violet-50 dark:bg-violet-900/20" : ""
                      }`}>
                      {colDrugs.map(d => {
                        const gi = data.drugs.findIndex(g => g === d)
                        return (
                          <div key={gi} draggable
                            onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData("item-type","move-drug"); e.dataTransfer.setData("item-idx", String(gi)); e.dataTransfer.effectAllowed="move" }}
                            onClick={e => { e.stopPropagation(); setSel({ type:"drug", idx:gi }) }}
                            className={`flex items-start gap-1 rounded px-2.5 py-1.5 group cursor-grab active:cursor-grabbing transition-colors ${
                              sel?.type === "drug" && sel.idx === gi
                                ? "bg-violet-400 dark:bg-violet-600 ring-2 ring-violet-500 dark:ring-violet-400"
                                : "bg-violet-100 dark:bg-violet-900/40 hover:bg-violet-200 dark:hover:bg-violet-800/40"
                            }`}>
                            <span className="text-sm font-semibold text-violet-800 dark:text-violet-300 leading-tight truncate flex-1">
                              {d.name}{d.dose && <><br /><span className="font-normal font-mono text-xs opacity-90">{d.dose} {d.unit}</span></>}
                            </span>
                            <button type="button" tabIndex={-1} onClick={() => removeDrug(gi)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-violet-400 hover:text-violet-700 shrink-0 mt-0.5">
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        )
                      })}
                      {/* Bolus form (+ button only) */}
                      {addingDrug === ci && (() => {
                        const br = bolusRange(draft.name, draft.unit)
                        const numDose = parseFloat(draft.dose) || 0
                        return (
                          <div className="space-y-0.5">
                            <input autoFocus type="text" placeholder="Drug" value={draft.name}
                              onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                              onKeyDown={e => { if (e.key === "Enter") commitDrug(ci); if (e.key === "Escape") setAddingDrug(null) }}
                              className={inlineInput + " focus:border-blue-400"} />
                            <input type="range" min={br.min} max={br.max} step={br.step}
                              value={numDose}
                              onChange={e => setDraft(d => ({ ...d, dose: e.target.value }))}
                              className="w-full h-1.5 accent-violet-500" />
                            <div className="flex gap-0.5">
                              <input type="number" placeholder="Dose" value={draft.dose}
                                onChange={e => setDraft(d => ({ ...d, dose: e.target.value }))}
                                onKeyDown={e => { if (e.key === "Enter") commitDrug(ci); if (e.key === "Escape") setAddingDrug(null) }}
                                className={inlineInput + " w-[34px] focus:border-blue-400 [appearance:textfield]"} />
                              <select value={draft.unit} onChange={e => setDraft(d => ({ ...d, unit: e.target.value }))}
                                className="flex-1 text-[9px] bg-white dark:bg-[#2a2a2a] border border-slate-200 dark:border-[#3a3a3a] rounded px-0.5 py-0.5 outline-none">
                                {["mg","mcg","μg","ml","g","IU"].map(u => <option key={u}>{u}</option>)}
                              </select>
                            </div>
                            <button type="button" onClick={() => commitDrug(ci)}
                              className="w-full text-[9px] bg-violet-500 hover:bg-violet-600 text-white rounded py-0.5">Add</button>
                          </div>
                        )
                      })()}
                      {addingDrug !== ci && (
                        <button type="button" tabIndex={-1}
                          onClick={() => { setDraft({ name: "", dose: "", unit: "mg" }); setAddingDrug(ci) }}
                          className="w-full flex items-center justify-center text-slate-300 dark:text-[#555] hover:text-slate-500 transition-colors py-0.5">
                          <Plus className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Infusion rows — one per unique drug name */}
              {[...new Set((data.infusions ?? []).map(i => i.name))].map(drugName => {
                const segs = (data.infusions ?? []).filter(i => i.name === drugName)
                const color = segs[0]?.color ?? "#64748b"
                const nowInfSeg = nowCol !== null ? segs.find(s => s.startCol <= nowCol && s.endCol >= nowCol) : null
                return (
                  <div key={drugName} className="flex items-stretch border-t border-slate-100 dark:border-[#2a2a2a] relative" style={{ minHeight: 28 }}>
                    <div style={{ width: LABEL_W, minWidth: LABEL_W }}
                      className="flex flex-col items-end justify-center pr-2 py-1 gap-0 select-none">
                      <span className="text-xs font-semibold uppercase tracking-wide leading-tight" style={{ color }}>{drugName}</span>
                      <span className="text-[10px] text-slate-300 dark:text-[#555] leading-tight">infusion</span>
                    </div>
                    {/* Line-attached END button */}
                    {nowOffsetPx !== null && nowInfSeg && (
                      <button type="button" title="End infusion at current time"
                        onClick={e => { e.stopPropagation(); extendInfusion(nowInfSeg.id, nowCol!) }}
                        style={{ position:"absolute", left: LABEL_W + nowOffsetPx + 2, top:"50%", transform:"translateY(-50%)", zIndex:20 }}
                        className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-red-700 dark:bg-red-900/80 hover:bg-red-600 dark:hover:bg-red-800 text-white border border-red-600 dark:border-red-800 whitespace-nowrap cursor-pointer">
                        END
                      </button>
                    )}
                    {times.map((_, ci) => {
                      const committedSeg = segs.find(s => ci >= s.startCol && ci <= s.endCol)
                      const previewSeg = !committedSeg && extendingInf && extInfHover !== null
                        ? segs.find(s => s.id === extendingInf && ci > s.endCol && ci <= extInfHover) ?? null
                        : null
                      const seg = committedSeg ?? previewSeg
                      const isDragPreview = !committedSeg && !!previewSeg
                      const isStart = seg?.startCol === ci
                      const effectiveEnd = seg && extendingInf === seg.id && extInfHover !== null
                        ? Math.max(extInfHover, seg.startCol) : (seg?.endCol ?? -1)
                      const isEnd = seg !== null && ci === effectiveEnd
                      return (
                        <div key={ci} style={{ width: COL_W, minWidth: COL_W }}
                          className="group relative border-l border-slate-100 dark:border-[#2a2a2a] flex items-center"
                          onDragOver={e => {
                            if (!extendingInf) return
                            e.preventDefault(); e.stopPropagation()
                            const s = segs.find(s => s.id === extendingInf)
                            if (s) setExtInfHover(Math.max(ci, s.startCol))
                          }}
                          onDrop={e => {
                            if (!extendingInf) return
                            e.preventDefault()
                            const s = segs.find(s => s.id === extendingInf)
                            if (s) extendInfusion(extendingInf, Math.max(ci, s.startCol))
                            setExtendingInf(null); setExtInfHover(null)
                          }}>
                          {seg && (
                            <div
                              onClick={e => { e.stopPropagation(); if (isStart) setSel({ type:"infusion", id:seg.id }) }}
                              className={`absolute inset-y-1 flex items-center overflow-hidden border-y cursor-pointer
                              ${isStart ? "left-1 border-l rounded-l-full" : "left-0"}
                              ${isEnd   ? "right-3 border-r rounded-r-sm"  : "right-0 border-r-0"}
                              ${isDragPreview ? "opacity-50" : ""}`}
                              style={{
                                backgroundColor: sel?.type==="infusion" && sel.id===seg.id ? color+"88" : color+"33",
                                borderColor:     sel?.type==="infusion" && sel.id===seg.id ? color      : color+"88",
                                boxShadow:       sel?.type==="infusion" && sel.id===seg.id ? `0 0 0 1.5px ${color}` : undefined,
                              }}>
                              {isStart && (
                                <span className="text-[10px] font-bold px-2 truncate whitespace-nowrap" style={{ color }}>
                                  {seg.rate} {seg.unit}
                                </span>
                              )}
                            </div>
                          )}
                          {isEnd && seg && !isDragPreview && (
                            <div
                              draggable
                              onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData("ext-inf", seg.id); setExtendingInf(seg.id) }}
                              onDragEnd={() => { setExtendingInf(null); setExtInfHover(null) }}
                              className="absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize z-10 opacity-70 hover:opacity-100 rounded-r-sm"
                              style={{ backgroundColor: color }}>
                              <span className="text-white text-[8px] font-bold select-none">⋮</span>
                            </div>
                          )}
                          {isStart && seg && (
                            <button type="button"
                              onClick={e => { e.stopPropagation(); removeInfusion(seg.id) }}
                              className="absolute top-0.5 right-4 z-10 opacity-0 hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity">
                              <X className="h-2.5 w-2.5" />
                            </button>
                          )}
                          {/* Hover END button for non-nowCol cells */}
                          {ci !== nowCol && seg && !isDragPreview && (
                            <button type="button" title="End infusion here"
                              onClick={e => { e.stopPropagation(); extendInfusion(seg.id, ci) }}
                              className="absolute right-3 top-1/2 -translate-y-1/2 z-20 text-[8px] font-bold px-1.5 py-0.5 rounded bg-red-700 dark:bg-red-900/80 hover:bg-red-600 dark:hover:bg-red-800 text-white border border-red-600 dark:border-red-800 whitespace-nowrap cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
                              END
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}

              {/* Fluid bar rows — grouped by category + lane */}
              {computeFluidRows(data.fluids ?? []).map(({ label, segs, color }) => {
                const nowFluidSeg = nowCol !== null ? segs.find(s => s.startCol <= nowCol && s.endCol >= nowCol) : null
                return (
                  <div key={label} className="flex min-h-[64px] border-t border-slate-100 dark:border-[#2a2a2a] relative">
                    <div style={{ width: LABEL_W, minWidth: LABEL_W }}
                      className="flex flex-col items-end justify-center pr-2 py-2 gap-0 select-none shrink-0">
                      <span className="text-xs font-semibold uppercase tracking-wide leading-tight" style={{ color }}>{label}</span>
                      <span className="text-[10px] text-slate-300 dark:text-[#555] leading-tight">fluid</span>
                    </div>
                    {/* Line-attached END button */}
                    {nowOffsetPx !== null && nowFluidSeg && (
                      <button type="button" title="End fluid infusion at current time"
                        onClick={e => { e.stopPropagation(); extendFluid(nowFluidSeg.id, nowCol!) }}
                        style={{ position:"absolute", left: LABEL_W + nowOffsetPx + 2, top:"50%", transform:"translateY(-50%)", zIndex:20 }}
                        className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-red-700 dark:bg-red-900/80 hover:bg-red-600 dark:hover:bg-red-800 text-white border border-red-600 dark:border-red-800 whitespace-nowrap cursor-pointer">
                        END
                      </button>
                    )}
                    {times.map((_, ci) => {
                      const committedSeg = segs.find(s => ci >= s.startCol && ci <= s.endCol)
                      const previewSeg = !committedSeg && extendingFluid && extFluidHover !== null
                        ? segs.find(s => s.id === extendingFluid && ci > s.endCol && ci <= extFluidHover) ?? null
                        : null
                      const seg = committedSeg ?? previewSeg
                      const isDragPreview = !committedSeg && !!previewSeg
                      const isStart = seg?.startCol === ci
                      const effectiveEnd = seg && extendingFluid === seg.id && extFluidHover !== null
                        ? Math.max(extFluidHover, seg.startCol) : (seg?.endCol ?? -1)
                      const isEnd = seg !== null && ci === effectiveEnd
                      const isSel = seg && sel?.type==="fluid" && (sel as any).id===seg.id
                      return (
                        <div key={ci} style={{ width: COL_W, minWidth: COL_W }}
                          className="group relative border-l border-slate-100 dark:border-[#2a2a2a] flex items-center"
                          onDragOver={e => {
                            if (!extendingFluid || e.dataTransfer.types.includes("extend-agent")) return
                            e.preventDefault(); e.stopPropagation()
                            const s = segs.find(s => s.id===extendingFluid)
                            if (s) setExtFluidHover(Math.max(ci, s.startCol))
                          }}
                          onDrop={e => {
                            if (!extendingFluid) return
                            e.preventDefault()
                            const s = segs.find(s => s.id===extendingFluid)
                            if (s) extendFluid(extendingFluid, Math.max(ci, s.startCol))
                            setExtendingFluid(null); setExtFluidHover(null)
                          }}>
                          {seg && (
                            <div
                              onClick={e => { e.stopPropagation(); if (isStart) setSel({ type:"fluid", id:seg.id }) }}
                              className={`absolute inset-y-1 flex items-center overflow-hidden border-y cursor-pointer
                                ${isStart ? "left-1 border-l rounded-l-full" : "left-0"}
                                ${isEnd   ? "right-3 border-r rounded-r-sm"  : "right-0 border-r-0"}
                                ${isDragPreview ? "opacity-50" : ""}`}
                              style={{
                                backgroundColor: isSel ? color+"88" : color+"33",
                                borderColor:     isSel ? color      : color+"88",
                                boxShadow:       isSel ? `0 0 0 1.5px ${color}` : undefined,
                              }}>
                              {isStart && (
                                <span className="text-[10px] font-bold px-2 truncate whitespace-nowrap" style={{ color }}>
                                  {seg.volume ? `${seg.volume} ml` : seg.name}
                                </span>
                              )}
                            </div>
                          )}
                          {isEnd && seg && !isDragPreview && (
                            <div
                              draggable
                              onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData("ext-fluid", seg.id); setExtendingFluid(seg.id) }}
                              onDragEnd={() => { setExtendingFluid(null); setExtFluidHover(null) }}
                              className="absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize z-10 opacity-70 hover:opacity-100 rounded-r-sm"
                              style={{ backgroundColor: color }}>
                              <span className="text-white text-[8px] font-bold select-none">⋮</span>
                            </div>
                          )}
                          {isStart && seg && (
                            <button type="button"
                              onClick={e => { e.stopPropagation(); removeFluid(seg.id) }}
                              className="absolute top-0.5 right-4 z-10 opacity-0 hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity">
                              <X className="h-2.5 w-2.5" />
                            </button>
                          )}
                          {/* Hover END button for non-nowCol cells */}
                          {ci !== nowCol && seg && !isDragPreview && (
                            <button type="button" title="End fluid infusion here"
                              onClick={e => { e.stopPropagation(); extendFluid(seg.id, ci) }}
                              className="absolute right-3 top-1/2 -translate-y-1/2 z-20 text-[8px] font-bold px-1.5 py-0.5 rounded bg-red-700 dark:bg-red-900/80 hover:bg-red-600 dark:hover:bg-red-800 text-white border border-red-600 dark:border-red-800 whitespace-nowrap cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
                              END
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}

              {/* Fluid drop zone — always visible, accepts panel drags */}
              <div className="flex min-h-[64px] border-t border-slate-200 dark:border-[#2e2e2e] bg-cyan-50/20 dark:bg-cyan-950/5">
                <div style={{ width: LABEL_W, minWidth: LABEL_W }}
                  className={rowLabelCls + " py-1.5 flex items-center justify-end opacity-50"}>Fluids</div>
                {times.map((_, ci) => (
                  <div key={ci} style={{ width: COL_W, minWidth: COL_W }}
                    onDragOver={e => { if (e.dataTransfer.types.includes("ext-inf") || e.dataTransfer.types.includes("ext-fluid") || e.dataTransfer.types.includes("extend-agent")) return; e.preventDefault(); setFluidDragOver(ci) }}
                    onDragLeave={() => setFluidDragOver(null)}
                    onDrop={e => onFluidDrop(e, ci)}
                    className={`border-l border-slate-100 dark:border-[#2a2a2a] transition-colors ${fluidDragOver===ci ? "bg-cyan-100 dark:bg-cyan-900/20" : ""}`}
                  />
                ))}
              </div>

            </div>
          </div>

          {/* Hotkeys legend */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 px-1">
            {([
              ["Click", "Select"],
              ["Del / ⌫", "Delete"],
              ["→", "Extend / copy right"],
              ["←", "Retract"],
              ["Tab", "Cycle items"],
              ["0–9", "Enter dose"],
              ["Esc", "Deselect"],
            ] as [string,string][]).map(([k,d]) => (
              <span key={k} className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-[#666]">
                <kbd className="px-1 py-0.5 font-mono text-[9px] bg-slate-100 dark:bg-[#2a2a2a] border border-slate-200 dark:border-[#3a3a3a] rounded">{k}</kbd>
                {d}
              </span>
            ))}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => setColCount(n => n + 6)}
              className="text-xs text-slate-400 dark:text-[#888] hover:text-slate-600 border border-slate-200 dark:border-[#3a3a3a] rounded-full px-3 py-1 transition-colors">
              + 30 min
            </button>
            {colCount > 12 && (
              <button type="button" onClick={() => setColCount(n => Math.max(12, n - 6))}
                className="text-xs text-slate-400 dark:text-[#888] hover:text-slate-600 border border-slate-200 dark:border-[#3a3a3a] rounded-full px-3 py-1 transition-colors">
                − 30 min
              </button>
            )}
            <span className="text-xs text-slate-400 dark:text-[#666]">
              Total: <span className="font-semibold text-slate-600 dark:text-[#aaa]">{calcDuration(roundedStart, endTime, colCount)}</span>
              {endTime && <span className="ml-1 text-[10px] text-slate-300 dark:text-[#555]">({roundedStart} → {endTime})</span>}
            </span>
            <div className="ml-auto relative">
              <button type="button"
                onClick={() => setShowEndPrompt(v => !v)}
                className="text-xs font-semibold px-4 py-1.5 rounded-full border-2 border-red-400 text-red-500 hover:bg-red-500 hover:text-white dark:border-red-500 dark:text-red-400 dark:hover:bg-red-600 dark:hover:text-white transition-colors">
                End Case
              </button>
              {showEndPrompt && (
                <div className="absolute bottom-full right-0 mb-2 z-50 bg-white dark:bg-[#2a2a2a] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-xl p-3 space-y-2 min-w-[160px]">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">End case…</p>
                  <button type="button"
                    onClick={() => { onEndCase?.(); setShowEndPrompt(false) }}
                    className="w-full text-left text-sm font-medium px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors">
                    End now
                  </button>
                  <button type="button"
                    onClick={() => setShowEndPrompt(false)}
                    className="w-full text-left text-sm text-slate-500 dark:text-slate-400 px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-[#333] transition-colors">
                    Write manually
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Tags panel ──────────────────────────────────────────────────────── */}
        <div className="w-52 shrink-0 rounded-lg border border-slate-200 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#1a1a1a] overflow-y-auto max-h-[520px]"
          onWheel={e => e.stopPropagation()}>
          <div className="p-2.5 space-y-3">

            <div className="space-y-1.5">
              <p className="text-[9px] font-bold text-slate-400 dark:text-[#666] uppercase tracking-widest">Drugs</p>
              <p className="text-[8px] text-slate-300 dark:text-[#555]">at <span className="font-semibold text-blue-400">{times[selectedCol]}</span> · click header to change</p>
              <button type="button"
                onClick={e => {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  setCustomDrugName(""); setCustomDrugUnit("mg")
                  setCustomDrugRect(rect); setCustomDrugOpen(o => !o)
                }}
                className={`w-full text-xs font-semibold px-2.5 py-1.5 rounded border transition-colors ${
                  customDrugOpen
                    ? "bg-violet-500 border-violet-500 text-white"
                    : "border-dashed border-violet-300 dark:border-violet-700 text-violet-500 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                }`}>
                + custom drug
              </button>
              {QUICK_DRUGS.map(cat => (
                <div key={cat.cat}>
                  <p className="text-[8px] font-semibold text-slate-400 dark:text-[#555] uppercase tracking-wide mb-1">{cat.cat}</p>
                  <div className="flex flex-wrap gap-1">
                    {cat.drugs.map(drug => (
                      <div key={drug.name} draggable
                        onDragStart={e => onItemDragStart(e, drug.name, drug.unit, "drug")}
                        onClick={e => openFP(selectedCol, drug.name, drug.unit, e.currentTarget)}
                        className={`text-xs font-medium px-2.5 py-1.5 rounded border cursor-pointer select-none hover:opacity-80 transition-opacity ${cat.color} ${fp?.name === drug.name && fp?.mode !== "fluid" ? "ring-2 ring-blue-400" : ""}`}>
                        {drug.name}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {customDrugs.length > 0 && (
                <div>
                  <p className="text-[8px] font-semibold text-violet-400 dark:text-violet-500 uppercase tracking-wide mb-1">Custom drugs</p>
                  <div className="flex flex-wrap gap-1">
                    {customDrugs.map(drug => (
                      <div key={drug.name} draggable
                        onDragStart={e => onItemDragStart(e, drug.name, drug.unit, "drug")}
                        onClick={e => openFP(selectedCol, drug.name, drug.unit, e.currentTarget)}
                        className={`group relative text-xs font-medium px-2.5 py-1.5 rounded border cursor-pointer select-none hover:opacity-80 transition-opacity bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-300 border-violet-200 dark:border-violet-700 ${fp?.name === drug.name && fp?.mode !== "fluid" ? "ring-2 ring-violet-400" : ""}`}>
                        {drug.name}
                        <button type="button"
                          onClick={e => { e.stopPropagation(); setCustomDrugs(prev => prev.filter(d => d.name !== drug.name)) }}
                          className="absolute -top-1 -right-1 hidden group-hover:flex items-center justify-center w-3.5 h-3.5 rounded-full bg-slate-400 hover:bg-red-500 text-white transition-colors">
                          <X className="h-2 w-2" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="border-t border-slate-200 dark:border-[#2e2e2e] pt-2 space-y-1.5">
              <p className="text-[9px] font-bold text-slate-400 dark:text-[#666] uppercase tracking-widest">Fluids</p>
              {QUICK_FLUIDS.map(cat => (
                <div key={cat.cat}>
                  <p className="text-[8px] font-semibold text-slate-400 dark:text-[#555] uppercase tracking-wide mb-1">{cat.cat}</p>
                  <div className="flex flex-wrap gap-1">
                    {cat.fluids.map(fluid => (
                      <div key={fluid.name} draggable
                        onDragStart={e => onItemDragStart(e, fluid.name, "ml", "fluid")}
                        onClick={e => {
                          const r = e.currentTarget.getBoundingClientRect()
                          setFp({ col:selectedCol, name:fluid.name, unit:"ml", mode:"fluid",
                            dose:"", doseHint:"", fluidScale:"L",
                            rate:0, rateUnit:"ml", rateUnits:["ml"], rateMin:0, rateMax:2000, rateStep:50,
                            color:"#06b6d4",
                            anchor:{ top:r.top, bottom:r.bottom, left:r.left, right:r.right, width:r.width },
                          })
                        }}
                        className={`text-xs font-medium px-2.5 py-1.5 rounded border cursor-pointer select-none hover:opacity-80 transition-opacity ${cat.color} ${fp?.name===fluid.name && fp?.mode==="fluid" ? "ring-2 ring-cyan-400" : ""}`}>
                        {fluid.name}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
    {/* ── Custom drug portal ─────────────────────────────────────────────────── */}
    {customDrugOpen && customDrugRect && typeof document !== "undefined" && createPortal(
      (() => {
        const POP_W = 230
        const spaceBelow = window.innerHeight - customDrugRect.bottom
        const showAbove  = spaceBelow < 300
        const left = Math.max(8, Math.min(customDrugRect.right - POP_W, window.innerWidth - POP_W - 8))
        const top  = showAbove ? customDrugRect.top - 4 : customDrugRect.bottom + 4
        const UNIT_PRESETS = ["mcg","mg","g","mL","L","IU","U","mmol","mEq","mEq/L","ng","%"]
        const canSubmit = customDrugName.trim().length > 0
        function submit() {
          if (!canSubmit) return
          const name = customDrugName.trim()
          const unit = customDrugUnit.trim() || "mg"
          const dose = customDrugDose.trim()
          // Add to custom drugs list
          setCustomDrugs(prev => prev.some(d => d.name === name) ? prev : [...prev, { name, unit }])
          // Drop directly into grid
          const oc = onChangeRef.current
          const d  = dataRef.current
          oc({ ...d, drugs: [...d.drugs, { colIdx: selectedCol, name, dose, unit }] })
          setCustomDrugOpen(false)
          setCustomDrugName(""); setCustomDrugDose("")
        }
        return (
          <>
            <div className="fixed inset-0 z-[9996]" onClick={() => setCustomDrugOpen(false)} />
            <div
              style={{ position:"fixed", left, top, width: POP_W, zIndex: 9997, transform: showAbove ? "translateY(-100%)" : undefined }}
              className="bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-2xl p-3 space-y-2.5"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Custom drug</span>
                <button type="button" onClick={() => setCustomDrugOpen(false)} className="text-slate-300 hover:text-red-400 transition-colors"><X className="h-3.5 w-3.5" /></button>
              </div>

              {/* Drug name */}
              <input autoFocus type="text" placeholder="Drug name…"
                value={customDrugName}
                onChange={e => setCustomDrugName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") setCustomDrugOpen(false) }}
                className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] text-slate-800 dark:text-slate-200 placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-400"
              />

              {/* Unit pills */}
              <div className="space-y-1.5">
                <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">Unit</p>
                <div className="flex flex-wrap gap-1">
                  {UNIT_PRESETS.map(u => (
                    <button key={u} type="button"
                      onClick={() => setCustomDrugUnit(u)}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border transition-colors ${
                        customDrugUnit === u
                          ? "bg-violet-500 border-violet-500 text-white"
                          : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-violet-400 hover:text-violet-500"
                      }`}>
                      {u}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dose amount */}
              {(() => {
                const DOSE_RANGE: Record<string, {min:number;max:number;step:number}> = {
                  "mcg":    {min:0, max:1000, step:1},
                  "mg":     {min:0, max:500,  step:1},
                  "g":      {min:0, max:20,   step:0.1},
                  "mL":     {min:0, max:250,  step:1},
                  "L":      {min:0, max:5,    step:0.1},
                  "IU":     {min:0, max:1000, step:1},
                  "U":      {min:0, max:100,  step:1},
                  "mmol":   {min:0, max:200,  step:1},
                  "mEq":    {min:0, max:200,  step:1},
                  "mEq/L":  {min:0, max:150,  step:1},
                  "ng":     {min:0, max:1000, step:1},
                  "%":      {min:0, max:100,  step:0.5},
                }
                const range = DOSE_RANGE[customDrugUnit] ?? {min:0, max:500, step:1}
                const numVal = parseFloat(customDrugDose) || 0
                return (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <input type="number" min={range.min} max={range.max} step={range.step} placeholder="Amount"
                        value={customDrugDose}
                        onChange={e => setCustomDrugDose(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") submit() }}
                        className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] text-slate-800 dark:text-slate-200 placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-400"
                      />
                      <span className="text-xs font-semibold text-violet-500 dark:text-violet-400 shrink-0 min-w-[32px] text-right">{customDrugUnit}</span>
                    </div>
                    <input type="range" min={range.min} max={range.max} step={range.step}
                      value={numVal}
                      onChange={e => setCustomDrugDose(e.target.value)}
                      className="w-full h-1.5 accent-violet-500"
                    />
                    <div className="flex justify-between text-[9px] text-slate-400">
                      <span>{range.min}</span><span>{range.max} {customDrugUnit}</span>
                    </div>
                  </div>
                )
              })()}

              <button type="button" onClick={submit} disabled={!canSubmit}
                className="w-full text-xs font-semibold bg-slate-700 hover:bg-slate-600 dark:bg-[#2a2a2a] dark:hover:bg-[#383838] dark:border dark:border-[#4a4a4a] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg py-1.5 transition-colors">
                Start
              </button>
            </div>
          </>
        )
      })(),
      document.body
    )}
    {/* ── Fluid conflict portal ──────────────────────────────────────────────── */}
    {fluidConflict && typeof document !== "undefined" && createPortal(
      (() => {
        const POP_W = 230
        const a = fluidConflict.anchor
        const spaceBelow = window.innerHeight - a.bottom
        const showAbove  = spaceBelow < 240
        const left = Math.max(8, Math.min(a.left, window.innerWidth - POP_W - 8))
        const top  = showAbove ? a.top - 4 : a.bottom + 4

        function doParallel() {
          addFluidDirect(fluidConflict!.newName, fluidConflict!.newCat, fluidConflict!.newVol, fluidConflict!.newCol)
          setFluidConflict(null)
        }
        function doStop() {
          setFluidConflict(fc => fc ? { ...fc, phase: "finished" } as FluidConflict : null)
        }
        function doFinished(finished: boolean) {
          if (!fluidConflict) return
          const d = dataRef.current
          const oc = onChangeRef.current
          const col = fluidConflict.newCol
          const eid = fluidConflict.existingId
          if (finished) {
            // Keep existing volume, trim endCol if it overlaps
            oc({ ...d, fluids: (d.fluids ?? []).map(f => f.id === eid && f.endCol >= col ? { ...f, endCol: col - 1 } : f) })
            addFluidDirect(fluidConflict.newName, fluidConflict.newCat, fluidConflict.newVol, col)
            setFluidConflict(null)
          } else {
            setFluidConflict(fc => fc ? { ...fc, phase: "volume", volInput: "" } as FluidConflict : null)
          }
        }
        function doConfirmVolume() {
          if (!fluidConflict || fluidConflict.phase !== "volume") return
          const d = dataRef.current
          const oc = onChangeRef.current
          const col = fluidConflict.newCol
          const eid = fluidConflict.existingId
          oc({ ...d, fluids: (d.fluids ?? []).map(f => f.id === eid ? { ...f, endCol: Math.min(f.endCol, col - 1), volume: fluidConflict.volInput } : f) })
          addFluidDirect(fluidConflict.newName, fluidConflict.newCat, fluidConflict.newVol, col)
          setFluidConflict(null)
        }

        return (
          <>
            <div className="fixed inset-0 z-[9994]" onClick={() => setFluidConflict(null)} />
            <div
              style={{ position: "fixed", left, top, width: POP_W, zIndex: 9995, transform: showAbove ? "translateY(-100%)" : undefined }}
              className="bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-2xl p-3 space-y-2.5"
              onClick={e => e.stopPropagation()}>

              {fluidConflict.phase === "choose" && (
                <>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">{fluidConflict.newCat} conflict</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-semibold" style={{ color: fluidConflict.newColor }}>{fluidConflict.existingName}</span> is already running.
                  </p>
                  <div className="space-y-1">
                    <button type="button" onClick={doStop}
                      className="w-full text-xs font-semibold bg-slate-700 hover:bg-slate-600 dark:bg-[#2a2a2a] dark:hover:bg-[#383838] dark:border dark:border-[#4a4a4a] text-white rounded-lg py-1.5">
                      Stop {fluidConflict.existingName}
                    </button>
                    <button type="button" onClick={doParallel}
                      className="w-full text-xs font-semibold border border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] rounded-lg py-1.5">
                      Run in parallel
                    </button>
                  </div>
                </>
              )}

              {fluidConflict.phase === "finished" && (
                <>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Was it finished?</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Did the full volume of {fluidConflict.newCat.toLowerCase()} get infused?</p>
                  <div className="space-y-1">
                    <button type="button" onClick={() => doFinished(true)}
                      className="w-full text-xs font-semibold bg-slate-700 hover:bg-slate-600 dark:bg-[#2a2a2a] dark:hover:bg-[#383838] dark:border dark:border-[#4a4a4a] text-white rounded-lg py-1.5">
                      Yes, fully infused
                    </button>
                    <button type="button" onClick={() => doFinished(false)}
                      className="w-full text-xs font-semibold border border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] rounded-lg py-1.5">
                      No, stopped early
                    </button>
                  </div>
                </>
              )}

              {fluidConflict.phase === "volume" && (
                <>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">How much was infused?</p>
                  <div className="flex items-center gap-2">
                    <input autoFocus type="number" min={0} placeholder="0"
                      value={fluidConflict.volInput}
                      onChange={e => setFluidConflict(fc => fc && fc.phase === "volume" ? { ...fc, volInput: e.target.value } : fc)}
                      onKeyDown={e => { if (e.key === "Enter") doConfirmVolume() }}
                      className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                    />
                    <span className="text-xs font-semibold text-slate-400">ml</span>
                  </div>
                  <button type="button" onClick={doConfirmVolume}
                    className="w-full text-xs font-semibold bg-slate-700 hover:bg-slate-600 dark:bg-[#2a2a2a] dark:hover:bg-[#383838] dark:border dark:border-[#4a4a4a] text-white rounded-lg py-1.5">
                    Confirm
                  </button>
                </>
              )}
            </div>
          </>
        )
      })(),
      document.body
    )}
    {/* ── Agent picker portal ────────────────────────────────────────────────── */}
    {agentPicker !== null && agentPickerRect && typeof document !== "undefined" && createPortal(
      (() => {
        const pickerSeg = agents.find(a => a.startCol === agentPicker) ?? null
        const POP_W = 190
        const spaceBelow = window.innerHeight - agentPickerRect.bottom
        const showAbove = spaceBelow < 240
        const left = Math.max(8, Math.min(agentPickerRect.left, window.innerWidth - POP_W - 8))
        const top  = showAbove ? agentPickerRect.top - 4 : agentPickerRect.bottom + 4
        return (
          <>
            <div className="fixed inset-0 z-[9998]" onClick={closeAgentPicker} />
            <div
              style={{ position:"fixed", left, top, width: POP_W, zIndex: 9999, transform: showAbove ? "translateY(-100%)" : undefined }}
              className="bg-white dark:bg-[#2a2a2a] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-2xl p-3 space-y-2"
              onClick={e => e.stopPropagation()}>

              {!pickerSeg && <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">Start agent here</p>}
              {pickerSeg  && <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">Edit: {pickerSeg.name}</p>}

              {!pickerSeg && (
                <div className="space-y-0.5">
                  {INH_AGENTS.map(agent => (
                    <button key={agent} type="button"
                      onClick={() => startAgent(agentPicker, agent)}
                      className={`w-full text-left text-xs font-semibold px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#333] transition-colors ${AGENT_STYLE[agent]?.text ?? ""}`}>
                      {agent}
                    </button>
                  ))}
                </div>
              )}

              <div className="border-t border-slate-100 dark:border-[#333] pt-2 space-y-2">
                <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">Optional</p>
                <button type="button"
                  onClick={() => setPickerN2o(pickerN2o !== null ? null : 40)}
                  className={`w-full text-xs font-semibold px-2 py-1 rounded-lg border transition-colors ${
                    pickerN2o !== null
                      ? "bg-yellow-400 border-yellow-400 text-white"
                      : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-yellow-400 hover:text-yellow-600"
                  }`}>
                  + N₂O
                </button>
                {pickerN2o !== null && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-slate-500 font-semibold">FiN₂O</span>
                      <span className="text-xs font-bold text-yellow-600 dark:text-yellow-400">{pickerN2o}%</span>
                    </div>
                    <input type="range" min={10} max={70} step={5}
                      value={pickerN2o}
                      onChange={e => setPickerN2o(parseInt(e.target.value))}
                      className="w-full h-1.5 accent-yellow-500" />
                  </div>
                )}
              </div>

              {pickerSeg && (
                <button type="button"
                  onClick={() => updateAgentExtras(pickerSeg.startCol)}
                  className="w-full text-xs font-semibold bg-blue-500 hover:bg-blue-600 text-white rounded-lg py-1.5 transition-colors">
                  Apply
                </button>
              )}
            </div>
          </>
        )
      })(),
      document.body
    )}
    {/* ── Floating prompt portal ─────────────────────────────────────────────── */}
    {fp && typeof document !== "undefined" && createPortal(
      <>
        {/* Backdrop to close */}
        <div className="fixed inset-0 z-[9998]" onClick={() => setFp(null)} />
        {/* Popup */}
        {(() => {
          const POP_W = 220
          const spaceBelow = window.innerHeight - fp.anchor.bottom
          const showAbove  = spaceBelow < 260
          const left = Math.max(8, Math.min(fp.anchor.left + fp.anchor.width / 2 - POP_W / 2, window.innerWidth - POP_W - 8))
          const top  = showAbove ? fp.anchor.top - 4 : fp.anchor.bottom + 6
          const br   = bolusRange(fp.name, fp.unit)
          const nd   = parseFloat(fp.dose) || 0
          return (
            <div
              style={{ position:"fixed", left, top, width:POP_W, zIndex:9999, transform: showAbove ? "translateY(-100%)" : undefined }}
              className="bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-2xl p-3 space-y-2"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{fp.name}</span>
                <button type="button" onClick={() => setFp(null)} className="text-slate-300 hover:text-red-400 shrink-0 transition-colors"><X className="h-3.5 w-3.5" /></button>
              </div>
              <p className="text-[9px] text-slate-400 dark:text-slate-500">
                at <span className="font-semibold text-blue-500 dark:text-blue-400">{times[fp.col]}</span>
              </p>

              {fp.mode === "choose" && (
                <div className="flex gap-1.5">
                  <button type="button"
                    onClick={() => setFp(f => f ? {...f, mode:"bolus"} : f)}
                    className="flex-1 text-xs font-semibold bg-violet-500 hover:bg-violet-600 text-white rounded-lg py-1.5">Bolus</button>
                  <button type="button"
                    onClick={() => setFp(f => f ? {...f, mode:"infusion"} : f)}
                    className="flex-1 text-xs font-semibold bg-blue-500 hover:bg-blue-600 text-white rounded-lg py-1.5">Infusion</button>
                </div>
              )}

              {fp.mode === "fluid" && (
                <>
                  <div className="flex gap-1.5">
                    {(["S","L"] as const).map(s => (
                      <button key={s} type="button"
                        onClick={() => setFp(f => f ? {...f, fluidScale:s, dose:""} : f)}
                        className={`flex-1 text-xs font-semibold rounded-lg py-1.5 border transition-colors ${
                          fp.fluidScale===s ? "bg-cyan-500 border-cyan-500 text-white" : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400"
                        }`}>
                        {s==="S" ? "Small ≤100 ml" : "Large ≤2000 ml"}
                      </button>
                    ))}
                  </div>
                  <input type="range"
                    min={0} max={fp.fluidScale==="S" ? 100 : 2000} step={fp.fluidScale==="S" ? 10 : 50}
                    value={parseInt(fp.dose)||0}
                    onChange={e => setFp(f => f ? {...f, dose:e.target.value} : f)}
                    className="w-full h-1.5 accent-cyan-500" />
                  <div className="flex items-center gap-1.5">
                    <input autoFocus type="number" placeholder="0" value={fp.dose}
                      onChange={e => setFp(f => f ? {...f, dose:e.target.value} : f)}
                      onKeyDown={e => e.key==="Enter" && fpCommitFluid()}
                      className="w-20 text-xs bg-white dark:bg-[#2a2a2a] border border-slate-200 dark:border-[#3a3a3a] rounded-lg px-2 py-1 outline-none focus:border-cyan-400 [appearance:textfield]" />
                    <span className="text-xs text-slate-400 dark:text-slate-500">ml</span>
                  </div>
                  <button type="button" onClick={fpCommitFluid}
                    className="w-full text-xs font-semibold bg-slate-700 hover:bg-slate-600 dark:bg-[#2a2a2a] dark:hover:bg-[#383838] dark:border dark:border-[#4a4a4a] text-white rounded-lg py-1.5">Add fluid</button>
                </>
              )}

              {fp.mode === "bolus" && (
                <>
                  {fp.doseHint && (
                    <p className="text-[9px] text-violet-500 dark:text-violet-400 font-medium">{fp.doseHint}</p>
                  )}
                  <input type="range" min={br.min} max={br.max} step={br.step}
                    value={nd}
                    onChange={e => setFp(f => f ? {...f, dose:e.target.value} : f)}
                    className="w-full h-1.5 accent-violet-500" />
                  <div className="flex gap-1.5">
                    <input autoFocus type="number" placeholder="Dose" value={fp.dose}
                      onChange={e => setFp(f => f ? {...f, dose:e.target.value} : f)}
                      onKeyDown={e => e.key==="Enter" && fpCommitBolus()}
                      className="w-16 text-xs bg-white dark:bg-[#2a2a2a] border border-slate-200 dark:border-[#3a3a3a] rounded-lg px-2 py-1 outline-none focus:border-violet-400 [appearance:textfield]" />
                    <select value={fp.unit} onChange={e => setFp(f => f ? {...f, unit:e.target.value} : f)}
                      className="flex-1 text-[10px] bg-white dark:bg-[#2a2a2a] border border-slate-200 dark:border-[#3a3a3a] rounded-lg px-1 py-1 outline-none">
                      {["mg","mcg","μg","ml","g","IU"].map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                  <button type="button" onClick={fpCommitBolus}
                    className="w-full text-xs font-semibold bg-slate-700 hover:bg-slate-600 dark:bg-[#2a2a2a] dark:hover:bg-[#383838] dark:border dark:border-[#4a4a4a] text-white rounded-lg py-1.5">Administer</button>
                </>
              )}

              {fp.mode === "infusion" && (
                <>
                  <div className="flex flex-wrap gap-1">
                    {fp.rateUnits.map(u => (
                      <button key={u} type="button" onClick={() => setFp(f => f ? {...f, rateUnit:u} : f)}
                        className={`text-[9px] px-1.5 py-0.5 rounded-md border transition-colors ${fp.rateUnit===u ? "bg-blue-500 border-blue-500 text-white" : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400"}`}>
                        {u}
                      </button>
                    ))}
                  </div>
                  <input type="range" min={fp.rateMin} max={fp.rateMax} step={fp.rateStep}
                    value={fp.rate}
                    onChange={e => setFp(f => f ? {...f, rate:parseFloat(e.target.value)} : f)}
                    className="w-full h-1.5 accent-blue-500" />
                  <div className="flex items-center gap-1.5">
                    <input type="number" min={fp.rateMin} max={fp.rateMax} step={fp.rateStep}
                      value={fp.rate}
                      onChange={e => setFp(f => f ? {...f, rate:parseFloat(e.target.value)||f.rateMin} : f)}
                      className="w-16 text-xs bg-white dark:bg-[#2a2a2a] border border-slate-200 dark:border-[#3a3a3a] rounded-lg px-2 py-1 outline-none focus:border-blue-400 [appearance:textfield]" />
                    <span className="text-[9px] text-slate-400 dark:text-slate-500 leading-tight">{fp.rateUnit}</span>
                  </div>
                  <button type="button" onClick={fpCommitInfusion}
                    className="w-full text-xs font-semibold bg-slate-700 hover:bg-slate-600 dark:bg-[#2a2a2a] dark:hover:bg-[#383838] dark:border dark:border-[#4a4a4a] text-white rounded-lg py-1.5">Start Infusion</button>
                </>
              )}
            </div>
          )
        })()}
      </>,
      document.body
    )}
    </>
  )
}
