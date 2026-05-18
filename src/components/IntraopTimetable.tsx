"use client"

import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { Plus, X, ChevronDown, ChevronRight } from "lucide-react"
import { NumberStepper } from "@/components/NumberStepper"

// в"Ђв"Ђ Constants в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
const COL_W     = 74
const LABEL_W   = 96
const CHART_H   = 220
const Y_MAX     = 220
const GRID_VALS = [40, 80, 120, 160, 200]
const INTERVAL  = 5
const ROW_COLS  = 12  // columns per row = 60 min per row (1 hour)

const INH_AGENTS = ["Sevoflurane", "Desflurane", "Isoflurane"]

const AGENT_STYLE: Record<string, { bar: string; text: string; grip: string }> = {
  "Sevoflurane": { bar: "bg-purple-300/40 dark:bg-purple-500/25 border-purple-400 dark:border-purple-500", text: "text-purple-700 dark:text-purple-200", grip: "bg-purple-400 dark:bg-purple-500" },
  "Desflurane":  { bar: "bg-blue-300/40   dark:bg-blue-500/25   border-blue-400   dark:border-blue-500",   text: "text-blue-700   dark:text-blue-200",   grip: "bg-blue-400   dark:bg-blue-500"   },
  "Isoflurane":  { bar: "bg-green-300/40  dark:bg-green-500/25  border-green-400  dark:border-green-500",  text: "text-green-700  dark:text-green-200",  grip: "bg-green-400  dark:bg-green-500"  },
}

// в"Ђв"Ђ Quick-drug & fluid libraries в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
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
  { cat: "Other",         color: "bg-slate-100  dark:bg-slate-800/60  text-slate-700  dark:text-slate-300  border-slate-200  dark:border-slate-600",  fluids: [{name:"Mannitol 20%"},{name:"NaHCO3 8.4%"},{name:"Gelatin 4%"},{name:"Dextran 40"}] },
]

// в"Ђв"Ђ Infusion configs в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
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
  "Lidocaine":       { units:["ml/hr"],                            min:1,    max:20,   step:1,    color:"#0891b2" },
  "Ropivacaine":     { units:["ml/hr"],                            min:1,    max:20,   step:1,    color:"#0e7490" },
  "Bupivacaine":     { units:["ml/hr"],                            min:1,    max:15,   step:1,    color:"#164e63" },
  "Levobupivacaine": { units:["ml/hr"],                            min:1,    max:15,   step:1,    color:"#155e75" },
  "Prilocaine":      { units:["ml/hr"],                            min:1,    max:20,   step:1,    color:"#0c4a6e" },
  "Mepivacaine":     { units:["ml/hr"],                            min:1,    max:20,   step:1,    color:"#0369a1" },
  "Magnesium":       { units:["g/hr"],                            min:0.5,  max:3,    step:0.5,  color:"#0d9488" },
  "Oxytocin":        { units:["mIU/min","units/hr"],              min:1,    max:40,   step:1,    color:"#ec4899" },
  "Insulin":         { units:["units/hr"],                        min:1,    max:20,   step:1,    color:"#06b6d4" },
  "Heparin":         { units:["units/hr"],                        min:500,  max:2000, step:100,  color:"#64748b" },
  "Nitroglycerin":   { units:["mcg/min","mcg/kg/min"],            min:5,    max:200,  step:5,    color:"#84cc16" },
  "Labetalol":       { units:["mg/hr"],                           min:10,   max:120,  step:10,   color:"#059669" },
}
const DEFAULT_INF = { units:["mg/hr","mcg/kg/min","ml/hr"], min:0, max:100, step:1, color:"#64748b" }

// Common solution concentrations for local anaesthetics (shown as pill selector)
const LA_CONCENTRATIONS: Record<string, string[]> = {
  "Lidocaine":       ["0.5%","1%","1.5%","2%"],
  "Ropivacaine":     ["0.1%","0.2%","0.375%","0.5%","0.75%"],
  "Bupivacaine":     ["0.125%","0.25%","0.375%","0.5%"],
  "Levobupivacaine": ["0.125%","0.25%","0.5%","0.75%"],
  "Prilocaine":      ["0.5%","1%","2%"],
  "Mepivacaine":     ["0.5%","1%","1.5%","2%"],
  "Articaine":       ["2%","4%"],
}

// Median bolus dose suggestions - mgPerKg is in the same unit as QUICK_DRUGS
// weightBasis: IBW (default) or TBW (succinylcholine, some others)
// flat: a fixed dose in the drug's unit, not weight-based
const BOLUS_DOSES: Record<string, { mgPerKg?: number; flat?: number; basis?: "IBW" | "TBW"; hint: string }> = {
  "Propofol":        { mgPerKg: 2.0,   basis:"IBW", hint:"2.0 mg/kg IBW (1.5-2.5)"         },
  "Thiopental":      { mgPerKg: 4.0,   basis:"IBW", hint:"4 mg/kg IBW (3-5)"                },
  "Ketamine":        { mgPerKg: 1.5,   basis:"IBW", hint:"1.5 mg/kg IBW (1-2)"              },
  "Etomidate":       { mgPerKg: 0.3,   basis:"IBW", hint:"0.3 mg/kg IBW (0.2-0.4)"          },
  "Midazolam":       { mgPerKg: 0.05,  basis:"IBW", hint:"0.05 mg/kg IBW (0.02-0.1)"        },
  "Fentanyl":        { mgPerKg: 2.0,   basis:"IBW", hint:"2 mcg/kg IBW (1-3)"               },
  "Morphine":        { mgPerKg: 0.1,   basis:"IBW", hint:"0.1 mg/kg IBW"                    },
  "Remifentanil":    { mgPerKg: 0.5,   basis:"IBW", hint:"0.5 mcg/kg IBW"                   },
  "Sufentanil":      { mgPerKg: 0.3,   basis:"IBW", hint:"0.3 mcg/kg IBW (0.2-0.5)"         },
  "Alfentanil":      { mgPerKg: 15,    basis:"IBW", hint:"15 mcg/kg IBW (10-20)"             },
  "Succinylcholine": { mgPerKg: 1.5,   basis:"TBW", hint:"1.5 mg/kg TBW (RSI)"              },
  "Rocuronium":      { mgPerKg: 0.6,   basis:"IBW", hint:"0.6 mg/kg IBW (RSI: 1.2)"         },
  "Vecuronium":      { mgPerKg: 0.1,   basis:"IBW", hint:"0.1 mg/kg IBW"                    },
  "Atracurium":      { mgPerKg: 0.5,   basis:"IBW", hint:"0.5 mg/kg IBW"                    },
  "Cisatracurium":   { mgPerKg: 0.15,  basis:"IBW", hint:"0.15 mg/kg IBW"                   },
  "Sugammadex":      { mgPerKg: 4.0,   basis:"IBW", hint:"4 mg/kg IBW (deep block)"          },
  "Neostigmine":     { mgPerKg: 0.05,  basis:"IBW", hint:"0.05 mg/kg IBW"                   },
  "Atropine":        { flat: 0.6,               hint:"0.6 mg (standard)"                    },
  "Galantamine":     { mgPerKg: 0.3,   basis:"IBW", hint:"0.3 mg/kg IBW"                    },
  "Ephedrine":       { flat: 10,                hint:"10 mg (titrate)"                       },
  "Phenylephrine":   { flat: 100,               hint:"100 mcg bolus"                         },
  "Epinephrine":     { flat: 0.1,               hint:"0.1 mg (1:10000)"                      },
  "Norepinephrine":  { flat: 0.1,               hint:"0.1 mg"                                },
  "Vasopressin":     { flat: 20,                hint:"20 IU"                                 },
  "Ondansetron":     { flat: 4,                 hint:"4 mg (standard)"                       },
  "Dexamethasone":   { flat: 8,                 hint:"8 mg (PONV)"                           },
  "Metoclopramide":  { flat: 10,                hint:"10 mg (standard)"                      },
  "Droperidol":      { flat: 1.25,              hint:"1.25 mg (standard)"                    },
  "Paracetamol":     { flat: 1,                 hint:"1 g IV"                                },
  "Ketorolac":       { flat: 30,                hint:"30 mg (max)"                           },
  "Ketoprofen":      { flat: 100,               hint:"100 mg"                                },
  "Lidocaine":       { mgPerKg: 1.5,   basis:"IBW", hint:"1.5 mg/kg IBW"                    },
  "Magnesium":       { flat: 2000,              hint:"2000 mg (2g)"                          },
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

// в"Ђв"Ђ Types в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
export interface VitalsEntry    { systolic?: number; diastolic?: number; heartRate?: number; spO2?: number; etco2?: number; temp?: number; bgl?: number }
export interface TimetableDrug  { colIdx: number; name: string; dose: string; unit: string }
export interface TimetableFluid { id: string; name: string; category?: string; volume: string; color: string; startCol: number; endCol: number; stopped?: boolean }
export interface AgentSegment   { name: string; startCol: number; endCol: number; n2o?: number; stopped?: boolean }
export interface TimetableInfusion { id: string; name: string; rate: number; unit: string; startCol: number; endCol: number; color: string; stopped?: boolean; rateChanges?: { col: number; rate: number; unit: string }[] }
export interface TimetableData  { vitals: VitalsEntry[]; drugs: TimetableDrug[]; fluids: TimetableFluid[]; agents: AgentSegment[]; infusions: TimetableInfusion[] }

interface Props { startTime: string; endTime?: string; caseStarted?: boolean; monitoring?: Record<string, boolean>; ibw?: number | null; tbw?: number | null; showAgentRow?: boolean; data: TimetableData; onChange: (d: TimetableData) => void; onEndCase?: () => void; onResumeCase?: () => void; onPostopContinued?: (items: string[]) => void; onInfusionTotals?: (totals: { name: string; total: number; unit: string }[]) => void; onFluidTotals?: (crystalloids: number, colloids: number, blood: number) => void }

// в"Ђв"Ђ Helpers в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
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

function toHHMM(t: string): string {
  // Accept "HH:MM", ISO timestamps, or Date strings -- always return "HH:MM"
  if (/^\d{2}:\d{2}$/.test(t)) return t
  try {
    const d = new Date(t)
    if (!isNaN(d.getTime())) return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`
  } catch {}
  return t
}
function calcDuration(start: string, end: string | undefined, cols: number): string {
  if (end) {
    const s = toHHMM(start), e = toHHMM(end)
    const [sh, sm] = s.split(":").map(Number)
    const [eh, em] = e.split(":").map(Number)
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
  step:     number
  defaultVal: number
  monitors: string[]
}[] = [
  { key:"systolic",  label:"BP Sys",  unit:"mmHg",  color:"#ef4444", min:0,  max:300, step:1,   defaultVal:120, monitors:["nbpMonitor","invasiveBP"] },
  { key:"diastolic", label:"BP Dia",  unit:"mmHg",  color:"#ef4444", min:0,  max:200, step:1,   defaultVal:80,  monitors:["nbpMonitor","invasiveBP"] },
  { key:"heartRate", label:"HR",      unit:"bpm",   color:"#22c55e", min:0,  max:300, step:1,   defaultVal:70,  monitors:["ecg","spO2Monitor"]       },
  { key:"spO2",      label:"SpO₂",   unit:"%",     color:"#06b6d4", min:50, max:100, step:1,   defaultVal:98,  monitors:["spO2Monitor"]             },
  { key:"etco2",     label:"EtCO₂",  unit:"mmHg",  color:"#f59e0b", min:0,  max:80,  step:1,   defaultVal:35,  monitors:["etco2Monitor"]            },
  { key:"temp",      label:"Temp",    unit:"°C",    color:"#a78bfa", min:30, max:42,  step:0.1, defaultVal:36.5,monitors:["tempMonitor"]             },
  { key:"bgl",       label:"BGL",     unit:"mmol/L",color:"#34d399", min:0,  max:30,  step:0.1, defaultVal:5.5, monitors:["bglMonitor"]              },
]

// в"Ђв"Ђ Div-based chart в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
function DivChart({ vitals, colStart, rowColCount, activeRows }: { vitals: VitalsEntry[]; colStart: number; rowColCount: number; activeRows: typeof VITAL_ROW_DEFS }) {
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
  const colW   = chartW > 0 ? chartW / rowColCount : COL_W

  function dotX(localIdx: number) { return (localIdx + 0.5) * colW }
  function dotY(v: number)   { return CHART_H * (1 - v / Y_MAX) }

  function series(
    key: keyof VitalsEntry, color: string,
    opacity = 1, dashed = false,
  ) {
    const pts = vitals.slice(colStart, colStart + rowColCount).flatMap((row, localIdx) =>
      row[key] != null ? [{ localIdx, x: dotX(localIdx), y: dotY(row[key]!), val: row[key]! }] : []
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
          <div key={`d${p.localIdx}`}
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
      {w > 0 && Array.from({ length: rowColCount }, (_, i) => (
        <div key={i} className="absolute top-0 bottom-0 border-l border-slate-50 dark:border-[#222] pointer-events-none"
             style={{ left: LABEL_W + i * colW }} />
      ))}

      {/* BP pulse-pressure fill - trapezoids between consecutive sys/dia pairs */}
      {w > 0 && vitals.slice(colStart, colStart + rowColCount - 1).map((row, localIdx) => {
        const next = vitals[colStart + localIdx + 1]
        if (row.systolic == null || row.diastolic == null ||
            next?.systolic == null || next?.diastolic == null) return null
        const x1 = dotX(localIdx), x2 = dotX(localIdx + 1)
        const sy1 = dotY(row.systolic),  dy1 = dotY(row.diastolic)
        const sy2 = dotY(next.systolic), dy2 = dotY(next.diastolic)
        const top    = Math.min(sy1, sy2)
        const bottom = Math.max(dy1, dy2)
        const h      = bottom - top
        if (h <= 0) return null
        const pct = (v: number) => `${((v - top) / h * 100).toFixed(1)}%`
        return (
          <div key={localIdx} className="absolute pointer-events-none"
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

// в"Ђв"Ђ Fluid color by category в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
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

// в"Ђв"Ђ Module-level types в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
type TtSel = { type: "drug"; idx: number } | { type: "infusion"; id: string } | { type: "fluid"; id: string } | { type: "agent"; startCol: number }
type TtFPMode = "choose" | "bolus" | "infusion" | "fluid"

// ── End Case Modal ────────────────────────────────────────────────────────────
type EndCaseDecision = "discontinue" | "continue" | null

interface EndCaseModalProps {
  agents: AgentSegment[]
  infusions: TimetableInfusion[]
  fluids: TimetableFluid[]
  onDismiss: () => void
  onConfirm: (result: {
    continuedItems: string[]
    infusionTotals: { name: string; total: number; unit: string }[]
    discontinuedAgentCols: number[]
    discontinuedInfusionIds: string[]
    discontinuedFluidWithAmounts: { id: string; amount: number; category: string }[]
  }) => void
}

export function calcInfusionTotal(seg: TimetableInfusion): { amount: number; unit: string } {
  const sorted = (seg.rateChanges ?? []).slice().sort((a, b) => a.col - b.col)
  let total = 0; let prevCol = seg.startCol; let prevRate = seg.rate; let prevUnit = seg.unit
  for (const rc of sorted) {
    total += prevUnit.includes("/min") ? prevRate * (rc.col - prevCol) * 5 : prevRate * (rc.col - prevCol) * 5 / 60
    prevCol = rc.col; prevRate = rc.rate; prevUnit = rc.unit
  }
  total += prevUnit.includes("/min") ? prevRate * (seg.endCol - prevCol + 1) * 5 : prevRate * (seg.endCol - prevCol + 1) * 5 / 60
  const baseUnit = prevUnit.replace(/\/kg\/min$/, "").replace(/\/min$/, "").replace(/\/hr$/, "").trim()
  return { amount: Math.round(total * 100) / 100, unit: baseUnit }
}

function EndCaseModal({ agents, infusions, fluids, onDismiss, onConfirm }: EndCaseModalProps) {
  const [decisions, setDecisions] = useState<Record<string, EndCaseDecision>>({})
  const [fluidAmounts, setFluidAmounts] = useState<Record<string, string>>({})
  const [fluidFullBag, setFluidFullBag] = useState<Record<string, boolean | null>>({})

  function setDecision(key: string, val: EndCaseDecision) {
    setDecisions(prev => ({ ...prev, [key]: prev[key] === val ? null : val }))
  }

  function handleConfirm() {
    const continuedItems: string[] = []
    const infusionTotals: { name: string; total: number; unit: string }[] = []
    const discontinuedAgentCols: number[] = []
    const discontinuedInfusionIds: string[] = []
    const discontinuedFluidWithAmounts: { id: string; amount: number; category: string }[] = []

    for (const a of agents) {
      const d = decisions[`agent-${a.startCol}`]
      if (d === "continue") continuedItems.push(`${a.name} (inhalational agent)`)
      if (d === "discontinue") discontinuedAgentCols.push(a.startCol)
    }
    for (const inf of infusions) {
      const d = decisions[`inf-${inf.id}`]
      if (d === "continue") continuedItems.push(`${inf.name} infusion (${inf.rate} ${inf.unit})`)
      if (d === "discontinue") {
        const tot = calcInfusionTotal(inf)
        infusionTotals.push({ name: inf.name, total: tot.amount, unit: tot.unit })
        discontinuedInfusionIds.push(inf.id)
      }
    }
    for (const f of fluids) {
      const d = decisions[`fluid-${f.id}`]
      const cat = f.category ?? "Crystalloids"
      if (d === "continue") continuedItems.push(`${f.name} (fluid)`)
      if (d === "discontinue") {
        const amt = Number(fluidAmounts[f.id] ?? 0) || 0
        discontinuedFluidWithAmounts.push({ id: f.id, amount: amt, category: cat })
      }
    }
    onConfirm({ continuedItems, infusionTotals, discontinuedAgentCols, discontinuedInfusionIds, discontinuedFluidWithAmounts })
  }

  const pillBase = "text-xs px-2.5 py-1 rounded-full border font-semibold transition-colors"

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={e => { if (e.target === e.currentTarget) onDismiss() }}>
      <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto">
        <div className="mb-4">
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">End Case — Active Items</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Choose what to do with each active item.</p>
        </div>

        {agents.length === 0 && infusions.length === 0 && fluids.length === 0 && (
          <p className="text-sm text-slate-400 py-4 text-center">No active items — ready to end.</p>
        )}

        {agents.map(a => {
          const key = `agent-${a.startCol}`
          const d = decisions[key]
          return (
            <div key={a.startCol} className="flex items-center justify-between gap-2 py-3 border-b border-slate-100 dark:border-[#2e2e2e]">
              <div>
                <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">{a.name}</span>
                <span className="ml-2 text-[10px] text-slate-400">inhalational</span>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button type="button" onClick={() => setDecision(key, "discontinue")}
                  className={`${pillBase} ${d === "discontinue" ? "bg-red-500 text-white border-red-500" : "border-red-300 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"}`}>
                  Discontinue
                </button>
                <button type="button" onClick={() => setDecision(key, "continue")}
                  className={`${pillBase} ${d === "continue" ? "bg-emerald-500 text-white border-emerald-500" : "border-emerald-300 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"}`}>
                  Continue postop
                </button>
              </div>
            </div>
          )
        })}

        {infusions.map(inf => {
          const key = `inf-${inf.id}`
          const d = decisions[key]
          const tot = d === "discontinue" ? calcInfusionTotal(inf) : null
          return (
            <div key={inf.id} className="py-3 border-b border-slate-100 dark:border-[#2e2e2e] space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-sm font-semibold" style={{ color: inf.color }}>{inf.name}</span>
                  <span className="ml-2 text-[10px] text-slate-400">{inf.rate} {inf.unit}</span>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button type="button" onClick={() => setDecision(key, "discontinue")}
                    className={`${pillBase} ${d === "discontinue" ? "bg-red-500 text-white border-red-500" : "border-red-300 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"}`}>
                    Discontinue
                  </button>
                  <button type="button" onClick={() => setDecision(key, "continue")}
                    className={`${pillBase} ${d === "continue" ? "bg-emerald-500 text-white border-emerald-500" : "border-emerald-300 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"}`}>
                    Continue postop
                  </button>
                </div>
              </div>
              {tot && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 pl-0.5">
                  Estimated total: <span className="font-semibold">{tot.amount} {tot.unit}</span>
                </p>
              )}
            </div>
          )
        })}

        {fluids.map(f => {
          const key = `fluid-${f.id}`
          const d = decisions[key]
          return (
            <div key={f.id} className="py-3 border-b border-slate-100 dark:border-[#2e2e2e] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-sm font-semibold" style={{ color: f.color }}>{f.name}</span>
                  <span className="ml-2 text-[10px] text-slate-400">{f.category ?? "fluid"}</span>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button type="button" onClick={() => setDecision(key, "discontinue")}
                    className={`${pillBase} ${d === "discontinue" ? "bg-red-500 text-white border-red-500" : "border-red-300 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"}`}>
                    Discontinue
                  </button>
                  <button type="button" onClick={() => setDecision(key, "continue")}
                    className={`${pillBase} ${d === "continue" ? "bg-emerald-500 text-white border-emerald-500" : "border-emerald-300 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"}`}>
                    Continue postop
                  </button>
                </div>
              </div>
              {d === "discontinue" && (() => {
                const bagVol = parseInt(f.volume) || 500
                const curAmt = parseInt(fluidAmounts[f.id] ?? "0") || 0
                const fb = fluidFullBag[f.id] ?? null
                return (
                  <div className="pl-0.5 space-y-2">
                    <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Was the full bag infused?</p>
                    <div className="flex gap-2">
                      <button type="button"
                        onClick={() => { setFluidFullBag(prev => ({ ...prev, [f.id]: true })); setFluidAmounts(prev => ({ ...prev, [f.id]: String(bagVol) })) }}
                        className={`flex-1 text-[10px] font-semibold py-1.5 rounded-lg border-2 transition-colors ${fb === true ? "bg-teal-500 border-teal-500 text-white" : "border-teal-300 dark:border-teal-700 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20"}`}>
                        ✓ Yes — full bag
                      </button>
                      <button type="button"
                        onClick={() => { setFluidFullBag(prev => ({ ...prev, [f.id]: false })); setFluidAmounts(prev => ({ ...prev, [f.id]: "0" })) }}
                        className={`flex-1 text-[10px] font-semibold py-1.5 rounded-lg border-2 transition-colors ${fb === false ? "bg-amber-500 border-amber-500 text-white" : "border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"}`}>
                        No — partial
                      </button>
                    </div>
                    {fb === false && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">Amount:</span>
                          <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">{curAmt} mL</span>
                        </div>
                        <input type="range" min={0} max={bagVol} step={50}
                          value={curAmt}
                          onChange={e => setFluidAmounts(prev => ({ ...prev, [f.id]: e.target.value }))}
                          className="w-full accent-teal-500 cursor-pointer" />
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          )
        })}

        <div className="flex justify-end gap-2 pt-4">
          <button type="button" onClick={onDismiss}
            className="text-sm px-4 py-2 rounded-lg border border-slate-200 dark:border-[#3a3a3a] text-slate-500 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleConfirm}
            className="text-sm px-4 py-2 rounded-lg bg-red-500 text-white font-semibold hover:bg-red-600 transition-colors">
            Confirm End Case
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
// ── Keyboard Shortcuts Modal ──────────────────────────────────────────────────
function HotkeysModal({ onClose }: { onClose: () => void }) {
  const SHORTCUTS: [string, string][] = [
    ["Click",                        "Select / deselect item"],
    ["Esc",                          "Deselect / close dialogs"],
    ["Tab",                          "Cycle: drugs → infusions → fluids → agents"],
    ["Del / Backspace",              "Delete selected item"],
    ["→  (Right arrow)",             "Extend bar right / copy drug right"],
    ["←  (Left arrow)",              "Retract bar left / remove drug"],
    ["0 – 9",                        "Enter dose for selected drug"],
    ["Double-click stopped bar",     "Reactivate bar"],
    ["Double-click infusion bar",    "Change infusion rate"],
    ["Double-click drug pill",       "Change drug dose"],
    ["↑ / ↓",                        "Adjust vitals slider value"],
    ["Enter",                        "Confirm value in any input"],
    ["Ctrl + Z",                     "Undo"],
    ["Ctrl + Y  /  Ctrl + Shift + Z","Redo"],
  ]
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 border border-slate-200 dark:border-[#3a3a3a]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Keyboard Shortcuts</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-1.5">
          {SHORTCUTS.map(([key, desc]) => (
            <div key={key} className="flex items-center gap-3">
              <kbd className="shrink-0 w-52 px-2 py-1 font-mono text-[10px] bg-slate-100 dark:bg-[#2a2a2a] border border-slate-200 dark:border-[#3a3a3a] rounded text-slate-600 dark:text-slate-300 whitespace-nowrap">
                {key}
              </kbd>
              <span className="text-xs text-slate-600 dark:text-slate-300">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}

type TtFP = {
  col: number; name: string; unit: string; mode: TtFPMode; dose: string; doseHint: string;
  rate: number; rateUnit: string; rateUnits: string[];
  rateMin: number; rateMax: number; rateStep: number;
  color: string; fluidScale?: "S" | "L";
  concentration?: string   // local anaesthetic solution % (e.g. "0.25%")
  customConc?: string      // user-typed custom % before appending "%"
  anchor: { top: number; bottom: number; left: number; right: number; width: number };
}

// в"Ђв"Ђ Component в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
export function IntraopTimetable({ startTime, endTime, caseStarted = false, monitoring, ibw, tbw, showAgentRow = false, data, onChange, onEndCase, onResumeCase, onPostopContinued, onInfusionTotals, onFluidTotals }: Props) {
  const [colCount, setColCount]           = useState(ROW_COLS)  // start with 1 row
  const [chartOpen, setChartOpen]         = useState(() => typeof window !== "undefined" && localStorage.getItem("vitalsExpanded") !== "false")
  const [addingDrug, setAddingDrug]       = useState<number | null>(null)
  const [draft, setDraft]                 = useState({ name: "", dose: "", unit: "mg" })
  const [dragOver, setDragOver]           = useState<number | null>(null)
  // Extending an infusion segment
  // Whole-bar drag
  const [movingInf, setMovingInf]         = useState<{ id: string; origStart: number; origEnd: number; fromCol: number } | null>(null)
  const [movingInfCol, setMovingInfCol]   = useState<number | null>(null)
  // Rate-pill drag
  const [movingRatePill, setMovingRatePill]       = useState<{ infId: string; fromCol: number; rate: number; unit: string } | null>(null)
  const [movingRatePillCol, setMovingRatePillCol] = useState<number | null>(null)
  // Misc infusion UI state
  const [deleteInfPrompt, setDeleteInfPrompt] = useState<string | null>(null)
  const [hoverDiscontinue, setHoverDiscontinue] = useState<string | null>(null)
  // Right-grip (extend endCol) and left-grip (extend startCol backward)
  const [extendingInf, setExtendingInf]         = useState<string | null>(null)
  const [extInfHover, setExtInfHover]           = useState<number | null>(null)
  const [extendingInfLeft, setExtendingInfLeft] = useState<string | null>(null)
  const [extInfLeftHover, setExtInfLeftHover]   = useState<number | null>(null)
  // Fluid volume slider scale: S=small 10ml steps, L=large 50ml steps
  const [fluidScale, setFluidScale]       = useState<"S"|"L">("L")
  // Item-level selection (pill or infusion bar)
  const [sel, setSel] = useState<TtSel | null>(null)
  // Floating prompt portal
  const [fp, setFp] = useState<TtFP | null>(null)
  // Quick-pick column (header click) + live "now" tracking
  const [selectedCol, setSelectedCol] = useState<number>(0)
  const [nowOffsetPx, setNowOffsetPx] = useState<number | null>(null)
  const activeRowRef                  = useRef<HTMLDivElement>(null)
  // Dynamic column width — fills available container width in stacked mode
  const [colW, setColW] = useState(COL_W)
  const rowsContainerRef = useRef<HTMLDivElement>(null)
  const prevColRef                    = useRef<number | null>(null)
  const endedAtRef                    = useRef<Date | null>(null)
  const [resumeSecsLeft, setResumeSecsLeft] = useState(0)
  // In-cell drug picker
  const [drugPicker, setDrugPicker]   = useState<{ ci: number; rect: DOMRect } | null>(null)
  const [dpSearch,   setDpSearch]     = useState("")
  // In-cell fluid picker
  const [fluidPicker, setFluidPicker] = useState<{ ci: number; rect: DOMRect } | null>(null)
  const [fpSearch,    setFpSearch]    = useState("")
  // Infusion context menu + rate-change dialog
  const [infMenu, setInfMenu] = useState<{ segId: string; name: string; color: string; rect: DOMRect; stopped?: boolean; fromPillCol?: number } | null>(null)
  const [rateDialog, setRateDialog] = useState<{
    segId: string; name: string; rate: number; unit: string
    units: string[]; rateMin: number; rateMax: number; rateStep: number
    color: string; rect: DOMRect; step: "rate" | "time"
    timeH: string; timeM: string
    editFromCol?: number
  } | null>(null)
  // Timetable layout mode
  const [layout, setLayout] = useState<"expand" | "scroll">(() =>
    typeof window !== "undefined"
      ? ((localStorage.getItem("timetableLayout") as "expand" | "scroll") ?? "expand")
      : "expand"
  )
  // End Case Modal
  const [showEndModal, setShowEndModal] = useState(false)
  // Keyboard shortcuts popup
  const [showHotkeys, setShowHotkeys] = useState(false)
  // Inline discontinue: infusion/agent two-step confirm; fluid volume prompt
  const [discConfirmId, setDiscConfirmId] = useState<string | null>(null)
  const [discFluidState, setDiscFluidState] = useState<{ id: string; volInput: string; rect: DOMRect; fullBag: boolean | null } | null>(null)
  // Dose / rate editor
  const [doseEditDrug, setDoseEditDrug] = useState<{ idx: number; dose: string; unit: string; rect: DOMRect } | null>(null)
  // Custom drug popup + saved list
  const [customDrugOpen, setCustomDrugOpen]   = useState(false)
  const [customDrugRect, setCustomDrugRect]   = useState<DOMRect | null>(null)
  const [customDrugName, setCustomDrugName]   = useState("")
  const [customDrugUnit, setCustomDrugUnit]   = useState("mg")
  const [customDrugDose, setCustomDrugDose]   = useState("")
  const [customDrugs, setCustomDrugs]         = useState<{name:string; unit:string}[]>([])

  // Vitals input refs (keyed "${col}-${rowKey}") for Tab column navigation
  const vitalsInputRefs = useRef<Map<string, HTMLInputElement>>(new Map())
  // Vitals slider popup
  const [vitalsPopup, setVitalsPopup] = useState<{
    col: number; key: keyof VitalsEntry
    min: number; max: number; step: number; defaultVal: number
    label: string; unit: string; color: string
    rect: DOMRect
  } | null>(null)

  // Stable refs
  const dataRef        = useRef(data)
  const rawOnChangeRef = useRef(onChange)   // raw parent callback — used only by clock auto-extend
  const layoutRef      = useRef(layout)
  useEffect(() => { dataRef.current = data },              [data])
  useEffect(() => { rawOnChangeRef.current = onChange },   [onChange])
  useEffect(() => { layoutRef.current = layout },          [layout])
  // Persist layout/vitals settings and listen for changes from the Settings panel
  useEffect(() => {
    localStorage.setItem("timetableLayout", layout)
    window.dispatchEvent(new StorageEvent("storage", { key: "timetableLayout", newValue: layout }))
  }, [layout])
  useEffect(() => {
    localStorage.setItem("vitalsExpanded", chartOpen ? "true" : "false")
  }, [chartOpen])
  useEffect(() => {
    const h = (e: StorageEvent) => {
      if (e.key === "timetableLayout" && (e.newValue === "expand" || e.newValue === "scroll"))
        setLayout(e.newValue)
      if (e.key === "vitalsExpanded")
        setChartOpen(e.newValue !== "false")
    }
    window.addEventListener("storage", h)
    return () => window.removeEventListener("storage", h)
  }, [])

  // Resume countdown — tick every second while active
  useEffect(() => {
    if (resumeSecsLeft <= 0) return
    const id = setInterval(() => {
      if (!endedAtRef.current) return
      const elapsed = Math.floor((Date.now() - endedAtRef.current.getTime()) / 1000)
      const left    = Math.max(0, 30 * 60 - elapsed)
      setResumeSecsLeft(left)
    }, 1000)
    return () => clearInterval(id)
  }, [resumeSecsLeft > 0])
  // Reset inline-discontinue state when selection changes
  useEffect(() => { setDiscConfirmId(null); setDiscFluidState(null) }, [sel])

  // Resize-aware column width: fill available width in stacked mode
  useEffect(() => {
    const el = rowsContainerRef.current
    if (!el) return
    const update = () => {
      if (layoutRef.current !== "expand") { setColW(COL_W); return }
      const w = el.getBoundingClientRect().width
      if (w > LABEL_W) setColW(Math.max(COL_W, Math.floor((w - LABEL_W) / ROW_COLS)))
    }
    const ro = new ResizeObserver(update)
    ro.observe(el); update()
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    if (layout !== "expand") setColW(COL_W)
    else { const el = rowsContainerRef.current; if (el) { const w = el.getBoundingClientRect().width; if (w > LABEL_W) setColW(Math.max(COL_W, Math.floor((w - LABEL_W) / ROW_COLS))) } }
  }, [layout])

  // Undo / redo history (refs → no extra renders)
  const histPastRef   = useRef<TimetableData[]>([])
  const histFutureRef = useRef<TimetableData[]>([])

  // All user-action changes go through here — pushes to history before calling parent
  const onChangeRef = useRef((newData: TimetableData) => {
    histPastRef.current = [...histPastRef.current.slice(-99), dataRef.current]
    histFutureRef.current = []
    rawOnChangeRef.current(newData)
  })

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
    const cfg  = INFUSION_CONFIGS[fp.name] ?? DEFAULT_INF
    const conc = fp.concentration ? ` ${fp.concentration}` : ""
    const displayName = fp.name + conc
    const id   = `${fp.name}-${fp.col}-${Date.now()}`
    onChange({ ...data, infusions: [...(data.infusions??[]), { id, name:displayName, rate:fp.rate, unit:fp.rateUnit, startCol:fp.col, endCol:fp.col, color:cfg.color }] })
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

      // Tab: cycle drugв†'fluidв†'next col drug
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

  // Close vitals popup on Enter; arrow keys adjust slider value
  useEffect(() => {
    if (!vitalsPopup) return
    const popup = vitalsPopup
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Enter") {
        e.preventDefault(); e.stopPropagation()
        const cur = dataRef.current.vitals[popup.col]?.[popup.key]
        if (cur === undefined) setVital(popup.col, popup.key, String(popup.defaultVal))
        setVitalsPopup(null)
        return
      }
      if (e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "ArrowDown") {
        e.preventDefault(); e.stopPropagation()
        const cur = dataRef.current.vitals[popup.col]?.[popup.key] ?? popup.defaultVal
        const delta = (e.key === "ArrowRight" || e.key === "ArrowUp") ? popup.step : -popup.step
        const next  = Math.min(popup.max, Math.max(popup.min, cur + delta))
        setVital(popup.col, popup.key, String(next))
      }
    }
    window.addEventListener("keydown", handleKey, true) // capture phase — beats input handlers
    return () => window.removeEventListener("keydown", handleKey, true)
  }, [vitalsPopup])

  // Undo / redo
  useEffect(() => {
    function handleUndoRedo(e: KeyboardEvent) {
      if (!e.ctrlKey) return
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault()
        const prev = histPastRef.current.pop()
        if (prev) { histFutureRef.current.push(dataRef.current); rawOnChangeRef.current(prev) }
      }
      if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
        e.preventDefault()
        const next = histFutureRef.current.pop()
        if (next) { histPastRef.current.push(dataRef.current); rawOnChangeRef.current(next) }
      }
    }
    window.addEventListener("keydown", handleUndoRedo)
    return () => window.removeEventListener("keydown", handleUndoRedo)
  }, [])

  // Freeze and clear the live clock as soon as case ends
  const endTimeRef = useRef(endTime)
  useEffect(() => { endTimeRef.current = endTime }, [endTime])
  useEffect(() => { if (endTime) setNowOffsetPx(null) }, [endTime])

  // On mount: expand colCount to cover all loaded data + the end time so a
  // resumed/ended case shows the full timetable rather than just the first hour.
  // Skip this for brand-new cases with no data (caseStarted=false, no endTime,
  // no bars) — let the live clock grow the table naturally instead.
  useEffect(() => {
    if (!caseStarted && !endTime) return
    const startMins = timeToMins(floorTo5(startTime || "08:00"))

    const dataMax = Math.max(
      0,
      ...(data.agents    ?? []).map(a => a.endCol),
      ...(data.infusions ?? []).map(i => i.endCol),
      ...(data.fluids    ?? []).map(f => f.endCol),
      ...(data.drugs     ?? []).map(d => d.colIdx),
      data.vitals && data.vitals.length > 0 ? data.vitals.length - 1 : 0,
    )

    const endMax = endTime ? (() => {
      const endMins  = timeToMins(endTime)
      const diffMins = endMins >= startMins ? endMins - startMins : (1440 - startMins) + endMins
      return Math.max(0, Math.floor(diffMins / INTERVAL))
    })() : 0

    const needed = Math.max(dataMax, endMax) + 1
    if (needed > ROW_COLS) {
      setColCount(Math.ceil(needed / ROW_COLS) * ROW_COLS)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally run once on mount only

  // в"Ђв"Ђ Live clock: advance selectedCol + pixel offset every 10 s в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
  useEffect(() => {
    if (!caseStarted) return          // case not started — don't run clock
    function tick() {
      if (endTimeRef.current) return  // case ended — stop the clock
      const now = new Date()
      let diffSecs = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds())
                   - (timeToMins(floorTo5(startTime || "08:00")) * 60)
      if (diffSecs < 0) diffSecs += 24 * 3600  // case started yesterday (midnight crossing)
      if (diffSecs >= 0) {
        const px  = diffSecs / (INTERVAL * 60) * COL_W
        const col = Math.min(Math.floor(diffSecs / (INTERVAL * 60)), colCount - 1)
        setNowOffsetPx(Math.min(px, colCount * COL_W))
        setSelectedCol(col)
        if (col + 1 >= colCount) setColCount(layoutRef.current === "scroll" ? colCount + 1 : Math.ceil((col + 2) / ROW_COLS) * ROW_COLS)

        // Auto-extend live bars to current column (any bar behind current that isn't stopped)
        const d   = dataRef.current
        const oc  = rawOnChangeRef.current   // bypass history — auto-extend is not undoable
        const prevCol = prevColRef.current

        const needsExtend =
          (d.infusions ?? []).some(i => i.endCol < col && !i.stopped) ||
          (d.fluids    ?? []).some(f => f.endCol < col && !f.stopped) ||
          (d.agents    ?? []).some(a => a.endCol < col && !a.stopped)

        // Auto-fill EtCO₂/Temp/SpO₂ from previous column when clock advances
        const AUTO_FILL_KEYS = ["etco2", "temp", "spO2"] as const
        let newVitals = d.vitals
        if (prevCol !== null && col > prevCol && localStorage.getItem("autoFillVitals") === "on") {
          const hasToFill = AUTO_FILL_KEYS.some(k => d.vitals[prevCol]?.[k] != null && d.vitals[col]?.[k] == null)
          if (hasToFill) {
            newVitals = [...d.vitals]
            while (newVitals.length <= col) newVitals.push({} as VitalsEntry)
            AUTO_FILL_KEYS.forEach(k => {
              const pv = d.vitals[prevCol]?.[k]
              if (pv != null && newVitals[col]?.[k] == null)
                newVitals[col] = { ...newVitals[col], [k]: pv }
            })
          }
        }

        if (needsExtend || newVitals !== d.vitals) {
          oc({
            ...d,
            vitals:    newVitals,
            infusions: (d.infusions ?? []).map(i => i.endCol < col && !i.stopped ? { ...i, endCol: col } : i),
            fluids:    (d.fluids    ?? []).map(f => f.endCol < col && !f.stopped ? { ...f, endCol: col } : f),
            agents:    (d.agents   ?? []).map(a => a.endCol < col && !a.stopped ? { ...a, endCol: col } : a),
          })
        }
        prevColRef.current = col
      }
    }
    tick()
    const id = setInterval(tick, 10_000)
    return () => clearInterval(id)
  }, [startTime, colCount, caseStarted])

  const nowCol    = nowOffsetPx !== null ? Math.min(Math.floor(nowOffsetPx / COL_W), colCount - 1) : null
  const nowCellPx = nowOffsetPx !== null && nowCol !== null ? nowOffsetPx - nowCol * COL_W : null

  // Column index of the case end time (handles midnight crossing)
  const endCol = endTime ? (() => {
    const startMins = timeToMins(floorTo5(startTime || "08:00"))
    const endMins   = timeToMins(endTime)
    const diffMins  = endMins >= startMins ? endMins - startMins : (1440 - startMins) + endMins
    return Math.max(0, Math.floor(diffMins / INTERVAL))
  })() : null

  // в"Ђв"Ђ Auto-scroll active row into view when column advances в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
  useEffect(() => {
    if (!caseStarted) return          // don't auto-scroll until the case has started
    activeRowRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [nowCol, caseStarted])
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
  const agents = data.agents ?? []

  // Show only rows whose monitor is active; fall back to all rows if no monitoring passed
  const activeRows = monitoring
    ? VITAL_ROW_DEFS.filter(row => row.monitors.some(m => monitoring[m]))
    : VITAL_ROW_DEFS

  // Find segment that covers column ci (strict range check)
  function segmentAt(ci: number): AgentSegment | null {
    return agents.find(a => ci >= a.startCol && ci <= a.endCol) ?? null
  }

  // в"Ђв"Ђ Vitals в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
  function setVital(col: number, key: keyof VitalsEntry, raw: string) {
    const val  = raw === "" ? undefined : Number(raw)
    const next = [...data.vitals]
    while (next.length <= col) next.push({})
    next[col] = { ...next[col], [key]: val }
    onChange({ ...data, vitals: next })
  }

  // в"Ђв"Ђ Drugs в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
  function commitDrug(col: number) {
    if (!draft.name.trim()) { setAddingDrug(null); return }
    onChange({ ...data, drugs: [...data.drugs, { colIdx: col, name: draft.name.trim(), dose: draft.dose, unit: draft.unit }] })
    setDraft({ name: "", dose: "", unit: "mg" }); setAddingDrug(null)
  }
  function removeDrug(idx: number) { onChange({ ...data, drugs: data.drugs.filter((_, i) => i !== idx) }) }

  // в"Ђв"Ђ Infusions в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
  function removeInfusion(id: string) { onChange({ ...data, infusions: (data.infusions ?? []).filter(i => i.id !== id) }) }
  function extendInfusion(id: string, newEnd: number, terminate = false) {
    const d = dataRef.current; onChangeRef.current({ ...d, infusions: (d.infusions ?? []).map(i => i.id === id ? { ...i, endCol: newEnd, stopped: terminate ? true : undefined } : i) })
  }
  function resumeInfusion(id: string) {
    const d = dataRef.current; onChangeRef.current({ ...d, infusions: (d.infusions ?? []).map(i => i.id === id ? { ...i, stopped: undefined } : i) })
  }
  function continueInfusion(source: TimetableInfusion, col: number) {
    const d = dataRef.current
    const newId = `${source.name}-${col}-${Date.now()}`
    const startCol = col
    const endCol   = Math.max(nowCol ?? col, col)  // past cell → fill to now; future cell → start there
    onChangeRef.current({ ...d, infusions: [...(d.infusions ?? []), { ...source, id: newId, startCol, endCol, stopped: undefined }] })
  }

  // в"Ђв"Ђ Fluids в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
  function removeFluid(id: string) { onChange({ ...data, fluids: (data.fluids ?? []).filter(f => f.id !== id) }) }
  function extendFluid(id: string, newEnd: number, terminate = false) {
    const d = dataRef.current; onChangeRef.current({ ...d, fluids: (d.fluids ?? []).map(f => f.id === id ? { ...f, endCol: newEnd, stopped: terminate ? true : undefined } : f) })
  }
  function resumeFluid(id: string) {
    const d = dataRef.current; onChangeRef.current({ ...d, fluids: (d.fluids ?? []).map(f => f.id === id ? { ...f, stopped: undefined } : f) })
  }
  function continueFluid(source: TimetableFluid, col: number) {
    const d = dataRef.current
    const newId = `${source.name}-${col}-${Date.now()}`
    const startCol = col
    const endCol   = Math.max(nowCol ?? col, col)
    onChangeRef.current({ ...d, fluids: [...(d.fluids ?? []), { ...source, id: newId, startCol, endCol, stopped: undefined }] })
  }

  // в"Ђв"Ђ Agents в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
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
  function extendSegment(startCol: number, newEndCol: number, terminate = false) {
    const d = dataRef.current; onChangeRef.current({ ...d, agents: d.agents.map(a => a.startCol === startCol ? { ...a, endCol: newEndCol, stopped: terminate ? true : undefined } : a) })
  }
  function resumeSegment(startCol: number) {
    const d = dataRef.current; onChangeRef.current({ ...d, agents: d.agents.map(a => a.startCol === startCol ? { ...a, stopped: undefined } : a) })
  }
  function continueAgent(source: AgentSegment, col: number) {
    const d = dataRef.current
    const startCol = col
    const endCol   = Math.max(nowCol ?? col, col)
    onChangeRef.current({ ...d, agents: [...d.agents, { name: source.name, startCol, endCol, n2o: source.n2o, stopped: undefined }] })
  }

  function extendInfusionLeft(id: string, newStartCol: number) {
    const d = dataRef.current
    const seg = (d.infusions ?? []).find(i => i.id === id)
    if (!seg) return
    const clamped = Math.max(0, Math.min(newStartCol, seg.endCol))
    onChangeRef.current({ ...d, infusions: (d.infusions ?? []).map(i => i.id === id ? {
      ...i, startCol: clamped,
      rateChanges: (i.rateChanges ?? []).filter(rc => rc.col >= clamped),
    } : i) })
  }

  function restoreInfusion(id: string) {
    const d = dataRef.current
    const col = nowCol !== null ? nowCol : 0
    onChangeRef.current({ ...d, infusions: (d.infusions ?? []).map(i => i.id === id ? { ...i, stopped: undefined, endCol: Math.max(i.endCol, col) } : i) })
  }

  function applyInfRateChange(infId: string, fromCol: number | null, toCol: number, rate: number, unit: string) {
    onChangeRef.current({
      ...dataRef.current,
      infusions: (dataRef.current.infusions ?? []).map(i => {
        if (i.id !== infId) return i
        const changes = (i.rateChanges ?? []).filter(rc => rc.col !== fromCol && rc.col !== toCol).sort((a, b) => a.col - b.col)
        if (toCol === i.startCol) {
          // Dropped on the start cell → change the base rate of the segment
          return { ...i, rate, unit, rateChanges: changes.length > 0 ? changes : undefined }
        }
        return { ...i, rateChanges: [...changes, { col: toCol, rate, unit }].sort((a, b) => a.col - b.col) }
      }),
    })
  }

  function handleEndCaseConfirm(result: {
    continuedItems: string[]
    infusionTotals: { name: string; total: number; unit: string }[]
    discontinuedAgentCols: number[]
    discontinuedInfusionIds: string[]
    discontinuedFluidWithAmounts: { id: string; amount: number; category: string }[]
  }) {
    const col = nowCol ?? 0
    for (const startCol of result.discontinuedAgentCols) extendSegment(startCol, col, true)
    for (const id of result.discontinuedInfusionIds) extendInfusion(id, col, true)
    // Batch-stop fluids and stamp the actual volume infused onto the segment so
    // the auto-calc in IntraopForm reads the correct amount (not the full bag size).
    if (result.discontinuedFluidWithAmounts.length > 0) {
      const amtById: Record<string, number> = Object.fromEntries(
        result.discontinuedFluidWithAmounts.map(f => [f.id, f.amount])
      )
      const d = dataRef.current
      onChangeRef.current({
        ...d,
        fluids: (d.fluids ?? []).map(f =>
          Object.prototype.hasOwnProperty.call(amtById, f.id)
            ? { ...f, endCol: col, stopped: true as const, volume: String(amtById[f.id]) }
            : f
        ),
      })
    }
    endedAtRef.current = new Date()
    setResumeSecsLeft(30 * 60)
    onEndCase?.()
    if (result.continuedItems.length > 0) onPostopContinued?.(result.continuedItems)
    if (result.infusionTotals.length > 0) onInfusionTotals?.(result.infusionTotals)
    setShowEndModal(false)
  }

  // в"Ђв"Ђ Extend drag-and-drop в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
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

  // в"Ђв"Ђ Drug/fluid drag в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
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

  // в"Ђв"Ђ Chart в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
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

  // в"Ђв"Ђ Shared styles в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
  const cellCls     = "w-full text-center text-sm font-mono bg-white/60 dark:bg-transparent outline-none focus:bg-blue-50 dark:focus:bg-blue-900/30 rounded transition-colors py-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-slate-700 dark:text-[#d0d0d0]"
  const rowLabelCls = "text-xs font-semibold text-slate-400 dark:text-[#888] uppercase tracking-wide text-right pr-2 leading-none select-none"
  const stopBtnCls  = "text-[8px] font-bold px-1.5 py-0.5 rounded bg-red-700 dark:bg-red-900/80 hover:bg-red-600 dark:hover:bg-red-800 text-white border border-red-600 dark:border-red-800 whitespace-nowrap cursor-pointer"
  const hoverStopCls = stopBtnCls + " absolute right-3 top-1/2 -translate-y-1/2 z-20 opacity-0 group-hover:opacity-100 transition-opacity"

  // в"Ђв"Ђ Per-row renderer в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
  function renderRow(rowIdx: number, overrideColStart?: number, overrideColEnd?: number) {
    const colStart    = overrideColStart ?? rowIdx * ROW_COLS
    const colEnd      = overrideColEnd   ?? Math.min(colStart + ROW_COLS, colCount)
    const rowCols     = Array.from({ length: colEnd - colStart }, (_, i) => colStart + i)
    const isActiveRow = overrideColStart !== undefined
      ? nowCol !== null
      : nowCol !== null ? rowIdx === Math.floor(nowCol / ROW_COLS) : rowIdx === Math.ceil(colCount / ROW_COLS) - 1
    const rowW        = LABEL_W + rowCols.length * colW
    // Scale nowOffsetPx (stored in COL_W units) to dynamic colW units for display
    // Stop the live line once the case has ended (endTime is set)
    const rowNowPx = isActiveRow && nowOffsetPx !== null && !endTime ? (nowOffsetPx - colStart * COL_W) * colW / COL_W : null

    // Post-case overlay: pixel offset of the end boundary within this row
    // null  = entire row is pre-end (no overlay)
    // 0     = entire row is post-end (overlay covers everything)
    const rowEndOverlayLeft = endCol === null ? null
      : endCol < colStart ? 0                             // whole row is post-end
      : endCol < colEnd   ? (endCol - colStart + 1) * colW // partial — from boundary right
      : null                                              // whole row is pre-end

    // в"Ђв"Ђ bar continuation helpers в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
    function barContinues(endCol: number) { return endCol >= colEnd }
    function barEntries(startCol: number) { return startCol < colStart }

    // в"Ђв"Ђ per-bar edge classes & grip visibility в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
    // isVisualStart = this cell is the first visible cell of the bar (actual start OR first in row)
    function leftCls(isVisualStart: boolean) {
      return isVisualStart ? "left-1 border-l rounded-l-full" : "left-0"
    }
    function rightCls(endCol: number, isActualEnd: boolean) {
      return (isActualEnd && !barContinues(endCol)) ? "right-3 border-r rounded-r-sm" : "right-0 border-r-0"
    }
    function showGrip(endCol: number, isActualEnd: boolean, isDragPreview: boolean) {
      return isActualEnd && !barContinues(endCol) && !isDragPreview
    }

    return (
      <div key={rowIdx} ref={isActiveRow ? activeRowRef : undefined}
        className="rounded-lg border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#1c1c1c] overflow-hidden">
        {/* Row label bar */}
        <div className="flex items-center justify-between px-3 py-1 bg-slate-50 dark:bg-[#1a1a1a] border-b border-slate-100 dark:border-[#2a2a2a]">
          <span className="text-[9px] font-mono font-semibold text-slate-400 dark:text-[#666]">
            {times[colStart]}{" - "}{addMinutes(times[Math.min(colEnd - 1, times.length - 1)], INTERVAL)}
          </span>
          {isActiveRow && (endTime
            ? <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400"><span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />CASE ENDED</span>
            : <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-orange-500 dark:text-orange-400"><span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500 animate-ping opacity-75" />LIVE</span>
          )}
        </div>
        <div style={{ width: rowW, position: "relative" }}>

          {/* Now-line (only active row, hidden after case end) */}
          {rowNowPx !== null && (
            <div style={{ position:"absolute", left: LABEL_W + rowNowPx - 1, top:0, bottom:0, width:2, zIndex:6, pointerEvents:"none" }}
              className="bg-orange-400/50 dark:bg-orange-500/40" />
          )}

          {/* Emerald end-line — vertical marker at the case end boundary */}
          {rowEndOverlayLeft !== null && rowEndOverlayLeft > 0 && (
            <div style={{ position:"absolute", left: LABEL_W + rowEndOverlayLeft - 1, top:0, bottom:0, width:2, zIndex:7, pointerEvents:"none" }}
              className="bg-emerald-400/80 dark:bg-emerald-500/60" />
          )}

          {/* Post-case overlay — blocks interaction and shows "Case Finished" */}
          {rowEndOverlayLeft !== null && (
            <div
              style={{ position:"absolute", left: LABEL_W + rowEndOverlayLeft, top:0, right:0, bottom:0, zIndex:20 }}
              className="bg-slate-50/80 dark:bg-[#0d0d0d]/80 flex items-center justify-center"
              onClick={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
              onDoubleClick={e => e.stopPropagation()}>
              {/* Only show badge when there's enough horizontal space */}
              {(rowEndOverlayLeft === 0 || colEnd - Math.max(endCol ?? 0, colStart) > 2) && (
                <div className="flex flex-col items-center gap-1 select-none pointer-events-none">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/50 border-2 border-emerald-300 dark:border-emerald-700 flex items-center justify-center shadow-sm">
                    <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-[9px] font-bold tracking-widest uppercase text-emerald-700 dark:text-emerald-300">Case finished</span>
                </div>
              )}
            </div>
          )}

          {/* Chart */}
          {chartOpen && (
            <DivChart vitals={data.vitals} colStart={colStart} rowColCount={rowCols.length} activeRows={activeRows} />
          )}

          {/* Vital rows */}
          {activeRows.length === 0 && rowIdx === 0 && (
            <div className="flex items-center border-b border-slate-50 dark:border-[#222] py-2">
              <div style={{ width: LABEL_W, minWidth: LABEL_W }} className={rowLabelCls + " py-2"} />
              <span className="text-[10px] text-slate-300 dark:text-[#555] italic px-3">Select monitoring to populate vitals</span>
            </div>
          )}
          {activeRows.map((row, ri) => (
            <div key={row.key} className={`flex items-center border-b border-slate-50 dark:border-[#222] ${ri % 2 === 1 ? "bg-slate-50/40 dark:bg-[#1a1a1a]/60" : ""}`}>
              <div style={{ width: LABEL_W, minWidth: LABEL_W, position: "sticky", left: 0, zIndex: 2, backgroundColor: "inherit", borderLeft: `3px solid ${row.color}` }}
                className="flex flex-col items-end justify-center pr-2 py-1.5 gap-0 select-none bg-white dark:bg-[#1c1c1c]">
                <span className="text-xs font-semibold uppercase tracking-wide leading-tight" style={{ color: row.color }}>{row.label}</span>
                <span className="text-[10px] text-slate-300 dark:text-[#555] leading-tight">({row.unit})</span>
              </div>
              {rowCols.map(ci => (
                <div key={ci} style={{ width: colW, minWidth: colW, borderLeft: `1px solid ${row.color}20` }} className="px-1 py-1.5">
                  <input type="number" tabIndex={-1} min={row.min} max={row.max} placeholder="."
                    value={data.vitals[ci]?.[row.key] ?? ""}
                    onChange={e => setVital(ci, row.key, e.target.value)}
                    ref={el => { const k = `${ci}-${row.key}`; if (el) vitalsInputRefs.current.set(k, el); else vitalsInputRefs.current.delete(k) }}
                    onDoubleClick={e => { e.stopPropagation(); setVitalsPopup({ col: ci, key: row.key, min: row.min, max: row.max, step: row.step, defaultVal: row.defaultVal, label: row.label, unit: row.unit, color: row.color, rect: e.currentTarget.getBoundingClientRect() }) }}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        setVitalsPopup({ col: ci, key: row.key, min: row.min, max: row.max, step: row.step, defaultVal: row.defaultVal, label: row.label, unit: row.unit, color: row.color, rect: e.currentTarget.getBoundingClientRect() })
                        return
                      }
                      if (e.key !== "Tab") return
                      e.preventDefault()
                      const ri = activeRows.findIndex(r => r.key === row.key)
                      if (ri < activeRows.length - 1) {
                        vitalsInputRefs.current.get(`${ci}-${activeRows[ri + 1].key}`)?.focus()
                      } else {
                        const nextCi = ci + 1
                        if (nextCi < colCount) vitalsInputRefs.current.get(`${nextCi}-${activeRows[0].key}`)?.focus()
                      }
                    }}
                    className={cellCls} />
                </div>
              ))}
            </div>
          ))}

          {/* Time header */}
          <div className="flex border-b border-slate-100 dark:border-[#2a2a2a] bg-slate-50 dark:bg-[#1a1a1a]">
            <div style={{ width: LABEL_W, minWidth: LABEL_W }} className="text-[10px] text-slate-300 dark:text-[#555] px-2 py-1.5 text-right">Time</div>
            {rowCols.map(ci => {
              const isPostEnd = endCol !== null && ci > endCol
              return (
              <div key={ci} style={{ width: colW, minWidth: colW }}
                onClick={() => { if (!isPostEnd) setSelectedCol(ci) }}
                className={`relative text-xs font-mono font-semibold text-center py-2 border-l border-slate-100 dark:border-[#2a2a2a] transition-colors select-none ${
                  isPostEnd
                    ? "text-slate-300 dark:text-[#444] bg-slate-50 dark:bg-[#111] cursor-default"
                    : selectedCol === ci
                      ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 cursor-pointer"
                      : "text-slate-500 dark:text-[#888] hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 cursor-pointer"
                }`}>
                {times[ci]}
                {isActiveRow && nowCol === ci && !endTime && (
                  <span className="absolute top-0.5 right-0.5 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
                  </span>
                )}
                {!isPostEnd && selectedCol === ci && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400" />}
              </div>
              )
            })}
          </div>

          {/* Agent row */}
          {showAgentRow && (() => {
            const nowAgentSeg = isActiveRow && nowCol !== null ? segmentAt(nowCol) : null
            return (
              <div className="flex items-stretch border-b border-slate-200 dark:border-[#2e2e2e] bg-slate-50/60 dark:bg-[#1a1a1a]/60 relative" style={{ minHeight: 32 }}>
                <div style={{ width: LABEL_W, minWidth: LABEL_W }} className={rowLabelCls + " flex items-center justify-end py-2"}>Inh. Agent</div>
                {rowCols.map(ci => {
                  const committedSeg = segmentAt(ci)
                  const draggingSeg = (() => {
                    if (extendingAgent === null || extendHoverCol === null) return null
                    const s = agents.find(a => a.startCol === extendingAgent)
                    if (!s) return null
                    return (ci > s.endCol && ci <= extendHoverCol) ? s : null
                  })()
                  const seg           = committedSeg ?? draggingSeg
                  const isDragPreview = !committedSeg && !!draggingSeg
                  const style2        = seg ? (AGENT_STYLE[seg.name] ?? AGENT_STYLE["Sevoflurane"]) : null
                  const isStart       = seg?.startCol === ci
                  const effectiveEnd  = seg && extendingAgent === seg.startCol && extendHoverCol !== null ? extendHoverCol : (seg?.endCol ?? -1)
                  const isEnd         = seg !== null && ci === effectiveEnd
                  const isRowCont     = !isStart && seg != null && ci === colStart && barEntries(seg.startCol)
                  const isRowExit     = seg != null && barContinues(seg.endCol) && ci === colEnd - 1
                  const visStart      = Math.max(seg?.startCol ?? 0, colStart)
                  const visEnd        = Math.min(effectiveEnd, colEnd - 1)
                  const labelMinW     = Math.max(0, (visEnd - visStart + 1) * colW - 16)

                  return (
                    <div key={ci} style={{ width: colW, minWidth: colW }}
                      data-agent-cell
                      className="group relative border-l border-slate-100 dark:border-[#2a2a2a] flex items-center"
                      onDragOver={e => onAgentCellDragOver(e, ci)}
                      onDrop={e => onAgentCellDrop(e, ci)}
                      onClick={e => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        if (seg && isStart) openPickerForSeg(ci, seg, rect)
                        else if (!seg) openPickerEmpty(ci, rect)
                      }}>
                      {!seg && <span className="w-full text-center text-[10px] text-slate-300 dark:text-[#444] select-none pointer-events-none">choose</span>}
                      {seg && style2 && (() => {
                        const isAgentSel = sel?.type === "agent" && (sel as any).startCol === seg.startCol
                        const label = (isStart || isRowCont) ? [seg.name, seg.n2o != null ? `+ N2O ${seg.n2o}%` : null].filter(Boolean).join(" ") : null
                        return (
                          <>
                            <div
                              onClick={e => { e.stopPropagation(); const rect = (e.currentTarget as HTMLElement).closest("[data-agent-cell]")?.getBoundingClientRect() ?? (e.currentTarget as HTMLElement).getBoundingClientRect(); setSel({ type:"agent", startCol: seg.startCol }); if (isStart) openPickerForSeg(ci, seg, rect) }}
                              onDoubleClick={e => { e.stopPropagation(); if (seg.stopped) resumeSegment(seg.startCol) }}
                              title={seg.stopped ? "Double-click to resume" : undefined}
                              className={`absolute inset-y-1 border-y cursor-pointer transition-all ${style2.bar} ${leftCls(isStart || isRowCont)} ${rightCls(seg.endCol, isEnd)} ${isDragPreview ? "opacity-60" : ""} ${isAgentSel ? "brightness-125 ring-1 ring-inset ring-white/40" : ""} ${seg.stopped ? "opacity-60 border-dashed" : ""}`}
                            />
                            {label && (
                              <span className={`absolute top-1/2 -translate-y-1/2 z-10 pointer-events-none select-none text-xs font-bold whitespace-nowrap flex items-center justify-center ${style2.text}`}
                                style={{ left: 0, width: (visEnd - visStart + 1) * colW }}>
                                {label}
                              </span>
                            )}
                          </>
                        )
                      })()}
                      {showGrip(seg?.endCol ?? -1, isEnd, isDragPreview) && style2 && seg && !seg.stopped && (
                        <div draggable onDragStart={e => { e.stopPropagation(); onGripDragStart(e, seg.startCol) }} onDragEnd={onAgentDragEnd}
                          className={`absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize z-10 ${style2.grip} opacity-70 hover:opacity-100 rounded-r-sm`}>
                          <span className="text-white text-[8px] font-bold select-none">|</span>
                        </div>
                      )}
                      {isEnd && !isRowExit && sel?.type === "agent" && (sel as any).startCol === seg?.startCol && seg && !seg.stopped && !isDragPreview && (
                        <div className="absolute z-30 flex items-center gap-1" style={{ top: 2, right: 14 }}>
                          {discConfirmId === `agent-${seg.startCol}` ? (
                            <>
                              <button type="button"
                                onClick={e => { e.stopPropagation(); extendSegment(seg.startCol, nowCol ?? seg.endCol, true); setSel(null); setDiscConfirmId(null) }}
                                className="text-[8px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full hover:bg-red-600 border border-white/40 whitespace-nowrap">
                                ✓ Confirm
                              </button>
                              <button type="button"
                                onClick={e => { e.stopPropagation(); setDiscConfirmId(null) }}
                                className="text-[8px] text-white/70 hover:text-white px-1 whitespace-nowrap">
                                ✕
                              </button>
                            </>
                          ) : (
                            <button type="button"
                              onClick={e => { e.stopPropagation(); setDiscConfirmId(`agent-${seg.startCol}`) }}
                              className="text-[8px] font-semibold bg-black/30 text-white px-1.5 py-0.5 rounded-full border border-white/30 hover:bg-red-500/80 whitespace-nowrap">
                              ✕ Disc
                            </button>
                          )}
                        </div>
                      )}
                      {isStart && seg && (
                        <button type="button" onClick={e => { e.stopPropagation(); removeSegment(seg.startCol) }}
                          className="absolute top-0.5 right-3 z-10 opacity-0 hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity">
                          <X className="h-2.5 w-2.5" />
                        </button>
                      )}
                      {!seg && !isDragPreview && (() => {
                        const stoppedAgent = agents.find(a => a.stopped && a.endCol < ci)
                        return stoppedAgent ? (
                          <button type="button"
                            onClick={e => { e.stopPropagation(); continueAgent(stoppedAgent, ci) }}
                            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer">
                            <span className="text-[9px] font-bold text-emerald-500 dark:text-emerald-400 bg-white/80 dark:bg-black/40 px-1.5 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-700 whitespace-nowrap">
                              Continue?
                            </span>
                          </button>
                        ) : null
                      })()}
                    </div>
                  )
                })}
              </div>
            )
          })()}

          {/* Drug row */}
          <div className="flex min-h-[64px] border-t border-slate-100 dark:border-[#2a2a2a]">
            <div style={{ width: LABEL_W, minWidth: LABEL_W }} className={rowLabelCls + " py-3 flex items-start justify-end"}>Drugs</div>
            {rowCols.map(ci => {
              const colDrugs = data.drugs.filter(d => d.colIdx === ci)
              return (
                <div key={ci} style={{ width: colW, minWidth: colW }}
                  onDragOver={e => onDrugDragOver(e, ci)}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={e => onDrugDrop(e, ci)}
                  className={`border-l border-slate-100 dark:border-[#2a2a2a] px-1 py-1 space-y-0.5 transition-colors ${dragOver === ci ? "bg-violet-50 dark:bg-violet-900/20" : ""}`}>
                  {colDrugs.map(d => {
                    const gi = data.drugs.findIndex(g => g === d)
                    return (
                      <div key={gi} draggable
                        title={`${d.name}${d.dose ? " — " + d.dose + " " + d.unit : ""}`}
                        onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData("item-type","move-drug"); e.dataTransfer.setData("item-idx", String(gi)); e.dataTransfer.effectAllowed="move" }}
                        onClick={e => { e.stopPropagation(); setSel({ type:"drug", idx:gi }) }}
                        onDoubleClick={e => { e.stopPropagation(); setDoseEditDrug({ idx: gi, dose: d.dose, unit: d.unit, rect: e.currentTarget.getBoundingClientRect() }) }}
                        className={`flex items-start gap-1 rounded px-2 py-1 group cursor-grab active:cursor-grabbing transition-colors ${sel?.type === "drug" && sel.idx === gi ? "bg-violet-400 dark:bg-violet-600 ring-2 ring-violet-500 dark:ring-violet-400" : "bg-violet-100 dark:bg-violet-900/40 hover:bg-violet-200 dark:hover:bg-violet-800/40"}`}>
                        <span className="text-[10px] font-semibold text-violet-800 dark:text-violet-300 leading-tight truncate flex-1">
                          {d.name}{d.dose && <><br /><span className="font-normal font-mono text-[9px] opacity-90">{d.dose} {d.unit}</span></>}
                        </span>
                        <button type="button" tabIndex={-1} onClick={() => removeDrug(gi)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-violet-400 hover:text-violet-700 shrink-0 mt-0.5">
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    )
                  })}
                  <button type="button" tabIndex={-1}
                    onClick={e => { const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); setDrugPicker({ ci, rect }); setDpSearch("") }}
                    className="w-full mt-1 flex items-center justify-center gap-0.5 text-[10px] font-semibold rounded border border-dashed border-violet-300 dark:border-violet-700 text-violet-400 dark:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20 py-1 transition-colors">
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              )
            })}
          </div>

          {/* Infusion rows */}
          {[...new Set((data.infusions ?? []).map(i => i.name))].map(drugName => {
            const segs  = (data.infusions ?? []).filter(i => i.name === drugName)
            const color = segs[0]?.color ?? "#64748b"
            const isBusyMovingBar  = movingInf !== null && segs.some(s => s.id === movingInf.id)
            const isBusyMovingPill = movingRatePill !== null && segs.some(s => s.id === movingRatePill.infId)
            return (
              <div key={drugName} className="flex items-stretch border-t border-slate-100 dark:border-[#2a2a2a] relative" style={{ minHeight: 52 }}>
                <div style={{ width: LABEL_W, minWidth: LABEL_W }} className="flex flex-col items-end justify-end pr-2 pb-1.5 gap-0 select-none shrink-0">
                  <span className="text-xs font-semibold uppercase tracking-wide leading-tight" style={{ color }}>{drugName}</span>
                  <span className="text-[10px] text-slate-300 dark:text-[#555] leading-tight">infusion</span>
                </div>
                {rowCols.map(ci => {
                  const seg = segs.find(s => ci >= s.startCol && ci <= s.endCol)
                  // Right-grip extension preview (cells beyond seg.endCol but within extInfHover)
                  const rightPreviewSeg = !seg && extendingInf
                    ? segs.find(s => s.id === extendingInf && ci > s.endCol && extInfHover !== null && ci <= extInfHover) ?? null : null
                  // Left-grip extension preview (cells before seg.startCol down to extInfLeftHover)
                  const leftPreviewSeg = !seg && extendingInfLeft
                    ? segs.find(s => s.id === extendingInfLeft && extInfLeftHover !== null && ci >= extInfLeftHover && ci < s.startCol) ?? null : null
                  // Bar-move preview position
                  const previewStart = isBusyMovingBar && movingInfCol !== null ? movingInf!.origStart + (movingInfCol - movingInf!.fromCol) : null
                  const previewEnd   = previewStart !== null ? previewStart + (movingInf!.origEnd - movingInf!.origStart) : null
                  const isPreview    = !seg && !rightPreviewSeg && !leftPreviewSeg && previewStart !== null && previewEnd !== null && ci >= previewStart && ci <= previewEnd
                  // Effective end follows right-grip hover
                  const effectiveEnd  = seg && extendingInf === seg.id && extInfHover !== null ? Math.max(extInfHover, seg.startCol) : (seg?.endCol ?? -1)
                  const isActualStart = seg?.startCol === ci
                  const isActualEnd   = seg !== null && ci === effectiveEnd
                  const isRowCont     = !isActualStart && seg != null && ci === colStart
                  const isRowExit     = seg != null && barContinues(effectiveEnd) && ci === colEnd - 1 && !isActualEnd
                  // Rate pill: shown at start of each distinct rate period
                  const ratePill: { rate: number; unit: string; draggable: boolean } | null = seg ? (
                    ci === seg.startCol ? { rate: seg.rate, unit: seg.unit, draggable: false }
                    : (seg.rateChanges ?? []).find(rc => rc.col === ci) ? { ...(seg.rateChanges!.find(rc => rc.col === ci)!), draggable: true }
                    : null
                  ) : null
                  return (
                    <div key={ci} style={{ width: colW, minWidth: colW }}
                      className="relative border-l border-slate-100 dark:border-[#2a2a2a]"
                      onDragOver={e => {
                        if (extendingInf) { e.preventDefault(); e.stopPropagation(); const s = segs.find(s => s.id === extendingInf); if (s) setExtInfHover(Math.max(ci, s.startCol)) }
                        else if (extendingInfLeft) { e.preventDefault(); e.stopPropagation(); const s = segs.find(s => s.id === extendingInfLeft); if (s && ci <= s.endCol) setExtInfLeftHover(Math.max(0, ci)) }
                        else if (isBusyMovingBar) { e.preventDefault(); setMovingInfCol(ci) }
                        else if (isBusyMovingPill) { e.preventDefault(); setMovingRatePillCol(ci) }
                      }}
                      onDrop={e => {
                        if (extendingInf) { e.preventDefault(); const s = segs.find(s => s.id === extendingInf); if (s) extendInfusion(extendingInf, Math.max(ci, s.startCol)); setExtendingInf(null); setExtInfHover(null) }
                        else if (extendingInfLeft) { e.preventDefault(); extendInfusionLeft(extendingInfLeft, Math.max(0, extInfLeftHover ?? ci)); setExtendingInfLeft(null); setExtInfLeftHover(null) }
                        else if (isBusyMovingBar) {
                          e.preventDefault()
                          const delta = ci - movingInf!.fromCol
                          const newStart = movingInf!.origStart + delta
                          if (newStart < 0) { setDeleteInfPrompt(movingInf!.id) }
                          else { onChangeRef.current({ ...dataRef.current, infusions: (dataRef.current.infusions ?? []).map(i => i.id === movingInf!.id ? { ...i, startCol: newStart, endCol: movingInf!.origEnd + delta, rateChanges: (i.rateChanges ?? []).map(rc => ({ ...rc, col: rc.col + delta })) } : i) }) }
                          setMovingInf(null); setMovingInfCol(null)
                        } else if (isBusyMovingPill) {
                          e.preventDefault()
                          // Only copy if target cell has an infusion; fromCol=null keeps original pill
                          if (seg) applyInfRateChange(movingRatePill!.infId, null, ci, movingRatePill!.rate, movingRatePill!.unit)
                          setMovingRatePill(null); setMovingRatePillCol(null)
                        }
                      }}>

                      {/* Rate pill — top of cell, only at rate-period start columns */}
                      {ratePill && (
                        <div className="absolute top-0 inset-x-0 flex items-start justify-center pt-0.5 z-20" style={{ height: 22 }}>
                          <div
                            draggable
                            onClick={e => { e.stopPropagation(); setInfMenu({ segId: seg!.id, name: seg!.name, color, rect: e.currentTarget.getBoundingClientRect(), stopped: seg!.stopped, fromPillCol: ci }) }}
                            onDragStart={e => { e.stopPropagation(); setMovingRatePill({ infId: seg!.id, fromCol: ci, rate: ratePill.rate, unit: ratePill.unit }) }}
                            onDragEnd={() => { setMovingRatePill(null); setMovingRatePillCol(null) }}
                            className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full border whitespace-nowrap select-none cursor-grab active:cursor-grabbing hover:opacity-80 transition-opacity"
                            style={{ color, borderColor: color + "80", backgroundColor: color + "18" }}>
                            {ratePill.rate} {ratePill.unit}
                          </div>
                        </div>
                      )}

                      {/* Infusion bar — lower portion of cell */}
                      {seg && (
                        <>
                          <div
                            draggable={!seg.stopped}
                            onDragStart={!seg.stopped ? e => { e.stopPropagation(); setMovingInf({ id: seg.id, origStart: seg.startCol, origEnd: seg.endCol, fromCol: ci }) } : undefined}
                            onDragEnd={() => { setMovingInf(null); setMovingInfCol(null) }}
                            onClick={e => { e.stopPropagation(); setSel(s => s?.type==="infusion"&&s.id===seg.id ? null : { type:"infusion", id:seg.id }) }}
                            title={!seg.stopped ? "Click to select · Double-click for options · Drag to move" : undefined}
                            className={`absolute left-0 right-0 border-y ${!seg.stopped ? "cursor-grab active:cursor-grabbing" : ""} ${leftCls(isActualStart || isRowCont)} ${rightCls(seg.endCol, isActualEnd && !isRowExit)} ${seg.stopped ? "opacity-50 border-dashed" : hoverDiscontinue === seg.id ? "opacity-50" : ""}`}
                            style={{
                              top: 22, bottom: 4,
                              backgroundColor: sel?.type==="infusion"&&sel.id===seg.id ? color+"99":color+"44",
                              borderColor: sel?.type==="infusion"&&sel.id===seg.id ? color : color+"88",
                              borderStyle: seg.stopped || hoverDiscontinue === seg.id ? "dashed" : "solid",
                              boxShadow: sel?.type==="infusion"&&sel.id===seg.id ? `0 0 0 1.5px ${color}` : undefined,
                            }}>
                            {/* Drug name — centred over visible span */}
                            {(isActualStart || isRowCont) && (() => {
                              const visStart = Math.max(seg.startCol, colStart)
                              const visEnd   = Math.min(seg.endCol, colEnd - 1)
                              return (
                                <span className="absolute top-1/2 -translate-y-1/2 text-[10px] font-bold whitespace-nowrap pointer-events-none select-none text-center block"
                                  style={{ color, left: 0, width: (visEnd - visStart + 1) * colW }}>
                                  {seg.name}
                                </span>
                              )
                            })()}
                          </div>
                          {/* Left grip — shown only when selected */}
                          {isActualStart && sel?.type==="infusion" && sel.id===seg.id && !seg.stopped && (
                            <div draggable
                              onDragStart={e => { e.stopPropagation(); setExtendingInfLeft(seg.id) }}
                              onDragEnd={() => { setExtendingInfLeft(null); setExtInfLeftHover(null) }}
                              className="absolute left-0 z-20 flex items-center justify-center cursor-col-resize rounded-l-sm"
                              style={{ top: 22, bottom: 4, width: 10, backgroundColor: color }}>
                              <span className="text-white text-[8px] font-bold select-none">|</span>
                            </div>
                          )}
                          {/* Right grip — shown only when selected */}
                          {isActualEnd && sel?.type==="infusion" && sel.id===seg.id && !seg.stopped && !isRowExit && (
                            <div draggable
                              onDragStart={e => { e.stopPropagation(); setExtendingInf(seg.id) }}
                              onDragEnd={() => { setExtendingInf(null); setExtInfHover(null) }}
                              className="absolute right-0 z-20 flex items-center justify-center cursor-col-resize rounded-r-sm"
                              style={{ top: 22, bottom: 4, width: 10, backgroundColor: color }}>
                              <span className="text-white text-[8px] font-bold select-none">|</span>
                            </div>
                          )}
                          {/* Inline discontinue button */}
                          {isActualEnd && !isRowExit && sel?.type==="infusion" && sel.id===seg.id && !seg.stopped && (
                            <div className="absolute z-30 flex items-center gap-1" style={{ top: 24, right: 14 }}>
                              {discConfirmId === seg.id ? (
                                <>
                                  <button type="button"
                                    onClick={e => { e.stopPropagation(); extendInfusion(seg.id, nowCol ?? seg.endCol, true); setSel(null); setDiscConfirmId(null) }}
                                    className="text-[8px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full hover:bg-red-600 border border-white/40 whitespace-nowrap">
                                    ✓ Confirm
                                  </button>
                                  <button type="button"
                                    onClick={e => { e.stopPropagation(); setDiscConfirmId(null) }}
                                    className="text-[8px] text-white/60 hover:text-white px-1 whitespace-nowrap">
                                    ✕
                                  </button>
                                </>
                              ) : (
                                <button type="button"
                                  onClick={e => { e.stopPropagation(); setDiscConfirmId(seg.id) }}
                                  className="text-[8px] font-semibold bg-black/30 text-white px-1.5 py-0.5 rounded-full border border-white/30 hover:bg-red-500/80 whitespace-nowrap">
                                  ✕ Disc
                                </button>
                              )}
                            </div>
                          )}
                        </>
                      )}

                      {/* Ghost bar — whole-bar move */}
                      {isPreview && (
                        <div className="absolute left-0 right-0 border border-dashed opacity-25"
                          style={{ top: 22, bottom: 4, backgroundColor: color + "33", borderColor: color,
                            borderRadius: ci === previewStart ? "6px 0 0 6px" : ci === previewEnd ? "0 6px 6px 0" : 0 }} />
                      )}
                      {/* Ghost bar — right-grip extension preview */}
                      {rightPreviewSeg && (
                        <>
                          <div className="absolute left-0 right-0 opacity-40 border-y"
                            style={{ top: 22, bottom: 4, backgroundColor: color + "33", borderColor: color + "88",
                              borderRight: ci === extInfHover ? `1px solid ${color}88` : undefined,
                              borderRadius: ci === extInfHover ? "0 6px 6px 0" : 0 }} />
                          {/* Grip handle at hover position */}
                          {ci === extInfHover && sel?.type==="infusion" && sel.id===rightPreviewSeg.id && (
                            <div className="absolute right-0 z-20 flex items-center justify-center rounded-r-sm"
                              style={{ top: 22, bottom: 4, width: 10, backgroundColor: color, opacity: 0.7 }}>
                              <span className="text-white text-[8px] font-bold select-none">|</span>
                            </div>
                          )}
                        </>
                      )}
                      {/* Ghost bar — left-grip extension preview */}
                      {leftPreviewSeg && (
                        <>
                          <div className="absolute left-0 right-0 opacity-40 border-y"
                            style={{ top: 22, bottom: 4, backgroundColor: color + "33", borderColor: color + "88",
                              borderLeft: extInfLeftHover !== null && ci === extInfLeftHover ? `1px solid ${color}88` : undefined,
                              borderRadius: extInfLeftHover !== null && ci === extInfLeftHover ? "6px 0 0 6px" : 0 }} />
                          {/* Grip handle at hover position */}
                          {extInfLeftHover !== null && ci === extInfLeftHover && sel?.type==="infusion" && sel.id===leftPreviewSeg.id && (
                            <div className="absolute left-0 z-20 flex items-center justify-center rounded-l-sm"
                              style={{ top: 22, bottom: 4, width: 10, backgroundColor: color, opacity: 0.7 }}>
                              <span className="text-white text-[8px] font-bold select-none">|</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* Fluid rows */}
          {computeFluidRows(data.fluids ?? []).map(({ label, segs, color }) => {
            const nowFluidSeg = isActiveRow && nowCol !== null ? segs.find(s => s.startCol <= nowCol && s.endCol >= nowCol) : null
            return (
              <div key={label} className="flex min-h-[64px] border-t border-slate-100 dark:border-[#2a2a2a] relative">
                <div style={{ width: LABEL_W, minWidth: LABEL_W }} className="flex flex-col items-end justify-center pr-2 py-2 gap-0 select-none shrink-0">
                  <span className="text-xs font-semibold uppercase tracking-wide leading-tight" style={{ color }}>{label}</span>
                  <span className="text-[10px] text-slate-300 dark:text-[#555] leading-tight">fluid</span>
                </div>
                {rowCols.map(ci => {
                  const committedSeg  = segs.find(s => ci >= s.startCol && ci <= s.endCol)
                  const previewSeg    = !committedSeg && extendingFluid && extFluidHover !== null ? segs.find(s => s.id === extendingFluid && ci > s.endCol && ci <= extFluidHover) ?? null : null
                  const seg           = committedSeg ?? previewSeg
                  const isDragPreview = !committedSeg && !!previewSeg
                  const isActualStart = seg?.startCol === ci
                  const isRowCont     = !isActualStart && seg != null && ci === colStart
                  const effectiveEnd  = seg && extendingFluid === seg.id && extFluidHover !== null ? Math.max(extFluidHover, seg.startCol) : (seg?.endCol ?? -1)
                  const isActualEnd   = seg !== null && ci === effectiveEnd
                  const isRowExit     = seg != null && barContinues(seg.endCol) && ci === colEnd - 1 && !isActualEnd
                  const isSel         = seg && sel?.type==="fluid" && (sel as any).id===seg.id
                  const stoppedSeg    = !seg
                    ? segs.find(s => s.stopped && s.endCol < ci) ?? null : null
                  return (
                    <div key={ci} style={{ width: colW, minWidth: colW }}
                      className="group relative border-l border-slate-100 dark:border-[#2a2a2a] flex items-center"
                      onDragOver={e => { if (!extendingFluid || e.dataTransfer.types.includes("extend-agent")) return; e.preventDefault(); e.stopPropagation(); const s = segs.find(s => s.id===extendingFluid); if (s) setExtFluidHover(Math.max(ci, s.startCol)) }}
                      onDrop={e => { if (!extendingFluid) return; e.preventDefault(); const s = segs.find(s => s.id===extendingFluid); if (s) extendFluid(extendingFluid, Math.max(ci, s.startCol)); setExtendingFluid(null); setExtFluidHover(null) }}>
                      {seg && (
                        <>
                          <div onClick={e => { e.stopPropagation(); if (isActualStart || isRowCont) setSel({ type:"fluid", id:seg.id }) }}
                            onDoubleClick={e => { e.stopPropagation(); if (seg.stopped) resumeFluid(seg.id) }}
                            title={seg.stopped ? "Double-click to resume" : undefined}
                            className={`absolute inset-y-1 border-y cursor-pointer ${leftCls(isActualStart || isRowCont)} ${rightCls(seg.endCol, isActualEnd && !isRowExit)} ${isDragPreview ? "opacity-50" : ""} ${seg.stopped ? "opacity-60 border-dashed" : ""}`}
                            style={{ backgroundColor: isSel ? color+"88":color+"33", borderColor: isSel ? color:color+"88", boxShadow: isSel ? `0 0 0 1.5px ${color}` : undefined }}
                          />
                          {(isActualStart || isRowCont) && (() => {
                            const visStart = Math.max(seg.startCol, colStart)
                            const visEnd   = Math.min(effectiveEnd, colEnd - 1)
                            const visW     = (visEnd - visStart + 1) * colW
                            return (
                              <span className="absolute top-1/2 -translate-y-1/2 z-10 pointer-events-none select-none text-[10px] font-bold whitespace-nowrap flex items-center justify-center"
                                style={{ color, left: 0, width: visW }}>
                                {seg.name}{seg.volume ? ` * ${seg.volume} ml` : ""}
                              </span>
                            )
                          })()}
                        </>
                      )}
                      {showGrip(seg?.endCol ?? -1, isActualEnd, isDragPreview) && !isRowExit && seg && !seg.stopped && (
                        <div draggable onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData("ext-fluid", seg.id); setExtendingFluid(seg.id) }} onDragEnd={() => { setExtendingFluid(null); setExtFluidHover(null) }}
                          className="absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize z-10 opacity-70 hover:opacity-100 rounded-r-sm" style={{ backgroundColor: color }}>
                          <span className="text-white text-[8px] font-bold select-none">|</span>
                        </div>
                      )}
                      {/* Inline fluid discontinue button — always at last cell, visible on hover or when selected */}
                      {isActualEnd && !isRowExit && seg && !seg.stopped && !isDragPreview && (
                        <div className={`absolute z-30 flex items-center justify-center transition-opacity ${isSel ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                          style={{ top: 4, right: 14, bottom: 4 }}>
                          <button type="button"
                            onClick={e => { e.stopPropagation(); setDiscFluidState({ id: seg.id, volInput: "0", rect: e.currentTarget.getBoundingClientRect(), fullBag: null }) }}
                            className="text-[8px] font-semibold bg-black/30 text-white px-1.5 py-0.5 rounded-full border border-white/30 hover:bg-red-500/80 whitespace-nowrap">
                            ✕ Disc
                          </button>
                        </div>
                      )}
                      {(isActualStart || isRowCont) && seg && (
                        <button type="button" onClick={e => { e.stopPropagation(); removeFluid(seg.id) }}
                          className="absolute top-0.5 right-4 z-10 opacity-0 hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity">
                          <X className="h-2.5 w-2.5" />
                        </button>
                      )}
                      {stoppedSeg && (
                        <button type="button"
                          onClick={e => { e.stopPropagation(); continueFluid(stoppedSeg, ci) }}
                          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer">
                          <span className="text-[9px] font-bold text-emerald-500 dark:text-emerald-400 bg-white/80 dark:bg-black/40 px-1.5 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-700 whitespace-nowrap">
                            Continue?
                          </span>
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* Fluid drop zone */}
          <div className="flex min-h-[40px] border-t border-slate-200 dark:border-[#2e2e2e] bg-cyan-50/20 dark:bg-cyan-950/5">
            <div style={{ width: LABEL_W, minWidth: LABEL_W }} className={rowLabelCls + " py-1.5 flex items-center justify-end opacity-50"}>Fluids</div>
            {rowCols.map(ci => (
              <div key={ci} style={{ width: colW, minWidth: colW }}
                onDragOver={e => { if (e.dataTransfer.types.includes("ext-inf") || e.dataTransfer.types.includes("ext-fluid") || e.dataTransfer.types.includes("extend-agent")) return; e.preventDefault(); setFluidDragOver(ci) }}
                onDragLeave={() => setFluidDragOver(null)}
                onDrop={e => onFluidDrop(e, ci)}
                className={`border-l border-slate-100 dark:border-[#2a2a2a] flex items-center justify-center transition-colors ${fluidDragOver===ci ? "bg-cyan-100 dark:bg-cyan-900/20" : ""}`}>
                <button type="button" tabIndex={-1}
                  onClick={e => { const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); setFluidPicker({ ci, rect }); setFpSearch("") }}
                  className="flex items-center justify-center gap-0.5 text-[10px] font-semibold rounded border border-dashed border-cyan-300 dark:border-cyan-700 text-cyan-400 dark:text-cyan-500 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 px-1 py-1 transition-colors w-[72px]">
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

        </div>
      </div>
    )
  }

  return (
    <>
    <div className="space-y-3">
      {/* Chart toggle + layout toggle on same row */}
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => setChartOpen(o => !o)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors select-none ${
            chartOpen
              ? "bg-slate-700 dark:bg-[#3a3a3a] border-slate-600 dark:border-[#555] text-white dark:text-slate-100"
              : "bg-white dark:bg-[#2a2a2a] border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-[#999] hover:border-slate-300"}`}>
          {chartOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {chartOpen ? "Hide chart" : "Show chart"}
          {chartOpen && (
            <span className="flex items-center gap-2 ml-1 text-[10px] font-normal opacity-70">
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-[2px] bg-red-400 rounded" />BP</span>
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-[2px] bg-green-500 rounded" />HR</span>
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-[2px] bg-cyan-500 rounded" />SpO2</span>
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-[2px] bg-amber-500 rounded" />EtCO2</span>
            </span>
          )}
        </button>
        <button type="button" onClick={() => setShowHotkeys(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors select-none bg-white dark:bg-[#2a2a2a] border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-[#999] hover:border-slate-300 dark:hover:border-[#555]">
          ⌨ Shortcuts
        </button>
      </div>

      <div className="flex gap-3 items-start">
        {/* в"Ђв"Ђ Timetable rows */}
        <div ref={rowsContainerRef} className="flex-1 min-w-0 space-y-2" onClick={() => { setSel(null); setDiscConfirmId(null) }}>
          {layout === "expand"
            ? Array.from({ length: Math.ceil(colCount / ROW_COLS) }, (_, ri) => renderRow(ri))
            : (
              <div className="overflow-x-auto" onWheel={e => e.stopPropagation()}>
                <div style={{ minWidth: LABEL_W + colCount * colW }}>
                  {renderRow(0, 0, colCount)}
                </div>
              </div>
            )
          }

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => setColCount(n => n + ROW_COLS)}
              className="text-xs font-medium text-slate-500 dark:text-[#999] hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] active:bg-slate-200 dark:active:bg-[#333] active:text-slate-900 dark:active:text-white border border-slate-200 dark:border-[#3a3a3a] hover:border-slate-400 dark:hover:border-[#555] rounded-full px-3 py-1 transition-all cursor-pointer select-none">
              + 1 hr
            </button>
            <button type="button"
              onClick={() => setColCount(n => Math.max(ROW_COLS, n - ROW_COLS))}
              disabled={colCount <= ROW_COLS}
              className="text-xs font-medium text-slate-500 dark:text-[#999] hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] active:bg-slate-200 dark:active:bg-[#333] active:text-slate-900 dark:active:text-white disabled:opacity-30 disabled:cursor-not-allowed border border-slate-200 dark:border-[#3a3a3a] hover:border-slate-400 dark:hover:border-[#555] rounded-full px-3 py-1 transition-all cursor-pointer select-none">
              - 1 hr
            </button>
            <span className="text-xs text-slate-400 dark:text-[#666]">
              Total: <span className={`font-semibold ${endTime ? "text-slate-600 dark:text-[#aaa]" : "text-amber-500 dark:text-amber-400"}`}>
                {endTime ? calcDuration(roundedStart, endTime, colCount) : "Ongoing"}
              </span>
              {endTime && <span className="ml-1 text-[10px] text-slate-300 dark:text-[#555]">({roundedStart} {"->"} {toHHMM(endTime)})</span>}
            </span>
            <div className="ml-auto relative">
              {endTime ? (
                <div className="flex items-center gap-2">
                  {resumeSecsLeft > 0 && onResumeCase && (() => {
                    const deadline = endedAtRef.current ? new Date(endedAtRef.current.getTime() + 30 * 60 * 1000) : null
                    const hhmm = deadline ? `${String(deadline.getHours()).padStart(2,"0")}:${String(deadline.getMinutes()).padStart(2,"0")}` : ""
                    return (
                      <>
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 whitespace-nowrap">
                          Resumable until {hhmm}
                        </span>
                        <button type="button" onClick={onResumeCase}
                          className="text-xs font-semibold px-3 py-1.5 rounded-full border-2 border-amber-500 text-amber-600 dark:text-amber-400 hover:bg-amber-500 hover:text-white dark:hover:bg-amber-600 transition-colors">
                          Resume Case
                        </button>
                      </>
                    )
                  })()}
                  <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700">
                    Case ended
                  </span>
                </div>
              ) : (
                <>
                  <button type="button"
                    onClick={() => setShowEndPrompt(v => !v)}
                    className="text-xs font-semibold px-4 py-1.5 rounded-full border-2 border-red-400 text-red-500 hover:bg-red-500 hover:text-white dark:border-red-500 dark:text-red-400 dark:hover:bg-red-600 dark:hover:text-white transition-colors">
                    End Case
                  </button>
                  {showEndPrompt && (
                    <div className="absolute bottom-full right-0 mb-2 z-50 bg-white dark:bg-[#2a2a2a] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-xl p-3 space-y-2 min-w-[160px]">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">End case...</p>
                      <button type="button"
                        onClick={() => { setShowEndPrompt(false); setShowEndModal(true) }}
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
                </>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
    {/* -- Fluid picker portal -- */}
    {fluidPicker && typeof document !== "undefined" && createPortal(
      (() => {
        const POP_W = 240
        const r = fluidPicker.rect
        const spaceBelow = window.innerHeight - r.bottom
        const showAbove  = spaceBelow < 300
        const left = Math.max(8, Math.min(r.left, window.innerWidth - POP_W - 8))
        const top  = showAbove ? r.top - 4 : r.bottom + 4
        const filtered = fpSearch.trim()
          ? QUICK_FLUIDS.map(c => ({ ...c, fluids: c.fluids.filter(f => f.name.toLowerCase().includes(fpSearch.toLowerCase())) })).filter(c => c.fluids.length > 0)
          : QUICK_FLUIDS
        return (
          <>
            <div className="fixed inset-0 z-[9990]" onClick={() => setFluidPicker(null)} />
            <div style={{ position:"fixed", left, top, width: POP_W, zIndex:9991, transform: showAbove ? "translateY(-100%)" : undefined }}
              className="bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}>
              <div className="p-2 border-b border-slate-100 dark:border-[#2a2a2a]">
                <input autoFocus type="text" placeholder="Search fluid..." value={fpSearch}
                  onChange={e => setFpSearch(e.target.value)}
                  onKeyDown={e => e.key === "Escape" && setFluidPicker(null)}
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] text-slate-800 dark:text-slate-200 placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                />
              </div>
              <div className="max-h-56 overflow-y-auto p-2 space-y-2">
                {filtered.map(cat => (
                  <div key={cat.cat}>
                    <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#666] mb-1">{cat.cat}</p>
                    <div className="flex flex-wrap gap-1">
                      {cat.fluids.map(fluid => (
                        <button key={fluid.name} type="button"
                          onClick={() => {
                            const { ci, rect } = fluidPicker!
                            setFluidPicker(null)
                            const anchor = { getBoundingClientRect: () => ({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height, x: rect.left, y: rect.top, toJSON: () => {} }) } as HTMLElement
                            setFp({ col: ci, name: fluid.name, unit: "ml", mode: "fluid",
                              dose: "", doseHint: "", fluidScale: "L",
                              rate: 0, rateUnit: "ml", rateUnits: ["ml"], rateMin: 0, rateMax: 2000, rateStep: 50,
                              color: "#06b6d4",
                              anchor: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width },
                            })
                          }}
                          className={`text-xs font-medium px-2 py-1 rounded border cursor-pointer hover:opacity-80 transition-opacity ${cat.color}`}>
                          {fluid.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {filtered.length === 0 && <p className="text-xs text-slate-400 dark:text-[#666] text-center py-4">No fluids found</p>}
              </div>
            </div>
          </>
        )
      })()
    ,
      document.body
    )}
    {/* -- Drug picker portal -- */}
    {drugPicker && typeof document !== "undefined" && createPortal(
      (() => {
        const POP_W = 260
        const spaceBelow = window.innerHeight - drugPicker.rect.bottom
        const showAbove  = spaceBelow < 320
        const left = Math.max(8, Math.min(drugPicker.rect.left, window.innerWidth - POP_W - 8))
        const top  = showAbove ? drugPicker.rect.top - 4 : drugPicker.rect.bottom + 4
        const allCats = [
          ...QUICK_DRUGS,
          ...(customDrugs.length > 0 ? [{ cat:"Custom", color:"bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-300 border-violet-200 dark:border-violet-700", drugs: customDrugs.map(d => ({ name:d.name, unit:d.unit })) }] : [])
        ]
        const filtered = dpSearch.trim()
          ? allCats.map(c => ({ ...c, drugs: c.drugs.filter(d => d.name.toLowerCase().includes(dpSearch.toLowerCase())) })).filter(c => c.drugs.length > 0)
          : allCats
        return (
          <>
            <div className="fixed inset-0 z-[9990]" onClick={() => setDrugPicker(null)} />
            <div style={{ position:"fixed", left, top, width:POP_W, zIndex:9991, transform: showAbove ? "translateY(-100%)" : undefined }}
              className="bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}>
              <div className="p-2 border-b border-slate-100 dark:border-[#2a2a2a]">
                <input autoFocus type="text" placeholder="Search drug..." value={dpSearch}
                  onChange={e => setDpSearch(e.target.value)}
                  onKeyDown={e => e.key === "Escape" && setDrugPicker(null)}
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] text-slate-800 dark:text-slate-200 placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-400"
                />
              </div>
              <div className="max-h-64 overflow-y-auto p-2 space-y-2">
                {filtered.map(cat => (
                  <div key={cat.cat}>
                    <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#666] mb-1">{cat.cat}</p>
                    <div className="flex flex-wrap gap-1">
                      {cat.drugs.map(drug => (
                        <button key={drug.name} type="button"
                          onClick={() => {
                            const { ci, rect } = drugPicker!
                            setDrugPicker(null)
                            const anchor = { getBoundingClientRect: () => ({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height, x: rect.left, y: rect.top, toJSON: () => ({}) }) } as unknown as HTMLElement
                            openFP(ci, drug.name, drug.unit, anchor)
                          }}
                          className={`text-xs font-medium px-2 py-1 rounded border cursor-pointer hover:opacity-80 transition-opacity ${cat.color}`}>
                          {drug.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {filtered.length === 0 && <p className="text-xs text-slate-400 dark:text-[#666] text-center py-4">No drugs found</p>}
              </div>
              <div className="p-2 border-t border-slate-100 dark:border-[#2a2a2a]">
                <button type="button"
                  onClick={e => { setDrugPicker(null); const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); setCustomDrugName(""); setCustomDrugUnit("mg"); setCustomDrugDose(""); setCustomDrugRect(rect); setCustomDrugOpen(true) }}
                  className="w-full text-xs font-semibold px-2 py-1.5 rounded border border-dashed border-violet-300 dark:border-violet-700 text-violet-500 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors">
                  + custom drug
                </button>
              </div>
            </div>
          </>
        )
      })()
    ,
      document.body
    )}
    {/* в"Ђв"Ђ Custom drug portal в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ */}
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
              <input autoFocus type="text" placeholder="Drug name..."
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
    {/* в"Ђв"Ђ Fluid conflict portal в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ */}
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
    {/* в"Ђв"Ђ Agent picker portal в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ */}
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
                  + N2O
                </button>
                {pickerN2o !== null && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-slate-500 font-semibold">FiN2O</span>
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
    {/* в"Ђв"Ђ Floating prompt portal в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ */}
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
                        {s==="S" ? "Small <=100 ml" : "Large <=2000 ml"}
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
                      {["mg","mcg","ml","g","IU"].map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                  <button type="button" onClick={fpCommitBolus}
                    className="w-full text-xs font-semibold bg-slate-700 hover:bg-slate-600 dark:bg-[#2a2a2a] dark:hover:bg-[#383838] dark:border dark:border-[#4a4a4a] text-white rounded-lg py-1.5">Administer</button>
                </>
              )}

              {fp.mode === "infusion" && (
                <>
                  {/* Concentration picker — local anaesthetics only */}
                  {LA_CONCENTRATIONS[fp.name] && (
                    <div className="space-y-1.5 pb-1 border-b border-slate-100 dark:border-[#2a2a2a]">
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Concentration</p>
                      <div className="flex flex-wrap gap-1">
                        {LA_CONCENTRATIONS[fp.name].map(c => (
                          <button key={c} type="button"
                            onClick={() => setFp(f => f ? {...f, concentration: f.concentration===c ? undefined : c, customConc:""} : f)}
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-all ${
                              fp.concentration===c
                                ? "bg-sky-500 border-sky-500 text-white"
                                : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-sky-400 dark:hover:border-sky-600"
                            }`}>{c}</button>
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-slate-400 shrink-0">Custom:</span>
                        <input type="number" min="0.01" max="20" step="0.001" placeholder="e.g. 0.75"
                          value={fp.customConc ?? ""}
                          onChange={e => {
                            const v = e.target.value
                            setFp(f => f ? {...f, customConc:v, concentration: v ? v+"%" : undefined} : f)
                          }}
                          className="w-14 text-[10px] bg-white dark:bg-[#2a2a2a] border border-slate-200 dark:border-[#3a3a3a] rounded-md px-1.5 py-0.5 outline-none focus:border-sky-400 [appearance:textfield]" />
                        <span className="text-[9px] text-slate-400">%</span>
                      </div>
                    </div>
                  )}

                  {/* Unit pills — hidden for local anaesthetics (always mL/hr) */}
                  {!LA_CONCENTRATIONS[fp.name] && (
                    <div className="flex flex-wrap gap-1">
                      {fp.rateUnits.map(u => (
                        <button key={u} type="button" onClick={() => setFp(f => f ? {...f, rateUnit:u} : f)}
                          className={`text-[9px] px-1.5 py-0.5 rounded-md border transition-colors ${fp.rateUnit===u ? "bg-blue-500 border-blue-500 text-white" : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400"}`}>
                          {u}
                        </button>
                      ))}
                    </div>
                  )}

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
    {doseEditDrug && createPortal(
      <div className="fixed inset-0 z-50" onClick={() => setDoseEditDrug(null)}>
        <div className="absolute bg-white dark:bg-[#2a2a2a] rounded-xl shadow-2xl p-3 space-y-2 w-52 border border-slate-200 dark:border-[#3a3a3a]"
          style={{ top: Math.min(doseEditDrug.rect.bottom + 4, window.innerHeight - 160), left: Math.min(doseEditDrug.rect.left, window.innerWidth - 220) }}
          onClick={e => e.stopPropagation()}>
          <p className="text-[10px] font-semibold text-violet-500 uppercase tracking-wide">Change Dose</p>
          <div className="flex items-center gap-1.5">
            <input type="number" value={doseEditDrug.dose}
              onChange={e => setDoseEditDrug(prev => prev ? { ...prev, dose: e.target.value } : null)}
              autoFocus
              className="flex-1 text-sm border border-slate-200 dark:border-[#3a3a3a] rounded-lg px-2 py-1 bg-white dark:bg-[#1e1e1e] focus:outline-none focus:ring-1 focus:ring-violet-400 [appearance:textfield]"
              placeholder="0" />
            <select value={doseEditDrug.unit}
              onChange={e => setDoseEditDrug(prev => prev ? { ...prev, unit: e.target.value } : null)}
              className="text-xs border border-slate-200 dark:border-[#3a3a3a] rounded-lg px-1 py-1 bg-white dark:bg-[#1e1e1e] focus:outline-none">
              {["mg","mcg","g","ml","IU"].map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
          <button type="button"
            onClick={() => {
              const next = [...data.drugs]
              next[doseEditDrug.idx] = { ...next[doseEditDrug.idx], dose: doseEditDrug.dose, unit: doseEditDrug.unit }
              onChange({ ...data, drugs: next })
              setDoseEditDrug(null)
            }}
            className="w-full text-xs font-semibold bg-violet-500 hover:bg-violet-600 text-white rounded-lg py-1.5 transition-colors">
            Apply
          </button>
        </div>
      </div>,
      document.body
    )}
    {/* Infusion context menu */}
    {infMenu && createPortal(
      <div className="fixed inset-0 z-50" onClick={() => setInfMenu(null)}>
        <div className="absolute bg-white dark:bg-[#2a2a2a] rounded-xl shadow-xl border border-slate-200 dark:border-[#3a3a3a] overflow-hidden min-w-[160px]"
          style={{ top: Math.min(infMenu.rect.bottom + 4, window.innerHeight - 120), left: Math.min(infMenu.rect.left, window.innerWidth - 180) }}
          onClick={e => e.stopPropagation()}>
          <p className="text-[9px] font-bold uppercase tracking-wider px-3 pt-2.5 pb-1 flex items-center gap-1.5" style={{ color: infMenu.color }}>
            {infMenu.name}
            {infMenu.stopped && <span className="text-[8px] font-normal text-slate-400 normal-case tracking-normal">discontinued</span>}
          </p>
          {infMenu.stopped ? (
            <button type="button"
              onClick={() => { restoreInfusion(infMenu.segId); setInfMenu(null) }}
              className="w-full text-left text-sm font-medium px-4 py-2.5 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors text-emerald-600 dark:text-emerald-400">
              Restore infusion
            </button>
          ) : (
            <>
              <button type="button"
                onClick={() => {
                  const seg = (data.infusions ?? []).find(i => i.id === infMenu.segId)
                  if (!seg) { setInfMenu(null); return }
                  const cfg = INFUSION_CONFIGS[seg.name] ?? DEFAULT_INF
                  const pillCol = infMenu.fromPillCol
                  const cur = pillCol != null ? (
                    pillCol === seg.startCol ? { rate: seg.rate, unit: seg.unit }
                    : (seg.rateChanges ?? []).find(rc => rc.col === pillCol) ?? { rate: seg.rate, unit: seg.unit }
                  ) : { rate: seg.rate, unit: seg.unit }
                  setRateDialog({ segId: seg.id, name: seg.name, rate: cur.rate, unit: cur.unit, units: cfg.units, rateMin: cfg.min, rateMax: cfg.max, rateStep: cfg.step, color: infMenu.color, rect: infMenu.rect, step: "rate", timeH: "", timeM: "", editFromCol: pillCol })
                  setInfMenu(null)
                }}
                className="w-full text-left text-sm font-medium px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-[#333] transition-colors text-slate-700 dark:text-slate-200">
                Change rate
              </button>
              <button type="button"
                onMouseEnter={() => setHoverDiscontinue(infMenu.segId)}
                onMouseLeave={() => setHoverDiscontinue(null)}
                onClick={() => { setHoverDiscontinue(null); extendInfusion(infMenu.segId, nowCol ?? 0, true); setInfMenu(null) }}
                className="w-full text-left text-sm font-medium px-4 py-2.5 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-600 dark:text-red-400 border-t border-slate-100 dark:border-[#3a3a3a]">
                Discontinue
              </button>
            </>
          )}
        </div>
      </div>,
      document.body
    )}
    {/* Rate change dialog */}
    {rateDialog && createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setRateDialog(null)}>
        <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl p-5 w-72 space-y-4 border border-slate-200 dark:border-[#3a3a3a]"
          onClick={e => e.stopPropagation()}>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{ color: rateDialog.color }}>{rateDialog.name} — Change rate</p>
            {rateDialog.step === "rate" && <p className="text-[10px] text-slate-400">Set new rate, then choose when to apply it.</p>}
            {rateDialog.step === "time" && <p className="text-[10px] text-slate-400">Pick the time at which the rate changed.</p>}
          </div>

          {rateDialog.step === "rate" && (
            <>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input type="number" value={rateDialog.rate} autoFocus
                    min={rateDialog.rateMin} max={rateDialog.rateMax} step={rateDialog.rateStep}
                    onChange={e => setRateDialog(d => d ? { ...d, rate: parseFloat(e.target.value) || d.rateMin } : d)}
                    className="flex-1 text-lg font-semibold text-center border border-slate-200 dark:border-[#3a3a3a] rounded-lg px-2 py-1.5 bg-white dark:bg-[#2a2a2a] focus:outline-none focus:ring-1 focus:ring-blue-400 [appearance:textfield]" />
                  <select value={rateDialog.unit}
                    onChange={e => setRateDialog(d => d ? { ...d, unit: e.target.value } : d)}
                    className="text-xs border border-slate-200 dark:border-[#3a3a3a] rounded-lg px-2 py-1.5 bg-white dark:bg-[#2a2a2a] focus:outline-none">
                    {rateDialog.units.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <input type="range" min={rateDialog.rateMin} max={rateDialog.rateMax} step={rateDialog.rateStep}
                  value={rateDialog.rate}
                  onChange={e => setRateDialog(d => d ? { ...d, rate: parseFloat(e.target.value) } : d)}
                  className="w-full accent-blue-500" />
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>{rateDialog.rateMin}</span><span>{rateDialog.rateMax} {rateDialog.unit}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button"
                  onClick={() => {
                    const col = rateDialog.editFromCol !== undefined ? rateDialog.editFromCol : nowCol ?? 0
                    applyInfRateChange(rateDialog.segId, rateDialog.editFromCol ?? null, col, rateDialog.rate, rateDialog.unit)
                    setRateDialog(null)
                  }}
                  className="flex-1 text-sm font-semibold bg-blue-500 hover:bg-blue-600 text-white rounded-lg py-2 transition-colors">
                  {rateDialog.editFromCol !== undefined ? "Apply" : "Start now"}
                </button>
                {rateDialog.editFromCol === undefined && (
                  <button type="button"
                    onClick={() => setRateDialog(d => d ? { ...d, step: "time" } : d)}
                    className="flex-1 text-sm font-semibold border border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] rounded-lg py-2 transition-colors">
                    Pick time
                  </button>
                )}
              </div>
            </>
          )}

          {rateDialog.step === "time" && (() => {
            const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))
            const mins  = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"))
            const selCls = "flex h-10 rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 flex-1"
            return (
              <>
                <div className="flex items-center gap-2">
                  <select className={selCls} value={rateDialog.timeH}
                    onChange={e => setRateDialog(d => d ? { ...d, timeH: e.target.value } : d)}>
                    <option value="">HH</option>
                    {hours.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <span className="font-bold text-slate-400">:</span>
                  <select className={selCls} value={rateDialog.timeM}
                    onChange={e => setRateDialog(d => d ? { ...d, timeM: e.target.value } : d)}>
                    <option value="">MM</option>
                    {mins.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setRateDialog(d => d ? { ...d, step: "rate" } : d)}
                    className="text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-[#3a3a3a] text-slate-500 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] transition-colors">
                    Back
                  </button>
                  <button type="button"
                    disabled={!rateDialog.timeH || !rateDialog.timeM}
                    onClick={() => {
                      const startMins = timeToMins(floorTo5(startTime || "08:00"))
                      const changeMins = timeToMins(`${rateDialog.timeH}:${rateDialog.timeM}`)
                      const diff = (changeMins - startMins + 1440) % 1440
                      const changeCol = Math.min(Math.floor(diff / INTERVAL), colCount - 1)
                      applyInfRateChange(rateDialog.segId, null, changeCol, rateDialog.rate, rateDialog.unit)
                      setRateDialog(null)
                    }}
                    className="flex-1 text-sm font-semibold bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white rounded-lg py-2 transition-colors">
                    Confirm
                  </button>
                </div>
              </>
            )
          })()}
        </div>
      </div>,
      document.body
    )}
    {/* Vitals slider popup */}
    {vitalsPopup && createPortal(
      (() => {
        const currentCellVal = data.vitals[vitalsPopup.col]?.[vitalsPopup.key]
        function commitAndClose() {
          // If cell was never touched, persist the displayed default so the value is saved
          if (currentCellVal === undefined) {
            setVital(vitalsPopup!.col, vitalsPopup!.key, String(vitalsPopup!.defaultVal))
          }
          setVitalsPopup(null)
        }
        return (
          <div className="fixed inset-0 z-50" onClick={commitAndClose}>
            <div className="absolute bg-white dark:bg-[#2a2a2a] rounded-xl shadow-2xl p-4 w-64 border border-slate-200 dark:border-[#3a3a3a] space-y-3"
              style={{ top: Math.min(vitalsPopup.rect.bottom + 6, window.innerHeight - 220), left: Math.max(4, Math.min(vitalsPopup.rect.left - 80, window.innerWidth - 280)) }}
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: vitalsPopup.color }} />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{vitalsPopup.label}</span>
                <span className="text-xs text-slate-400 ml-auto">{vitalsPopup.unit}</span>
              </div>
              <NumberStepper
                value={currentCellVal ?? vitalsPopup.defaultVal}
                onChange={v => setVital(vitalsPopup.col, vitalsPopup.key, v !== undefined ? String(v) : "")}
                min={vitalsPopup.min}
                max={vitalsPopup.max}
                step={vitalsPopup.step}
                unit={vitalsPopup.unit}
                showSlider
              />
              <button type="button" onClick={commitAndClose}
                className="w-full text-sm font-semibold bg-blue-500 hover:bg-blue-600 text-white rounded-lg py-1.5 transition-colors">
                Done
              </button>
            </div>
          </div>
        )
      })(),
      document.body
    )}
    {/* Delete infusion prompt (dragged bar off the left edge) */}
    {deleteInfPrompt && createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl p-6 w-72 space-y-4 border border-slate-200 dark:border-[#3a3a3a]">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Delete this infusion?</p>
          <p className="text-xs text-slate-400">The bar was dragged off the timeline. Remove it completely?</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setDeleteInfPrompt(null)}
              className="flex-1 text-sm px-4 py-2 rounded-lg border border-slate-200 dark:border-[#3a3a3a] text-slate-500 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] transition-colors">
              Cancel
            </button>
            <button type="button"
              onClick={() => { removeInfusion(deleteInfPrompt); setDeleteInfPrompt(null) }}
              className="flex-1 text-sm font-semibold bg-red-500 hover:bg-red-600 text-white rounded-lg py-2 transition-colors">
              Delete
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}
    {showEndModal && (
      <EndCaseModal
        agents={agents.filter(a => !a.stopped)}
        infusions={(data.infusions ?? []).filter(i => !i.stopped && true)}
        fluids={(data.fluids ?? []).filter(f => !f.stopped)}
        onDismiss={() => setShowEndModal(false)}
        onConfirm={handleEndCaseConfirm}
      />
    )}
    {showHotkeys && <HotkeysModal onClose={() => setShowHotkeys(false)} />}
    {discFluidState && (() => {
      const fluid = (data.fluids ?? []).find(f => f.id === discFluidState.id)
      if (!fluid) return null
      const bagVol = parseInt(fluid.volume) || 500
      const curAmt = parseInt(discFluidState.volInput) || 0
      const rect = discFluidState.rect
      return createPortal(
        <div className="fixed z-50 bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-xl p-3 space-y-2"
          style={{ top: rect.bottom + 6, left: Math.min(rect.right - 200, window.innerWidth - 210), width: 200 }}
          onClick={e => e.stopPropagation()}>
          <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-2">
            {fluid.name}{fluid.volume ? ` — ${fluid.volume} mL bag` : ""}
          </p>
          <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-100 mb-2">Was the full bag infused?</p>
          <div className="flex gap-2 mb-2">
            <button type="button"
              onClick={() => setDiscFluidState(s => s ? { ...s, fullBag: true, volInput: String(bagVol) } : s)}
              className={`flex-1 text-[10px] font-semibold py-1.5 rounded-lg border-2 transition-colors ${discFluidState.fullBag === true ? "bg-teal-500 border-teal-500 text-white" : "border-teal-300 dark:border-teal-700 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20"}`}>
              ✓ Yes — full bag
            </button>
            <button type="button"
              onClick={() => setDiscFluidState(s => s ? { ...s, fullBag: false, volInput: "0" } : s)}
              className={`flex-1 text-[10px] font-semibold py-1.5 rounded-lg border-2 transition-colors ${discFluidState.fullBag === false ? "bg-amber-500 border-amber-500 text-white" : "border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"}`}>
              No — partial
            </button>
          </div>
          {discFluidState.fullBag === false && (
            <div className="space-y-1.5 mb-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Amount:</span>
                <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">{curAmt} mL</span>
              </div>
              <input type="range" min={0} max={bagVol} step={50}
                value={curAmt}
                onChange={e => setDiscFluidState(s => s ? { ...s, volInput: e.target.value } : s)}
                className="w-full accent-teal-500 cursor-pointer" />
            </div>
          )}
          <div className="flex gap-1.5 justify-end pt-1">
            <button type="button" onClick={() => setDiscFluidState(null)}
              className="text-[10px] text-slate-400 hover:text-slate-600 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-[#2a2a2a]">
              Cancel
            </button>
            <button type="button"
              disabled={discFluidState.fullBag === null}
              onClick={() => {
                const d = dataRef.current
                onChangeRef.current({
                  ...d,
                  fluids: (d.fluids ?? []).map(f =>
                    f.id === discFluidState.id
                      ? { ...f, endCol: nowCol ?? f.endCol, stopped: true as const, volume: discFluidState.volInput }
                      : f
                  ),
                })
                setSel(null)
                setDiscFluidState(null)
              }}
              className="text-[10px] font-bold bg-red-500 text-white px-2.5 py-1 rounded-lg hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed">
              Confirm Discontinue
            </button>
          </div>
        </div>,
        document.body
      )
    })()}
    </>
  )
}
