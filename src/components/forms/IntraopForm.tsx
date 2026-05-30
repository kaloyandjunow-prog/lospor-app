"use client"

import { useForm, Controller } from "react-hook-form"
import { useState, useEffect, useRef, useMemo } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { ChevronLeft, ChevronRight, ChevronDown, Plus, Trash2, X } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useTranslations } from "next-intl"
import { IntraopTimetable, type TimetableData, calcInfusionTotal } from "@/components/IntraopTimetable"
import { NumberStepper } from "@/components/NumberStepper"
import { TechniqueTree, techniqueIsGeneral, techniqueUsesGas, techniqueNeedsBlock } from "@/components/TechniqueTree"
import { calcIBW, calcABW } from "@/lib/scores"
import { VascularAccessTree, type VascularAccess } from "@/components/VascularAccessTree"
import { EquipmentSuggestions } from "@/components/EquipmentSuggestions"

// ── Drug total helpers ────────────────────────────────────────────────────────
function parseLAConc(name: string): number | null {
  const m = name.match(/(\d+(?:\.\d+)?)%/)
  return m ? parseFloat(m[1]) : null
}

// ── Time picker (24h, 1-min intervals) ───────────────────────────────────────
import React from "react"
import { createPortal } from "react-dom"
const TimePicker = React.forwardRef<HTMLSelectElement, { value?: string; onChange: (v: string) => void }>(
  function TimePicker({ value, onChange }, ref) {
  // pendingRef tracks the latest HH:MM including rapid changes before React re-renders
  const pendingRef = useRef(value || "")
  useEffect(() => { pendingRef.current = value || "" }, [value])

  const parts = (value || ":").split(":")
  const h = parts[0] || ""
  const m = parts[1] || ""
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))
  const mins  = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"))
  const selectClass = "flex h-9 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
  return (
    <div className="flex items-center gap-1">
      <select ref={ref} className={selectClass} value={h || ""} onChange={e => {
        const cur = pendingRef.current.split(":")
        const next = `${e.target.value}:${cur[1] || "00"}`
        pendingRef.current = next; onChange(next)
      }}>
        <option value="">HH</option>
        {hours.map(hh => <option key={hh} value={hh}>{hh}</option>)}
      </select>
      <span className="text-slate-500 font-bold">:</span>
      <select className={selectClass} value={m || ""} onChange={e => {
        const cur = pendingRef.current.split(":")
        const next = `${cur[0] || "00"}:${e.target.value}`
        pendingRef.current = next; onChange(next)
      }}>
        <option value="">MM</option>
        {mins.map(mm => <option key={mm} value={mm}>{mm}</option>)}
      </select>
    </div>
  )
})

// ── Numeric range select ──────────────────────────────────────────────────────
function RangeSelect({ name, control, min, max, step = 1, placeholder = "—" }: {
  name: string; control: any; min: number; max: number; step?: number; placeholder?: string
}) {
  const options: React.ReactNode[] = []
  for (let v = min; v <= max; v = Math.round((v + step) * 1000) / 1000) {
    options.push(<option key={v} value={v}>{v}</option>)
  }
  return (
    <Controller name={name} control={control} render={({ field }) => (
      <select
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        value={field.value ?? ""}
        onChange={e => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      >
        <option value="">{placeholder}</option>
        {options}
      </select>
    )} />
  )
}

// ── Schema ────────────────────────────────────────────────────────────────────
const vitalsRowSchema = z.object({
  time:      z.string().optional(),
  systolic:  z.coerce.number().optional(),
  diastolic: z.coerce.number().optional(),
  heartRate: z.coerce.number().optional(),
  spO2:      z.coerce.number().optional(),
  etco2:     z.coerce.number().optional(),
  temp:      z.coerce.number().optional(),
  bgl:       z.coerce.number().optional(),
  note:      z.string().optional(),
})

const drugSchema = z.object({
  name:  z.string().min(1),
  dose:  z.string(),
  unit:  z.string().default("mg"),
  route: z.string().default("IV"),
  time:  z.string().optional(),
})

const schema = z.object({
  monthYear:      z.string().optional(),
  startTime:      z.string().optional(),
  endTime:        z.string().optional(),
  endTimeNextDay: z.boolean().default(false),

  positions: z.array(z.string()).catch([]).default([]),

  techniques:      z.array(z.string()).catch([]).default([]),
  airwayDevices:   z.array(z.string()).catch([]).default([]),
  tubeSize:        z.coerce.number().optional(),
  cuffed:          z.boolean().optional(),
  peepCmH2O:       z.coerce.number().optional(),
  ventilationModes:z.array(z.string()).catch([]).default([]),
  airwayTools:     z.array(z.string()).catch([]).default([]),
  airwayNotes:     z.string().optional(),
  cormackLehane:   z.enum(["I","IIa","IIb","III","IV"]).optional(),
  dltType:         z.string().optional(),
  dltSide:         z.string().optional(),
  dltSize:         z.coerce.number().optional(),
  endobronchialSize: z.coerce.number().optional(),

  volatileAgent:   z.enum(["SEVOFLURANE","DESFLURANE","ISOFLURANE"]).optional(),
  n2oPercent:      z.coerce.number().optional(),
  o2Percent:       z.coerce.number().optional(),
  n2oLitersPerMin: z.coerce.number().optional(),
  o2LitersPerMin:  z.coerce.number().optional(),

  plexusBlock:      z.enum(["AXILLARY","INTERSCALENE","SUPRACLAVICULAR","INFRACLAVICULAR","FEMORAL","SCIATIC","POPLITEAL","TAP","ERECTOR_SPINAE"]).optional(),
  cvkSite:          z.enum(["INTERNAL_JUGULAR","EXTERNAL_JUGULAR","SUBCLAVIAN","FEMORAL"]).optional(),
  arterialLineSite: z.enum(["RADIAL","DORSALIS_PEDIS","FEMORAL","BRACHIAL"]).optional(),

  ecg: z.boolean().default(true), spO2Monitor: z.boolean().default(true),
  nbpMonitor: z.boolean().default(true),
  etco2Monitor: z.boolean().default(false), tempMonitor: z.boolean().default(false),
  invasiveBP: z.boolean().default(false), cvpMonitor: z.boolean().default(false),
  paCatheter: z.boolean().default(false), tee: z.boolean().default(false),
  bis: z.boolean().default(false), entropyMonitor: z.boolean().default(false),
  nirsMonitor: z.boolean().default(false), evokedPotentials: z.boolean().default(false),
  tofMonitor: z.boolean().default(false),
  bglMonitor: z.boolean().default(false), bloodGasMonitor: z.boolean().default(false),
  urinaryCatheter: z.boolean().default(false), stomachTube: z.boolean().default(false),
  neuroMonitor: z.boolean().default(false),
  vascularAccesses: z.array(z.object({ site: z.string(), siteLabel: z.string(), sizeUnit: z.string(), size: z.string(), depthCm: z.string() }).passthrough()).catch([]).default([]),

  premedicationEvening: z.string().optional(),
  premedicationMorning: z.string().optional(),

  drugsAdministered: z.array(drugSchema).default([]),
  vitals:            z.array(vitalsRowSchema).default([]),

  crystalloidsMl:    z.coerce.number().optional(),
  colloidsMl:        z.coerce.number().optional(),
  bloodMl:           z.coerce.number().optional(),
  bloodProductsNote: z.string().optional(),
  urineMl:           z.coerce.number().optional(),

  complications: z.string().optional(),
})

export type IntraopData = z.infer<typeof schema> & { timetableData?: any }

function SectionCard({ title, children, collapsible = false, defaultCollapsed = false, badge }: {
  title: string; children: React.ReactNode
  collapsible?: boolean; defaultCollapsed?: boolean; badge?: string
}) {
  const [open, setOpen] = useState(!defaultCollapsed)
  return (
    <Card>
      <CardHeader
        className={`pb-3 ${collapsible ? "cursor-pointer select-none" : ""}`}
        onClick={collapsible ? () => setOpen(v => !v) : undefined}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-base text-slate-700 dark:text-slate-200">{title}</CardTitle>
          <div className="flex items-center gap-2">
            {badge && !open && <span className="text-xs text-slate-400 dark:text-slate-500 font-normal truncate max-w-[180px]">{badge}</span>}
            {collapsible && <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />}
          </div>
        </div>
      </CardHeader>
      {open && <CardContent className="space-y-4">{children}</CardContent>}
    </Card>
  )
}

function CheckField({ id, label, register }: { id: string; label: string; register: any }) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} {...register(id)} />
      <Label htmlFor={id} className="font-normal cursor-pointer">{label}</Label>
    </div>
  )
}

const POSITIONS: { v: string; label: string; desc: string; sel: string }[] = [
  // Row 1 — most common (5)
  { v: "SUPINE",                 label: "Supine",             desc: "Flat on back",         sel: "bg-blue-500   border-blue-500   text-white" },
  { v: "PRONE",                  label: "Prone",              desc: "Face down",            sel: "bg-indigo-500 border-indigo-500 text-white" },
  { v: "LEFT_LATERAL",          label: "Left lateral",       desc: "On left side",         sel: "bg-cyan-500   border-cyan-500   text-white" },
  { v: "RIGHT_LATERAL",         label: "Right lateral",      desc: "On right side",        sel: "bg-cyan-500   border-cyan-500   text-white" },
  { v: "GYNECOLOGICAL",         label: "Gynecological",      desc: "Legs in stirrups",     sel: "bg-purple-500 border-purple-500 text-white" },
  // Row 2 — common variants (5)
  { v: "TRENDELENBURG",         label: "Trendelenburg",      desc: "Head ↓ 15–30°",        sel: "bg-orange-500 border-orange-500 text-white" },
  { v: "REVERSE_TRENDELENBURG", label: "Rev. Trendelenburg", desc: "Head ↑ 15–30°",        sel: "bg-amber-500  border-amber-500  text-white" },
  { v: "FOWLER",                label: "Fowler's",           desc: "Semi-sitting ~45°",    sel: "bg-green-600  border-green-600  text-white" },
  { v: "BEACH_CHAIR",           label: "Beach chair",        desc: "Shoulder position",    sel: "bg-teal-500   border-teal-500   text-white" },
  { v: "LLOYD_DAVIES",          label: "Lloyd Davies",       desc: "Mod. lithotomy",       sel: "bg-violet-500 border-violet-500 text-white" },
  // Row 3 — specialty (5)
  { v: "LATERAL_DECUBITUS_LEFT",  label: "Lateral decub. L", desc: "Left side, arm up",    sel: "bg-sky-500    border-sky-500    text-white" },
  { v: "LATERAL_DECUBITUS_RIGHT", label: "Lateral decub. R", desc: "Right side, arm up",   sel: "bg-sky-500    border-sky-500    text-white" },
  { v: "SITTING",                 label: "Sitting",           desc: "Upright 90°",          sel: "bg-green-600  border-green-600  text-white" },
  { v: "JACKKNIFE",               label: "Jackknife",         desc: "Prone, hip flexed",    sel: "bg-slate-600  border-slate-600  text-white" },
  { v: "KNEE_CHEST",              label: "Knee-chest",        desc: "Kneeling, chest down", sel: "bg-slate-600  border-slate-600  text-white" },
]
const TECHNIQUE_KEYS = ["GENERAL_INHALATION","GENERAL_TIVA","GENERAL_COMBINED","SPINAL","EPIDURAL","COMBINED_SPINAL_EPIDURAL","PERIPHERAL_NERVE_BLOCK","LOCAL","SEDATION"]
const AIRWAY_KEYS = ["FACE_MASK","LMA","ORAL_ETT","NASAL_ETT","SURGICAL_AIRWAY"]
const BLOCK_KEYS = ["AXILLARY","INTERSCALENE","SUPRACLAVICULAR","INFRACLAVICULAR","FEMORAL","SCIATIC","POPLITEAL","TAP","ERECTOR_SPINAE"]

const MONITORING: { field: string; label: string; cat: string }[] = [
  { field:"ecg",            label:"ECG",                  cat:"Standard"        },
  { field:"spO2Monitor",    label:"SpO₂",                 cat:"Standard"        },
  { field:"nbpMonitor",     label:"NBP",                  cat:"Standard"        },
  { field:"etco2Monitor",   label:"Capnography (EtCO₂)",  cat:"Standard"        },
  { field:"tempMonitor",    label:"Temperature",           cat:"Standard"        },
  { field:"invasiveBP",     label:"IBP (invasive BP)",    cat:"Haemodynamic"    },
  { field:"cvpMonitor",     label:"CVP",                  cat:"Haemodynamic"    },
  { field:"paCatheter",     label:"PA catheter",           cat:"Haemodynamic"    },
  { field:"tee",            label:"TEE",                  cat:"Haemodynamic"    },
  { field:"bis",            label:"BIS",                  cat:"Depth / Neuro"   },
  { field:"entropyMonitor", label:"Entropy (pEEG)",        cat:"Depth / Neuro"   },
  { field:"nirsMonitor",    label:"NIRS / rSO₂",           cat:"Depth / Neuro"   },
  { field:"evokedPotentials",label:"SSEP / MEP",           cat:"Depth / Neuro"   },
  { field:"tofMonitor",     label:"TOF / NMT",             cat:"Depth / Neuro"   },
  { field:"bglMonitor",     label:"Blood glucose",         cat:"Other"           },
  { field:"bloodGasMonitor",label:"Blood gases (ABG)",     cat:"Other"           },
  { field:"urinaryCatheter",label:"Urine output",           cat:"Other"           },
  { field:"stomachTube",    label:"Gastric tube (NGT)",    cat:"Other"           },
]

type PreopSummary = {
  asaScore?: string | null
  ageYears?: number | null
  heightCm?: number | null; weightKg?: number | null; sex?: string | null
  bmi?: number | null
  bpSystolic?: number | null; bpDiastolic?: number | null
  heartRate?: number | null;  spO2?: number | null
  mallampati?: string | null
  difficultAirwayHistory?: boolean
  allergies?: boolean
  allergyDetails?: { label: string }[]
  comorbidities?: { label: string }[]
  labResults?: { test: string; value: string; unit: string }[]
  diagnosis?: string | null
  plannedProcedure?: string | null
  emergencySurgery?: boolean | null
}

// ── Premedication drug library ────────────────────────────────────────────────
const PREMED_CATS: { cat: string; drugs: string[] }[] = [
  { cat: "Anxiolytics",     drugs: ["Midazolam","Diazepam","Lorazepam","Temazepam","Oxazepam","Alprazolam"] },
  { cat: "Analgesics",      drugs: ["Paracetamol","Ibuprofen","Celecoxib","Gabapentin","Pregabalin","Tramadol","Codeine","Etoricoxib"] },
  { cat: "Antiemetics",     drugs: ["Metoclopramide","Ondansetron","Domperidone","Promethazine","Dexamethasone"] },
  { cat: "Antacids / GI",   drugs: ["Omeprazole","Pantoprazole","Esomeprazole","Ranitidine","Sodium citrate","Lansoprazole"] },
  { cat: "Anticholinergics",drugs: ["Atropine","Glycopyrrolate","Hyoscine","Scopolamine"] },
  { cat: "Beta-blockers",   drugs: ["Atenolol","Metoprolol","Bisoprolol","Carvedilol","Labetalol"] },
  { cat: "Antihistamines",  drugs: ["Hydroxyzine","Diphenhydramine","Cetirizine","Loratadine","Promethazine"] },
  { cat: "Opioids",         drugs: ["Morphine","Oxycodone","Tramadol","Pethidine","Buprenorphine","Fentanyl"] },
  { cat: "Other",           drugs: ["Clonidine","Aspirin","Clopidogrel","Warfarin","Ketamine","Insulin","Levothyroxine"] },
]

type PremDoseCfg = { dose: number; unit: string; min: number; max: number; step: number; routes: string[]; defaultRoute: string; hint: string }
const PREMED_DOSES: Record<string, PremDoseCfg> = {
  "Midazolam":      { dose:7.5,  unit:"mg",     min:2.5, max:15,   step:2.5,  routes:["PO","IM","IV","Intranasal"],      defaultRoute:"PO", hint:"Median 7.5 mg PO (2.5–15 mg)" },
  "Diazepam":       { dose:5,    unit:"mg",     min:2,   max:20,   step:1,    routes:["PO","IV","IM"],                   defaultRoute:"PO", hint:"Median 5 mg PO (2–10 mg)" },
  "Lorazepam":      { dose:1,    unit:"mg",     min:0.5, max:4,    step:0.5,  routes:["PO","IM","IV"],                   defaultRoute:"PO", hint:"Median 1 mg PO (0.5–2 mg)" },
  "Temazepam":      { dose:10,   unit:"mg",     min:5,   max:30,   step:5,    routes:["PO"],                             defaultRoute:"PO", hint:"Median 10 mg PO (10–30 mg)" },
  "Oxazepam":       { dose:10,   unit:"mg",     min:10,  max:30,   step:10,   routes:["PO"],                             defaultRoute:"PO", hint:"Median 10 mg PO" },
  "Alprazolam":     { dose:0.25, unit:"mg",     min:0.25,max:1,    step:0.25, routes:["PO"],                             defaultRoute:"PO", hint:"Median 0.25 mg PO" },
  "Paracetamol":    { dose:1000, unit:"mg",     min:500, max:1000, step:250,  routes:["PO","IV","PR"],                   defaultRoute:"PO", hint:"Median 1 g PO (500 mg–1 g)" },
  "Ibuprofen":      { dose:400,  unit:"mg",     min:200, max:800,  step:200,  routes:["PO"],                             defaultRoute:"PO", hint:"Median 400 mg PO" },
  "Celecoxib":      { dose:200,  unit:"mg",     min:100, max:400,  step:100,  routes:["PO"],                             defaultRoute:"PO", hint:"Median 200 mg PO" },
  "Gabapentin":     { dose:300,  unit:"mg",     min:100, max:1200, step:100,  routes:["PO"],                             defaultRoute:"PO", hint:"Median 300 mg PO (100–1200 mg)" },
  "Pregabalin":     { dose:75,   unit:"mg",     min:25,  max:300,  step:25,   routes:["PO"],                             defaultRoute:"PO", hint:"Median 75 mg PO (25–300 mg)" },
  "Tramadol":       { dose:50,   unit:"mg",     min:50,  max:100,  step:50,   routes:["PO","IM","IV"],                   defaultRoute:"PO", hint:"Median 50 mg PO" },
  "Codeine":        { dose:30,   unit:"mg",     min:15,  max:60,   step:15,   routes:["PO"],                             defaultRoute:"PO", hint:"Median 30 mg PO" },
  "Etoricoxib":     { dose:90,   unit:"mg",     min:60,  max:120,  step:30,   routes:["PO"],                             defaultRoute:"PO", hint:"Median 90 mg PO" },
  "Metoclopramide": { dose:10,   unit:"mg",     min:5,   max:20,   step:5,    routes:["PO","IM","IV"],                   defaultRoute:"PO", hint:"Median 10 mg PO" },
  "Ondansetron":    { dose:4,    unit:"mg",     min:4,   max:8,    step:4,    routes:["PO","IM","IV"],                   defaultRoute:"PO", hint:"Median 4 mg PO" },
  "Domperidone":    { dose:10,   unit:"mg",     min:10,  max:20,   step:10,   routes:["PO"],                             defaultRoute:"PO", hint:"Median 10 mg PO" },
  "Promethazine":   { dose:25,   unit:"mg",     min:12.5,max:50,   step:12.5, routes:["PO","IM","IV"],                   defaultRoute:"PO", hint:"Median 25 mg PO" },
  "Dexamethasone":  { dose:8,    unit:"mg",     min:4,   max:16,   step:4,    routes:["PO","IV","IM"],                   defaultRoute:"PO", hint:"Median 8 mg PO" },
  "Omeprazole":     { dose:20,   unit:"mg",     min:20,  max:40,   step:20,   routes:["PO","IV"],                        defaultRoute:"PO", hint:"Median 20 mg PO" },
  "Pantoprazole":   { dose:40,   unit:"mg",     min:20,  max:80,   step:20,   routes:["PO","IV"],                        defaultRoute:"PO", hint:"Median 40 mg PO" },
  "Esomeprazole":   { dose:20,   unit:"mg",     min:20,  max:40,   step:20,   routes:["PO","IV"],                        defaultRoute:"PO", hint:"Median 20 mg PO" },
  "Ranitidine":     { dose:150,  unit:"mg",     min:75,  max:300,  step:75,   routes:["PO","IV","IM"],                   defaultRoute:"PO", hint:"Median 150 mg PO" },
  "Lansoprazole":   { dose:30,   unit:"mg",     min:15,  max:30,   step:15,   routes:["PO"],                             defaultRoute:"PO", hint:"Median 30 mg PO" },
  "Sodium citrate": { dose:30,   unit:"mL",     min:15,  max:30,   step:5,    routes:["PO"],                             defaultRoute:"PO", hint:"Median 30 mL PO" },
  "Atropine":       { dose:0.6,  unit:"mg",     min:0.3, max:1.2,  step:0.3,  routes:["SC","IM","IV"],                   defaultRoute:"SC", hint:"Median 0.6 mg SC" },
  "Glycopyrrolate": { dose:0.2,  unit:"mg",     min:0.1, max:0.4,  step:0.1,  routes:["IM","IV","SC"],                   defaultRoute:"IM", hint:"Median 0.2 mg IM" },
  "Hyoscine":       { dose:0.3,  unit:"mg",     min:0.2, max:0.6,  step:0.1,  routes:["SC","IM"],                        defaultRoute:"SC", hint:"Median 0.3 mg SC" },
  "Scopolamine":    { dose:1,    unit:"patch",  min:1,   max:2,    step:1,    routes:["Transdermal"],                    defaultRoute:"Transdermal", hint:"1 patch (1.5 mg)" },
  "Atenolol":       { dose:50,   unit:"mg",     min:25,  max:100,  step:25,   routes:["PO"],                             defaultRoute:"PO", hint:"Median 50 mg PO" },
  "Metoprolol":     { dose:50,   unit:"mg",     min:25,  max:100,  step:25,   routes:["PO","IV"],                        defaultRoute:"PO", hint:"Median 50 mg PO" },
  "Bisoprolol":     { dose:5,    unit:"mg",     min:2.5, max:10,   step:2.5,  routes:["PO"],                             defaultRoute:"PO", hint:"Median 5 mg PO" },
  "Carvedilol":     { dose:6.25, unit:"mg",     min:3.125,max:25,  step:3.125,routes:["PO"],                             defaultRoute:"PO", hint:"Median 6.25 mg PO" },
  "Labetalol":      { dose:100,  unit:"mg",     min:50,  max:200,  step:50,   routes:["PO","IV"],                        defaultRoute:"PO", hint:"Median 100 mg PO" },
  "Hydroxyzine":    { dose:25,   unit:"mg",     min:25,  max:100,  step:25,   routes:["PO","IM"],                        defaultRoute:"PO", hint:"Median 25 mg PO" },
  "Diphenhydramine":{ dose:25,   unit:"mg",     min:25,  max:50,   step:25,   routes:["PO","IV","IM"],                   defaultRoute:"PO", hint:"Median 25 mg PO" },
  "Cetirizine":     { dose:10,   unit:"mg",     min:5,   max:20,   step:5,    routes:["PO"],                             defaultRoute:"PO", hint:"Median 10 mg PO" },
  "Loratadine":     { dose:10,   unit:"mg",     min:10,  max:20,   step:10,   routes:["PO"],                             defaultRoute:"PO", hint:"Median 10 mg PO" },
  "Morphine":       { dose:5,    unit:"mg",     min:2.5, max:15,   step:2.5,  routes:["SC","IM","IV","PO"],              defaultRoute:"SC", hint:"Median 5 mg SC" },
  "Oxycodone":      { dose:5,    unit:"mg",     min:5,   max:10,   step:5,    routes:["PO"],                             defaultRoute:"PO", hint:"Median 5 mg PO" },
  "Pethidine":      { dose:50,   unit:"mg",     min:25,  max:100,  step:25,   routes:["IM","SC","IV"],                   defaultRoute:"IM", hint:"Median 50 mg IM" },
  "Buprenorphine":  { dose:0.3,  unit:"mg",     min:0.1, max:0.6,  step:0.1,  routes:["IM","SC","IV","SL","Transdermal"], defaultRoute:"IM",          hint:"Median 0.3 mg IM (0.1–0.6 mg)" },
  "Fentanyl":       { dose:50,   unit:"mcg",    min:25,  max:200,  step:25,   routes:["IV","IM","Intranasal","Buccal","Transdermal"], defaultRoute:"IV", hint:"Median 50 mcg IV (25–200 mcg)" },
  "Clonidine":      { dose:0.1,  unit:"mg",     min:0.05,max:0.3,  step:0.05, routes:["PO","Transdermal"],               defaultRoute:"PO", hint:"Median 0.1 mg PO" },
  "Aspirin":        { dose:75,   unit:"mg",     min:75,  max:300,  step:75,   routes:["PO"],                             defaultRoute:"PO", hint:"Median 75–300 mg PO" },
  "Clopidogrel":    { dose:75,   unit:"mg",     min:75,  max:75,   step:75,   routes:["PO"],                             defaultRoute:"PO", hint:"75 mg PO" },
  "Warfarin":       { dose:5,    unit:"mg",     min:1,   max:10,   step:0.5,  routes:["PO"],                             defaultRoute:"PO", hint:"As prescribed" },
  "Ketamine":       { dose:1,    unit:"mg/kg",  min:0.5, max:2,    step:0.5,  routes:["PO","IV","IM"],                   defaultRoute:"PO", hint:"Median 1 mg/kg PO" },
  "Insulin":        { dose:10,   unit:"units",  min:2,   max:50,   step:2,    routes:["SC","IV"],                        defaultRoute:"SC", hint:"As prescribed" },
  "Levothyroxine":  { dose:50,   unit:"mcg",    min:25,  max:200,  step:25,   routes:["PO"],                             defaultRoute:"PO", hint:"As prescribed" },
}

function PremedicationPicker({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  const [open, setOpen]           = useState(false)
  const [phase, setPhase]         = useState<"categories" | "drugs" | "dose">("categories")
  const [activeCat, setActiveCat] = useState<string | null>(null)
  const [activeDrug, setActiveDrug] = useState<string | null>(null)
  const [doseVal, setDoseVal]     = useState(0)
  const [doseUnit, setDoseUnit]   = useState("mg")
  const [route, setRoute]         = useState("PO")
  const [btnRect, setBtnRect]     = useState<DOMRect | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const selected = value ? value.split(";").map(s => s.trim()).filter(Boolean) : []

  function remove(item: string) { onChange(selected.filter(d => d !== item).join("; ")) }

  function openDosePicker(drugName: string) {
    const cfg = PREMED_DOSES[drugName]
    setActiveDrug(drugName)
    setDoseVal(cfg?.dose ?? 1)
    setDoseUnit(cfg?.unit ?? "mg")
    setRoute(cfg?.defaultRoute ?? "PO")
    setPhase("dose")
  }

  function confirmDose() {
    if (!activeDrug) return
    const label = `${activeDrug} ${doseVal} ${doseUnit} ${route}`
    // Remove any prior entry for same drug before adding new
    const filtered = selected.filter(s => !s.startsWith(activeDrug + " "))
    onChange([...filtered, label].join("; "))
    setPhase("drugs")
  }

  function openPicker() {
    if (btnRef.current) setBtnRect(btnRef.current.getBoundingClientRect())
    setPhase("categories"); setActiveCat(null); setActiveDrug(null); setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    function close() { setOpen(false) }
    function reposition() { if (btnRef.current) setBtnRect(btnRef.current.getBoundingClientRect()) }
    const id = setTimeout(() => document.addEventListener("mousedown", close), 0)
    window.addEventListener("scroll", reposition, true)
    window.addEventListener("resize", reposition)
    return () => {
      clearTimeout(id)
      document.removeEventListener("mousedown", close)
      window.removeEventListener("scroll", reposition, true)
      window.removeEventListener("resize", reposition)
    }
  }, [open])

  const catInfo = PREMED_CATS.find(c => c.cat === activeCat)
  const doseCfg = activeDrug ? PREMED_DOSES[activeDrug] : null

  const dropdown = open && btnRect && createPortal(
    <div className="fixed z-[9999] bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-2xl"
      style={{ top: btnRect.bottom + 4, left: btnRect.left, width: Math.max(btnRect.width, 280), maxHeight: Math.min(420, window.innerHeight - btnRect.bottom - 16), overflowY: "auto" }}
      onMouseDown={e => e.stopPropagation()}>

      {/* ── Phase 1: categories ── */}
      {phase === "categories" && (
        <>
          <button type="button" onClick={() => { onChange("N/A"); setOpen(false) }}
            className="w-full text-left px-4 py-2.5 text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] border-b border-slate-100 dark:border-[#2e2e2e] transition-colors italic">
            N/A — not applicable
          </button>
          {PREMED_CATS.map(cat => (
            <button key={cat.cat} type="button"
              onClick={() => { setActiveCat(cat.cat); setPhase("drugs") }}
              className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] flex items-center justify-between transition-colors">
              <span>{cat.cat}</span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            </button>
          ))}
        </>
      )}

      {/* ── Phase 2: drugs in category ── */}
      {phase === "drugs" && catInfo && (
        <>
          <button type="button" onClick={() => { setPhase("categories"); setActiveCat(null) }}
            className="w-full text-left px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] border-b border-slate-100 dark:border-[#2e2e2e] flex items-center gap-2 transition-colors sticky top-0 bg-white dark:bg-[#1e1e1e]">
            <ChevronLeft className="h-3.5 w-3.5" /> {catInfo.cat}
          </button>
          {catInfo.drugs.map(name => {
            const isSel = selected.some(s => s.startsWith(name + " "))
            return (
              <button key={name} type="button" onClick={() => openDosePicker(name)}
                className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between gap-2 transition-colors ${isSel ? "bg-blue-50 dark:bg-blue-900/20" : "hover:bg-slate-50 dark:hover:bg-[#2a2a2a]"}`}>
                <span className={`font-medium ${isSel ? "text-blue-700 dark:text-blue-300" : "text-slate-700 dark:text-slate-200"}`}>{name}</span>
                <ChevronRight className={`h-3.5 w-3.5 ${isSel ? "text-blue-400" : "text-slate-300"}`} />
              </button>
            )
          })}
        </>
      )}

      {/* ── Phase 3: dose prompt ── */}
      {phase === "dose" && activeDrug && (
        <div className="p-4 space-y-4">
          {/* Header */}
          <button type="button" onClick={() => setPhase("drugs")}
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" /> {activeDrug}
          </button>

          {/* Hint */}
          {doseCfg?.hint && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 -mt-1">{doseCfg.hint}</p>
          )}

          {/* Dose input + unit */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input type="number"
                value={doseVal}
                min={doseCfg?.min} max={doseCfg?.max} step={doseCfg?.step}
                onChange={e => setDoseVal(parseFloat(e.target.value) || 0)}
                onFocus={e => e.target.select()}
                className="flex-1 text-center text-lg font-semibold bg-transparent outline-none border-b-2 border-slate-200 dark:border-[#3a3a3a] focus:border-blue-500 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-slate-800 dark:text-slate-100"
              />
              <span className="text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap font-medium">{doseUnit}</span>
            </div>
            {doseCfg && doseCfg.min !== doseCfg.max && (
              <input type="range"
                min={doseCfg.min} max={doseCfg.max} step={doseCfg.step}
                value={doseVal}
                onChange={e => setDoseVal(parseFloat(e.target.value))}
                className="w-full cursor-pointer accent-blue-500"
              />
            )}
            {doseCfg && doseCfg.min !== doseCfg.max && (
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>{doseCfg.min} {doseUnit}</span>
                <span>{doseCfg.max} {doseUnit}</span>
              </div>
            )}
          </div>

          {/* Route pills */}
          {doseCfg && doseCfg.routes.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Route</p>
              <div className="flex flex-wrap gap-1.5">
                {doseCfg.routes.map(r => (
                  <button key={r} type="button" onClick={() => setRoute(r)}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-all ${route === r ? "bg-blue-500 border-blue-500 text-white" : "border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-300 hover:border-blue-300 dark:hover:border-blue-700"}`}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Add button */}
          <button type="button" onClick={confirmDose}
            className="w-full text-sm font-semibold bg-blue-500 hover:bg-blue-600 text-white rounded-lg py-2 transition-colors">
            Add — {activeDrug} {doseVal} {doseUnit} {route}
          </button>
        </div>
      )}
    </div>,
    document.body
  )

  return (
    <div className="space-y-1">
      <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</Label>
      <button ref={btnRef} type="button" onClick={openPicker}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${open ? "border-blue-400 ring-1 ring-blue-300" : "border-slate-200 dark:border-[#3a3a3a] hover:border-slate-300 dark:hover:border-[#555]"} bg-white dark:bg-[#2a2a2a]`}>
        <span className={`truncate ${selected.length ? "text-slate-700 dark:text-slate-200" : "text-slate-400 dark:text-[#666]"}`}>
          {selected.length ? selected.join(" · ") : "Not set — click to add"}
        </span>
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {dropdown}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {selected.map(drug => (
            <span key={drug} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700">
              {drug}
              <button type="button" onClick={() => remove(drug)} className="text-blue-400 hover:text-blue-600 transition-colors">
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Intraoperative complications library ─────────────────────────────────────
const COMPLICATION_CATS: { cat: string; items: string[] }[] = [
  { cat: "Cardiovascular", items: [
    "Hypotension", "Hypertension", "Bradycardia", "Tachycardia",
    "Atrial fibrillation", "Supraventricular arrhythmia", "Ventricular tachycardia",
    "Ventricular fibrillation", "Myocardial ischaemia", "Myocardial infarction",
    "Cardiac arrest", "Venous air embolism", "Pulmonary embolism",
  ]},
  { cat: "Respiratory", items: [
    "Hypoxia / desaturation", "Laryngospasm", "Bronchospasm", "Aspiration",
    "Difficult intubation", "Failed intubation", "CICO (can't intubate can't oxygenate)",
    "Accidental extubation", "Endobronchial intubation",
    "Pneumothorax", "Tension pneumothorax", "Hypercarbia",
  ]},
  { cat: "Neurological", items: [
    "Awareness under anaesthesia", "Cerebrovascular accident / stroke",
    "Raised intracranial pressure", "Peripheral nerve injury",
    "Spinal cord ischaemia", "Total spinal",
  ]},
  { cat: "Metabolic / Temperature", items: [
    "Hypothermia", "Hyperthermia", "Malignant hyperthermia",
    "Hypoglycaemia", "Hyperglycaemia",
    "Hyponatraemia", "Hypernatraemia", "Hypokalaemia", "Hyperkalaemia",
    "Hypocalcaemia", "Adrenal crisis",
  ]},
  { cat: "Drug / Pharmacological", items: [
    "Anaphylaxis / allergic reaction", "Drug error", "Drug overdose",
    "Local anaesthetic systemic toxicity (LAST)",
    "Residual neuromuscular blockade", "Serotonin syndrome",
  ]},
  { cat: "Haematological", items: [
    "Massive haemorrhage", "Coagulopathy", "DIC (disseminated intravascular coagulation)",
    "Haemolytic transfusion reaction", "Febrile non-haemolytic transfusion reaction",
    "TRALI (transfusion-related acute lung injury)",
    "TACO (transfusion-associated circulatory overload)",
  ]},
  { cat: "Equipment / Technical", items: [
    "IV line failure / extravasation", "Arterial line failure",
    "Circuit disconnection", "Gas supply failure",
    "Monitoring failure", "Regional block failure",
  ]},
  { cat: "Surgical", items: [
    "Unexpected major haemorrhage", "Injury to major vessel",
    "Injury to organ", "Tourniquet complication",
    "Pneumoperitoneum complication", "Positioning injury",
    "Compartment syndrome", "Venous gas embolism",
  ]},
]
const ALL_COMPLICATIONS = COMPLICATION_CATS.flatMap(c => c.items)

function ComplicationsPicker({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const [open, setOpen]           = useState(false)
  const [phase, setPhase]         = useState<"categories" | "items" | "search">("categories")
  const [activeCat, setActiveCat] = useState<string | null>(null)
  const [search, setSearch]       = useState("")
  const [btnRect, setBtnRect]     = useState<DOMRect | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = value
    ? value.split(";").map(s => s.trim()).filter(s => ALL_COMPLICATIONS.includes(s))
    : []
  const freeText = value
    ? value.split(";").map(s => s.trim()).filter(s => s && !ALL_COMPLICATIONS.includes(s)).join("; ")
    : ""

  function toggle(item: string) {
    const next = selected.includes(item) ? selected.filter(d => d !== item) : [...selected, item]
    onChange([...next, ...(freeText ? [freeText] : [])].join("; "))
  }

  function openPicker() {
    if (btnRef.current) setBtnRect(btnRef.current.getBoundingClientRect())
    setPhase("categories"); setActiveCat(null); setSearch(""); setOpen(true)
  }

  function handleSearch(q: string) {
    setSearch(q)
    setPhase(q.trim() ? "search" : activeCat ? "items" : "categories")
  }

  useEffect(() => {
    if (!open) return
    function close() { setOpen(false) }
    function reposition() { if (btnRef.current) setBtnRect(btnRef.current.getBoundingClientRect()) }
    const id = setTimeout(() => document.addEventListener("mousedown", close), 0)
    window.addEventListener("scroll", reposition, true)
    window.addEventListener("resize", reposition)
    return () => {
      clearTimeout(id)
      document.removeEventListener("mousedown", close)
      window.removeEventListener("scroll", reposition, true)
      window.removeEventListener("resize", reposition)
    }
  }, [open])

  const catInfo = COMPLICATION_CATS.find(c => c.cat === activeCat)
  const q = search.toLowerCase()
  const searchResults = q
    ? COMPLICATION_CATS.map(c => ({ ...c, items: c.items.filter(i => i.toLowerCase().includes(q)) })).filter(c => c.items.length > 0)
    : []

  function ItemRow({ item }: { item: string }) {
    const isSel = selected.includes(item)
    return (
      <button type="button" onClick={() => toggle(item)}
        className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors ${isSel ? "bg-red-50 dark:bg-red-900/15" : "hover:bg-slate-50 dark:hover:bg-[#2a2a2a]"}`}>
        <span className={`flex-none w-4 h-4 rounded border-2 flex items-center justify-center transition-colors shrink-0 ${isSel ? "bg-red-500 border-red-500" : "border-slate-300 dark:border-[#555]"}`}>
          {isSel && <span className="text-white text-[10px] font-bold leading-none">✓</span>}
        </span>
        <span className={isSel ? "text-red-700 dark:text-red-300 font-medium" : "text-slate-700 dark:text-slate-200"}>{item}</span>
      </button>
    )
  }

  const dropdown = open && btnRect && createPortal(
    <div className="fixed z-[9999] bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-2xl flex flex-col"
      style={{ top: btnRect.bottom + 4, left: btnRect.left, width: Math.max(btnRect.width, 320), maxHeight: Math.min(460, window.innerHeight - btnRect.bottom - 16) }}
      onMouseDown={e => e.stopPropagation()}>

      {/* Search bar — always visible */}
      <div className="px-3 py-2.5 border-b border-slate-100 dark:border-[#2e2e2e] shrink-0">
        <input ref={searchRef} type="text" placeholder="Search all complications…" value={search}
          onChange={e => handleSearch(e.target.value)}
          autoFocus
          className="w-full text-sm px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-red-400" />
      </div>

      <div className="overflow-y-auto flex-1">
        {/* Phase: search results */}
        {phase === "search" && (
          searchResults.length > 0 ? searchResults.map(cat => (
            <div key={cat.cat}>
              <p className="sticky top-0 px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-[#666] bg-white dark:bg-[#1e1e1e] border-b border-slate-50 dark:border-[#252525]">
                {cat.cat}
              </p>
              {cat.items.map(item => <ItemRow key={item} item={item} />)}
            </div>
          )) : <p className="text-sm text-slate-400 text-center py-8">No matches</p>
        )}

        {/* Phase: category list */}
        {phase === "categories" && COMPLICATION_CATS.map(cat => {
          const count = cat.items.filter(i => selected.includes(i)).length
          return (
            <button key={cat.cat} type="button"
              onClick={() => { setActiveCat(cat.cat); setPhase("items") }}
              className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] flex items-center justify-between gap-2 transition-colors">
              <span>{cat.cat}</span>
              <span className="flex items-center gap-2 shrink-0">
                {count > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">{count}</span>
                )}
                <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
              </span>
            </button>
          )
        })}

        {/* Phase: items within category */}
        {phase === "items" && catInfo && (
          <>
            <button type="button"
              onClick={() => { setPhase("categories"); setActiveCat(null) }}
              className="w-full text-left px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] border-b border-slate-100 dark:border-[#2e2e2e] flex items-center gap-2 transition-colors sticky top-0 bg-white dark:bg-[#1e1e1e]">
              <ChevronLeft className="h-3.5 w-3.5" /> {catInfo.cat}
            </button>
            {catInfo.items.map(item => <ItemRow key={item} item={item} />)}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 px-4 py-2.5 border-t border-slate-100 dark:border-[#2e2e2e] flex items-center justify-between">
        <span className="text-xs text-slate-400">{selected.length} selected</span>
        <button type="button" onClick={() => setOpen(false)}
          className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline">Done</button>
      </div>
    </div>,
    document.body
  )

  return (
    <div className="space-y-2">
      <button ref={btnRef} type="button" onClick={openPicker}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${open ? "border-red-400 ring-1 ring-red-300" : "border-slate-200 dark:border-[#3a3a3a] hover:border-slate-300 dark:hover:border-[#555]"} bg-white dark:bg-[#2a2a2a]`}>
        <span className={`truncate ${selected.length ? "text-slate-700 dark:text-slate-200" : "text-slate-400 dark:text-[#666]"}`}>
          {selected.length ? `${selected.length} complication${selected.length > 1 ? "s" : ""} recorded — click to edit` : "None — click to record complications"}
        </span>
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {dropdown}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map(item => (
            <span key={item} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
              {item}
              <button type="button" onClick={() => toggle(item)} className="text-red-400 hover:text-red-600 transition-colors">
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

const VENT_ASSISTED = [
  { v: "A/C",      label: "Assist/Control (A/C)" },
  { v: "PSV",      label: "Pressure Support (PSV)" },
  { v: "BiPAP",    label: "BiPAP" },
  { v: "CPAP",     label: "CPAP" },
  { v: "SIMV+PSV", label: "SIMV + PSV" },
  { v: "PAV",      label: "Proportional Assist (PAV)" },
]
const VENT_CONTROLLED = [
  { v: "VCV",  label: "Volume Control (VCV)" },
  { v: "PCV",  label: "Pressure Control (PCV)" },
  { v: "PRVC", label: "PRVC / VCRP" },
  { v: "APRV", label: "APRV / BiLevel" },
  { v: "HFOV", label: "HFOV" },
  { v: "VG",   label: "Volume Guarantee (VG)" },
]

export function IntraopForm({ defaultValues, defaultTimetable, preop, onSubmit, onBack, onAutoSave, onPostopContinued, layoutMode = "tabs", caseStarted: caseStartedProp = false, eventLog }: {
  defaultValues?: Partial<IntraopData>
  defaultTimetable?: TimetableData
  preop?: PreopSummary | null
  onSubmit: (data: IntraopData) => void
  onBack: () => void
  onAutoSave?: (data: any) => void
  onPostopContinued?: (items: string[]) => void
  layoutMode?: "tabs" | "scroll"
  caseStarted?: boolean
  eventLog?: any[]
}) {
  const t = useTranslations()
  const { register, handleSubmit, control, watch, setValue, getValues, formState } = useForm<IntraopData>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      monthYear: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` })(),
      drugsAdministered: [], vitals: [], positions: [], techniques: [],
      airwayDevices: [], ventilationModes: [], airwayTools: [],
      nbpMonitor: true, spO2Monitor: true, ecg: true,
      ...defaultValues,
    },
  })

  const EMPTY_TIMETABLE: TimetableData = { vitals: [], drugs: [], fluids: [], agents: [], infusions: [], clinicalEvents: [] }
  const safeTimetable = (defaultTimetable && !Array.isArray(defaultTimetable) && "vitals" in defaultTimetable)
    ? defaultTimetable : EMPTY_TIMETABLE
  const [timetable, setTimetable] = useState<TimetableData>(safeTimetable)
  const [timetableDirty, setTimetableDirty] = useState(false)
  const [manualSaved, setManualSaved] = useState(false)

  const liveDrugTotals = useMemo(() => {
    const bolusTotals: Record<string, { total: number; unit: string; count: number }> = {}
    for (const d of timetable.drugs ?? []) {
      const key = `${d.name}__${d.unit}`
      const n   = parseFloat(d.dose) || 0
      if (!bolusTotals[key]) bolusTotals[key] = { total: 0, unit: d.unit, count: 0 }
      bolusTotals[key].total += n
      bolusTotals[key].count++
    }
    const bolusList = Object.entries(bolusTotals).map(([key, v]) => ({
      name:    key.split("__")[0],
      total:   Math.round(v.total * 100) / 100,
      unit:    v.unit,
      count:   v.count,
      mgTotal: null as number | null,
    }))

    const infusionList = (timetable.infusions ?? []).map(inf => {
      const { amount, unit } = calcInfusionTotal(inf)
      const isML    = unit.toLowerCase() === "ml"
      const laConc  = isML ? parseLAConc(inf.name) : null
      const mgTotal = laConc !== null ? Math.round(amount * laConc * 10 * 100) / 100 : null
      return { name: inf.name, total: amount, unit, mgTotal }
    })

    return { bolusList, infusionList }
  }, [timetable.drugs, timetable.infusions])

  // Auto-calculate fluid totals from timetable whenever fluids change
  useEffect(() => {
    let crystalloids = 0, colloids = 0, blood = 0
    for (const f of timetable.fluids ?? []) {
      const vol = parseFloat(f.volume) || 0
      if (!vol) continue
      const cat = f.category ?? ""
      if (cat === "Crystalloids") crystalloids += vol
      else if (cat === "Colloids") colloids += vol
      else if (cat === "Blood products") blood += vol
    }
    setValue("crystalloidsMl", crystalloids || undefined)
    setValue("colloidsMl",     colloids     || undefined)
    setValue("bloodMl",        blood        || undefined)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timetable.fluids])

  // Smart monitoring defaults — fire once when technique first selected
  useEffect(() => {
    if (monDefaultsApplied.current) return
    const techs = watch("techniques") ?? []
    if (!techs.length) return
    monDefaultsApplied.current = true

    const isGA       = techs.some((t: string) => ["GENERAL_INHALATION","GENERAL_TIVA","GENERAL_COMBINED"].includes(t))
    const isTIVA     = techs.includes("GENERAL_TIVA")
    const isNeuraxial = techs.some((t: string) => t.startsWith("SPINAL") || t.startsWith("EPIDURAL") || t === "CSE" || t === "DPE")
    const isEmergency = preop?.emergencySurgery ?? false

    if (isGA) {
      setValue("ecg", true)
      setValue("spO2Monitor", true)
      setValue("nbpMonitor", true)
      setValue("etco2Monitor", true)
      setValue("tempMonitor", true)
      if (isTIVA) setValue("bis", true)
      if (isEmergency) setValue("invasiveBP", true)
    } else if (isNeuraxial) {
      setValue("ecg", true)
      setValue("spO2Monitor", true)
      setValue("nbpMonitor", true)
      setValue("etco2Monitor", true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(watch("techniques"))])

  // Debounced auto-save — skip on initial mount so loading a case never overwrites DB with form defaults
  const mountedRef   = useRef(false)
  // Keep a ref to the latest save function so the unmount effect can call it
  const pendingSaveRef = useRef<(() => void) | null>(null)

  const allValues = watch()
  // Watch array fields explicitly so their changes always trigger auto-save
  const _wAD = watch("airwayDevices")
  const _wVM = watch("ventilationModes")
  const _wAT = watch("airwayTools")
  const _wPS = watch("positions")
  // Watch airway sub-option fields for auto-collapse logic
  const _wTubeSize = watch("tubeSize")
  const _wCuffed   = watch("cuffed")
  const _wDltType  = watch("dltType")
  const _wDltSide  = watch("dltSide")
  const _wDltSize  = watch("dltSize")
  const _wEbSize   = watch("endobronchialSize")

  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return }
    if (!onAutoSave) return
    const safeT = (timetable && !Array.isArray(timetable) && "vitals" in timetable) ? timetable : EMPTY_TIMETABLE
    const payload = { ...getValues(), timetableData: safeT }
    const save = () => onAutoSave(payload)
    pendingSaveRef.current = save                    // always keep latest snapshot
    const timer = setTimeout(save, 1000)             // reduced from 2 s → 1 s
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(allValues), JSON.stringify(timetable), JSON.stringify(_wAD), JSON.stringify(_wVM), JSON.stringify(_wAT), JSON.stringify(_wPS)])

  // Fire pending save immediately when user navigates away (component unmounts)
  useEffect(() => {
    return () => {
      if (pendingSaveRef.current) pendingSaveRef.current()
    }
  }, [])
  const [showStartPrompt,      setShowStartPrompt]      = useState(false)
  const [showEndPrompt,        setShowEndPrompt]        = useState(false)
  const [ventExpanded,         setVentExpanded]         = useState<"assisted" | "controlled" | null>(null)
  const [presentsIntubated,    setPresentsIntubated]    = useState(false)
  const [airwayNA,             setAirwayNA]             = useState(false)
  const [timeErrors,           setTimeErrors]           = useState<{ startTime?: boolean; endTime?: boolean }>({})
  const [incompleteItems,      setIncompleteItems]      = useState<string[] | null>(null)
  const [advancedMonOpen,      setAdvancedMonOpen]      = useState(() =>
    typeof window !== "undefined" && localStorage.getItem("defaultMonitoring") === "advanced"
  )
  const [airwayExpandedDevice, setAirwayExpandedDevice] = useState<string | null>(null)
  const [showTemplates,        setShowTemplates]        = useState(false)
  const [activeTab,            setActiveTab]            = useState("overview")
  const [airwayOverride,       setAirwayOverride]       = useState(false)
  const monDefaultsApplied      = useRef(false)
  const deviceWasCompleteOnOpen = useRef(false)
  const timelineSectionRef = useRef<HTMLDivElement>(null)
  const startHourRef = useRef<HTMLSelectElement>(null)
  const endHourRef   = useRef<HTMLSelectElement>(null)

  function expandAirwayDevice(v: string) {
    const vals = getValues()
    deviceWasCompleteOnOpen.current = (() => {
      switch (v) {
        case "LMA":              return vals.tubeSize != null
        case "ORAL_ETT":
        case "NASAL_ETT":        return vals.tubeSize != null && vals.cuffed != null
        case "DOUBLE_LUMEN_TUBE":  return !!(vals.dltType && vals.dltSide && vals.dltSize != null)
        case "ENDOBRONCHIAL_TUBE": return vals.endobronchialSize != null
        default: return false
      }
    })()
    setAirwayExpandedDevice(v)
  }

  // Auto-collapse airway device panel when all required sub-options are selected
  useEffect(() => {
    if (!airwayExpandedDevice || deviceWasCompleteOnOpen.current) return
    const vals = getValues()
    const complete = (() => {
      switch (airwayExpandedDevice) {
        case "LMA":              return vals.tubeSize != null
        case "ORAL_ETT":
        case "NASAL_ETT":        return vals.tubeSize != null && vals.cuffed != null
        case "DOUBLE_LUMEN_TUBE":  return !!(vals.dltType && vals.dltSide && vals.dltSize != null)
        case "ENDOBRONCHIAL_TUBE": return vals.endobronchialSize != null
        default: return false
      }
    })()
    if (complete) setAirwayExpandedDevice(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_wTubeSize, _wCuffed, _wDltType, _wDltSide, _wDltSize, _wEbSize, airwayExpandedDevice])

  function nowHHMM() {
    const n = new Date()
    return `${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")}`
  }

  const techniques = watch("techniques") ?? []
  const startTime  = watch("startTime") || "08:00"
  const showAirway   = techniqueIsGeneral(techniques)
  const showGases    = techniqueUsesGas(techniques)
  const showBlock    = techniqueNeedsBlock(techniques)

  const monitoring = {
    nbpMonitor:    !!watch("nbpMonitor"),
    invasiveBP:    !!watch("invasiveBP"),
    ecg:           !!watch("ecg"),
    spO2Monitor:   !!watch("spO2Monitor"),
    etco2Monitor:  !!watch("etco2Monitor"),
    tempMonitor:   !!watch("tempMonitor"),
    bglMonitor:    !!watch("bglMonitor"),
  }

  function addMinutes(hhmm: string, minutes: number): string {
    const [h, m] = (hhmm || "00:00").split(":").map(Number)
    const total  = (h * 60 + m + minutes + 1440) % 1440
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
  }

  function handleContinue() {
    const vals = getValues()

    // ── Hard validation: date, startTime and endTime are mandatory ───────────
    const errs: { startTime?: boolean; endTime?: boolean } = {}
    if (!vals.startTime) errs.startTime = true
    if (!vals.endTime)   errs.endTime   = true
    if (Object.keys(errs).length > 0) {
      setTimeErrors(errs)
      setActiveTab("overview")
      setTimeout(() => timelineSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50)
      return
    }
    setTimeErrors({})

    // ── Soft validation: warn if key sections are completely empty ────────────
    const incomplete: string[] = []

    if (!(vals.techniques ?? []).length)
      incomplete.push("Anaesthesia technique")

    if (!presentsIntubated && !airwayNA &&
        !(vals.airwayDevices ?? []).length && !(vals.ventilationModes ?? []).length)
      incomplete.push("Airway management")

    if (!(vals.positions ?? []).length)
      incomplete.push("Patient position")

    const nonDefaultMonitoring = [
      vals.invasiveBP, vals.ecg, vals.etco2Monitor, vals.tempMonitor,
      vals.bglMonitor, vals.cvpMonitor, vals.paCatheter, vals.tee,
      vals.bis, vals.entropyMonitor, vals.nirsMonitor, vals.evokedPotentials,
      vals.tofMonitor, vals.bloodGasMonitor, vals.neuroMonitor,
    ].some(Boolean)
    if (!nonDefaultMonitoring)
      incomplete.push("Monitoring (only defaults)")

    if (!(vals.vascularAccesses ?? []).length)
      incomplete.push("Vascular access")

    const hasVitals = timetable.vitals.some(v => v && Object.values(v).some(x => x != null))
    if (!hasVitals)
      incomplete.push("Intraoperative vitals (timetable)")

    const hasDrugs = (timetable.drugs ?? []).length > 0 ||
                     (timetable.infusions ?? []).length > 0 ||
                     (timetable.agents ?? []).length > 0
    if (!hasDrugs)
      incomplete.push("Drugs / infusions / agents")

    const hasFluids = vals.crystalloidsMl || vals.colloidsMl || vals.bloodMl ||
                      (timetable.fluids ?? []).length > 0
    if (!hasFluids)
      incomplete.push("Fluid balance")

    if (!vals.complications)
      incomplete.push("Complications")

    if (incomplete.length > 0) {
      setIncompleteItems(incomplete)
      return
    }

    doSubmit()
  }

  function doSubmit() {
    // Bypass react-hook-form's Zod resolver — handleContinue already validates
    // the mandatory fields (startTime, endTime). Calling handleSubmit() here
    // causes Zod to reject fields it can't parse (e.g. null-vs-undefined
    // mismatches on Json array fields), which silently blocks navigation.
    handleSubmitWithTimetable(getValues() as IntraopData)
  }

  function handleManualSave() {
    if (!onAutoSave) return
    const safeT = (timetable && !Array.isArray(timetable) && "vitals" in timetable) ? timetable : EMPTY_TIMETABLE
    onAutoSave({ ...getValues(), timetableData: safeT })
    setTimetableDirty(false)
    setManualSaved(true)
    setTimeout(() => setManualSaved(false), 2000)
  }

  function handleSubmitWithTimetable(formData: IntraopData) {
    const vitals = (timetable.vitals ?? [])
      .map((v, i) => ({ ...v, time: addMinutes(startTime, i * 5) }))
      .filter(v => Object.values(v).some(x => x != null && x !== v.time))

    const infusionEntries = (timetable.infusions ?? []).map(inf => ({
      name:  inf.name,
      dose:  String(inf.rate),
      unit:  inf.unit,
      route: "Infusion",
      time:  addMinutes(startTime, inf.startCol * 5),
    }))
    const bolusDrugs = (timetable.drugs ?? []).map(d => ({
      name:  d.name,
      dose:  d.dose,
      unit:  d.unit,
      route: "IV",
      time:  addMinutes(startTime, d.colIdx * 5),
    }))

    onSubmit({ ...formData, vitals, drugsAdministered: [...bolusDrugs, ...infusionEntries], timetableData: timetable })
  }

  return (
    <form onSubmit={handleSubmit(handleSubmitWithTimetable)} className="flex flex-col gap-0">

      {/* Dual-mode layout — tabs or scroll, sharing the same section content */}
      {(() => {
        const tabOverview = (<>

      {/* Preop summary */}
      {preop && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">{t("intraop.preopSummary")}</p>
          {preop.diagnosis && (
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 leading-snug">{preop.diagnosis}</p>
          )}
          {preop.plannedProcedure && (
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-snug">{preop.plannedProcedure}</p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {preop.asaScore && (
              <span className="font-bold text-amber-800 dark:text-amber-300">
                ASA {preop.asaScore}{preop.emergencySurgery ? "E" : ""}
              </span>
            )}
            {preop.emergencySurgery && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-600 text-white">{t("intraop.emergencyBadge")}</span>
            )}
            {preop.bmi != null && <span className="text-slate-600 dark:text-slate-300">BMI {preop.bmi}</span>}
            {preop.heightCm && preop.weightKg && preop.sex && (() => {
              const ibw = calcIBW(preop.heightCm!, preop.sex as any)
              const abw = calcABW(ibw, preop.weightKg!)
              return <>
                <span className="text-slate-600 dark:text-slate-300">IBW {ibw} kg</span>
                {abw != null && <span className="text-slate-600 dark:text-slate-300">ABW {abw} kg</span>}
              </>
            })()}
            {(preop.bpSystolic || preop.heartRate || preop.spO2) && (
              <span className="text-slate-600 dark:text-slate-300">
                {preop.bpSystolic && preop.bpDiastolic ? `BP ${preop.bpSystolic}/${preop.bpDiastolic}` : ""}
                {preop.heartRate ? ` · HR ${preop.heartRate}` : ""}
                {preop.spO2 ? ` · SpO₂ ${preop.spO2}%` : ""}
              </span>
            )}
            {preop.mallampati && <span className="text-slate-600 dark:text-slate-300">Mallampati {preop.mallampati}</span>}
            {preop.difficultAirwayHistory && <span className="font-semibold text-orange-700 dark:text-orange-400">⚠ Difficult airway history</span>}
          </div>
          {preop.allergies && preop.allergyDetails && preop.allergyDetails.length > 0 && (
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">
              ⚠ Allergies: {preop.allergyDetails.map(a => a.label).join(", ")}
            </p>
          )}
          {Array.isArray(preop.comorbidities) && preop.comorbidities.length > 0 && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {preop.comorbidities.slice(0, 4).map(c => c.label).join(" · ")}
              {preop.comorbidities.length > 4 ? ` +${preop.comorbidities.length - 4} more` : ""}
            </p>
          )}
          {Array.isArray(preop.labResults) && preop.labResults.filter(l => l.value).length > 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {preop.labResults.filter(l => l.value).map(l => `${l.test} ${l.value}${l.unit ? " "+l.unit : ""}`).join(" · ")}
            </p>
          )}
        </div>
      )}

      {/* Equipment suggestions */}
      {preop && (preop.weightKg || preop.heightCm || preop.ageYears) && (
        <EquipmentSuggestions
          ageYears={preop.ageYears}
          weightKg={preop.weightKg}
          heightCm={preop.heightCm}
          sex={preop.sex}
          bmi={preop.bmi}
        />
      )}

      {/* Timeline */}
      <div ref={timelineSectionRef} data-tour="intraop-timing">
      <SectionCard title="Timeline of anaesthesia and surgery">
        {/* Quick Setup */}
        {(() => {
          type Template = {
            id: string; label: string; desc: string
            techniques: string[]
            monitoring: Partial<Record<string, boolean>>
            airwayDevices: string[]
            airwayTools?: string[]
          }
          const TEMPLATES: Template[] = [
            {
              id: "std-ga",
              label: "Standard GA",
              desc: "Inhalational · Oral ETT · Full monitoring",
              techniques: ["GENERAL_INHALATION"],
              monitoring: { ecg: true, spO2Monitor: true, nbpMonitor: true, etco2Monitor: true, tempMonitor: true },
              airwayDevices: ["ORAL_ETT"],
            },
            {
              id: "tiva",
              label: "TIVA",
              desc: "Propofol infusion · Oral ETT · BIS",
              techniques: ["GENERAL_TIVA"],
              monitoring: { ecg: true, spO2Monitor: true, nbpMonitor: true, etco2Monitor: true, tempMonitor: true, bis: true },
              airwayDevices: ["ORAL_ETT"],
            },
            {
              id: "spinal-cs",
              label: "Spinal C-Section",
              desc: "Single-shot spinal · Face mask",
              techniques: ["SPINAL_SINGLE"],
              monitoring: { ecg: true, spO2Monitor: true, nbpMonitor: true, etco2Monitor: true },
              airwayDevices: ["FACE_MASK"],
            },
            {
              id: "paed-inhal",
              label: "Paediatric Inhalational",
              desc: "Sevoflurane induction · Face mask",
              techniques: ["GENERAL_INHALATION"],
              monitoring: { ecg: true, spO2Monitor: true, nbpMonitor: true, etco2Monitor: true, tempMonitor: true },
              airwayDevices: ["FACE_MASK"],
            },
            {
              id: "awake-foi",
              label: "Awake Fiberoptic",
              desc: "FOI · Topical LA · Oral ETT",
              techniques: ["GENERAL_INHALATION"],
              monitoring: { ecg: true, spO2Monitor: true, nbpMonitor: true, etco2Monitor: true },
              airwayDevices: ["ORAL_ETT"],
              airwayTools: ["FOB", "AWAKE"],
            },
          ]
          function applyTemplate(tpl: Template) {
            const currentDevs: string[] = watch("airwayDevices") ?? []
            const currentTech: string[] = watch("techniques") ?? []
            if (currentDevs.length || currentTech.length) {
              if (!window.confirm(`Apply "${tpl.label}" template? This will overwrite existing technique and airway selections.`)) return
            }
            setValue("techniques", tpl.techniques)
            setValue("airwayDevices", tpl.airwayDevices)
            if (tpl.airwayTools) setValue("airwayTools", tpl.airwayTools)
            const MON_FIELDS = ["ecg","spO2Monitor","nbpMonitor","etco2Monitor","tempMonitor","invasiveBP","cvpMonitor","paCatheter","tee","bis","entropyMonitor","nirsMonitor","evokedPotentials","tofMonitor","bglMonitor","bloodGasMonitor","urinaryCatheter","stomachTube"]
            MON_FIELDS.forEach(f => setValue(f as any, tpl.monitoring[f] ?? false))
            monDefaultsApplied.current = true
            const ADVANCED = ["etco2Monitor","tempMonitor","invasiveBP","cvpMonitor","paCatheter","tee","bis","entropyMonitor","nirsMonitor","evokedPotentials","tofMonitor","bglMonitor","bloodGasMonitor","urinaryCatheter","stomachTube"]
            if (ADVANCED.some(f => tpl.monitoring[f])) setAdvancedMonOpen(true)
            const SUB = ["LMA","ORAL_ETT","NASAL_ETT","DOUBLE_LUMEN_TUBE","ENDOBRONCHIAL_TUBE"]
            const firstSub = tpl.airwayDevices.find(d => SUB.includes(d))
            if (firstSub) setAirwayExpandedDevice(firstSub)
            setShowTemplates(false)
          }
          return (
            <div>
              <button type="button"
                onClick={() => setShowTemplates(v => !v)}
                className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors border border-slate-200 dark:border-[#333] rounded-lg px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-[#1e1e1e]">
                <span className={`transition-transform text-[10px] ${showTemplates ? "rotate-90" : ""}`}>▶</span>
                Quick Setup
              </button>
              {showTemplates && (
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {TEMPLATES.map(tpl => (
                    <button key={tpl.id} type="button"
                      onClick={() => applyTemplate(tpl)}
                      className="text-left rounded-lg border-2 border-slate-200 dark:border-[#333] px-3 py-2.5 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 dark:hover:border-blue-600 transition-all group">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 group-hover:text-blue-700 dark:group-hover:text-blue-300">{tpl.label}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{tpl.desc}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })()}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label>{t("intraop.date")}</Label>
            <Controller name="monthYear" control={control} render={({ field }) => {
              const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]
              const currentYear = new Date().getFullYear()
              const years = Array.from({ length: 11 }, (_, i) => currentYear - i)
              const [selYear, selMonth] = field.value?.split("-") ?? ["", ""]
              return (
                <div className="flex gap-2">
                  <select value={selMonth ?? ""}
                    onChange={e => field.onChange(selYear ? `${selYear}-${e.target.value}` : "")}
                    className="flex-1 h-9 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-[#1c1c1c] dark:border-[#3a3a3a] dark:text-slate-100">
                    <option value="">Month</option>
                    {MONTHS.map((m, i) => <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>)}
                  </select>
                  <select value={selYear ?? ""}
                    onChange={e => field.onChange(selMonth ? `${e.target.value}-${selMonth}` : "")}
                    className="w-28 h-9 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-[#1c1c1c] dark:border-[#3a3a3a] dark:text-slate-100">
                    <option value="">Year</option>
                    {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
                  </select>
                </div>
              )
            }} />
          </div>
          {/* Start time + START CASE */}
          <div className="space-y-1">
            <Label className={timeErrors.startTime ? "text-red-600 dark:text-red-400" : ""}>{t("intraop.startTime")} {timeErrors.startTime && <span className="font-normal">— required</span>}</Label>
            <div className={`flex items-center gap-2 ${timeErrors.startTime ? "ring-2 ring-red-400 rounded-lg p-0.5" : ""}`}>
              <Controller name="startTime" control={control} render={({ field }) => (
                <TimePicker ref={startHourRef} value={field.value} onChange={v => { field.onChange(v); setTimeErrors(e => ({ ...e, startTime: false })) }} />
              )} />
              {!watch("startTime") && !watch("endTime") && (
                <button type="button"
                  onClick={() => { setShowStartPrompt(v => !v); setShowEndPrompt(false) }}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full border-2 border-blue-400 text-blue-500 hover:bg-blue-500 hover:text-white transition-colors whitespace-nowrap">
                  Start Case
                </button>
              )}
            </div>
            {!watch("startTime") && !watch("endTime") && showStartPrompt && (
              <div className="mt-1 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 p-3 flex gap-2">
                <button type="button"
                  onClick={() => {
                    const now  = new Date()
                    const time = nowHHMM()
                    setValue("startTime", time)
                    setShowStartPrompt(false)
                    // Fire an immediate save so the case status becomes
                    // "In theatre" on the dashboard without waiting for the debounce
                    if (onAutoSave) {
                      const safeT = (timetable && !Array.isArray(timetable) && "vitals" in timetable)
                        ? timetable : EMPTY_TIMETABLE
                      onAutoSave({ ...getValues(), startTime: time, timetableData: safeT })
                    }
                  }}
                  className="flex-1 text-sm font-semibold px-3 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white transition-colors">
                  Start now
                </button>
                <button type="button"
                  onClick={() => { setShowStartPrompt(false); setTimeout(() => startHourRef.current?.focus(), 50) }}
                  className="flex-1 text-sm text-blue-600 dark:text-blue-400 font-medium px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-[#2a2a2a] hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors">
                  Write manually
                </button>
              </div>
            )}
          </div>

          {/* End date + time + END CASE */}
          <div className="space-y-1">
            <Label className={timeErrors.endTime ? "text-red-600 dark:text-red-400" : ""}>{t("intraop.endTime")} {timeErrors.endTime && <span className="font-normal">— required</span>}</Label>
            <div className={`flex items-center gap-2 flex-wrap ${timeErrors.endTime ? "ring-2 ring-red-400 rounded-lg p-0.5" : ""}`}>
              {/* Crosses midnight toggle */}
              <Controller name="endTimeNextDay" control={control} render={({ field }) => (
                <button type="button"
                  onClick={() => field.onChange(!field.value)}
                  className={`text-xs px-2 py-1 rounded border transition-colors whitespace-nowrap
                    ${field.value
                      ? "bg-amber-100 dark:bg-amber-900/30 border-amber-400 text-amber-700 dark:text-amber-300"
                      : "border-slate-200 dark:border-[#3a3a3a] text-slate-400 hover:border-slate-400"}`}>
                  +1 day
                </button>
              )} />
              <Controller name="endTime" control={control} render={({ field }) => (
                <TimePicker ref={endHourRef} value={field.value} onChange={field.onChange} />
              )} />
              {!watch("endTime") && (
                <button type="button"
                  onClick={() => { setShowEndPrompt(v => !v); setShowStartPrompt(false) }}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full border-2 border-red-400 text-red-500 hover:bg-red-500 hover:text-white transition-colors whitespace-nowrap">
                  End Case
                </button>
              )}
            </div>
            {!watch("endTime") && showEndPrompt && (
              <div className="mt-1 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3 flex gap-2">
                <Controller name="endTime" control={control} render={({ field }) => (
                  <button type="button"
                    onClick={() => {
                      const now = new Date()
                      field.onChange(`${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`)
                      const st = getValues("startTime") || "00:00"
                      const [sh, sm] = st.split(":").map(Number)
                      if (now.getHours() * 60 + now.getMinutes() < sh * 60 + sm) setValue("endTimeNextDay", true)
                      setShowEndPrompt(false)
                    }}
                    className="flex-1 text-sm font-semibold px-3 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors">
                    End now
                  </button>
                )} />
                <button type="button"
                  onClick={() => { setShowEndPrompt(false); setTimeout(() => endHourRef.current?.focus(), 50) }}
                  className="flex-1 text-sm text-red-600 dark:text-red-400 font-medium px-3 py-2 rounded-lg border border-red-200 dark:border-red-800 bg-white dark:bg-[#2a2a2a] hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors">
                  Write manually
                </button>
              </div>
            )}
          </div>
        </div>
      </SectionCard>
      </div>

      {/* Positions (multi-select) */}
      <SectionCard title={t("intraop.positionSection")} collapsible
        badge={(() => { const sel: string[] = watch("positions") ?? []; return sel.length ? sel.map(v => POSITIONS.find(p => p.v === v)?.label ?? v).join(", ") : undefined })()}>
        <Controller name="positions" control={control} render={({ field }) => {
          const selected: string[] = field.value ?? []
          function toggle(v: string) {
            field.onChange(
              selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v]
            )
          }
          return (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {POSITIONS.map(opt => {
                const on = selected.includes(opt.v)
                return (
                  <button key={opt.v} type="button" onClick={() => toggle(opt.v)}
                    className={`rounded-xl border-2 p-2.5 text-center transition-all ${
                      on ? opt.sel + " scale-105 shadow-sm"
                         : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-[#888] hover:border-slate-300 dark:hover:border-[#555]"
                    }`}>
                    <div className="text-xs font-bold leading-tight">{opt.label}</div>
                    <div className="text-[9px] mt-1 leading-tight opacity-75">{opt.desc}</div>
                  </button>
                )
              })}
            </div>
          )
        }} />
      </SectionCard>

        </>)
        const tabAnaesthesia = (<>

      {/* Monitoring */}
      <div data-tour="intraop-monitoring">
      <SectionCard title={t("intraop.monitoringSection")} collapsible
        badge={(() => { const tot = MONITORING.filter(m => watch(m.field as any)).length; return tot ? `${tot} active` : undefined })()}>

        <div className="space-y-4">
          {/* Standard monitoring — always visible, pre-selected */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Standard</p>
            <div className="flex flex-wrap gap-2">
              {MONITORING.filter(m => ["ecg","spO2Monitor","nbpMonitor"].includes(m.field)).map(m => {
                const on = watch(m.field as any) as boolean
                return (
                  <button key={m.field} type="button"
                    onClick={() => setValue(m.field as any, !on)}
                    className={`px-3 py-1.5 rounded-lg border-2 text-xs font-semibold transition-all ${
                      on
                        ? "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white scale-105 shadow-sm"
                        : "border-slate-200 dark:border-[#333] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#444] hover:bg-slate-50 dark:hover:bg-[#1e1e1e]"
                    }`}>
                    {m.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Advanced monitoring — collapsible */}
          {(() => {
            const ADVANCED_FIELDS = MONITORING.filter(m => !["ecg","spO2Monitor","nbpMonitor"].includes(m.field))
            const advCount = ADVANCED_FIELDS.filter(m => watch(m.field as any) as boolean).length
            return (
              <div>
                <button type="button"
                  onClick={() => setAdvancedMonOpen(v => !v)}
                  className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                  <span className={`transition-transform ${advancedMonOpen ? "rotate-90" : ""}`}>▶</span>
                  Advanced Monitoring
                  {advCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full bg-slate-700 text-white text-[10px] font-bold">{advCount}</span>
                  )}
                </button>
                {advancedMonOpen && (
                  <div className="mt-3 space-y-3">
                    {(["Standard","Haemodynamic","Depth / Neuro","Other"] as const).map(cat => {
                      const items = ADVANCED_FIELDS.filter(m => m.cat === cat)
                      if (!items.length) return null
                      const catLabel = cat === "Standard" ? "Respiratory" : cat
                      return (
                        <div key={cat}>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{catLabel}</p>
                          <div className="flex flex-wrap gap-2">
                            {items.map(m => {
                              const on = watch(m.field as any) as boolean
                              return (
                                <button key={m.field} type="button"
                                  onClick={() => setValue(m.field as any, !on)}
                                  className={`px-3 py-1.5 rounded-lg border-2 text-xs font-semibold transition-all ${
                                    on
                                      ? "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white scale-105 shadow-sm"
                                      : "border-slate-200 dark:border-[#333] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#444] hover:bg-slate-50 dark:hover:bg-[#1e1e1e]"
                                  }`}>
                                  {m.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      </SectionCard>
      </div>{/* /intraop-monitoring */}

      {/* Anaesthesia technique */}
      <div data-tour="intraop-technique">
      <SectionCard title={t("intraop.techniqueSection")} collapsible
        badge={techniques.length ? techniques.slice(0,2).join(", ").replace(/_/g," ") : undefined}>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <Controller name="techniques" control={control} render={({ field }) => (
                <TechniqueTree value={field.value ?? []} onChange={field.onChange} />
              )} />
            </div>
            <button type="button"
              onClick={() => setPresentsIntubated(v => !v)}
              title="Patient arrives already intubated and sedated — hides the Airway Management section"
              className={`shrink-0 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border-2 leading-tight text-center max-w-[120px] transition-all ${
                presentsIntubated
                  ? "bg-amber-500 border-amber-500 text-white shadow-sm"
                  : "border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"
              }`}>
              {presentsIntubated ? "Presents intubated ✓" : "Presents intubated from ICU / ward"}
            </button>
          </div>
        </div>
      </SectionCard>

      {/* Airway Management — gated: hidden for non-GA unless overridden */}
      {!presentsIntubated && !showAirway && !!techniques.length && !airwayOverride && (
        <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 px-1">
          <span>Airway management hidden for selected technique.</span>
          <button type="button" onClick={() => setAirwayOverride(true)}
            className="text-blue-500 hover:text-blue-700 font-semibold underline underline-offset-2">
            Show anyway →
          </button>
        </div>
      )}
      {!presentsIntubated && (showAirway || !techniques.length || airwayOverride) && <SectionCard title="Airway Management" collapsible>
        {/* N/A toggle */}
        <div className="flex items-center gap-2">
          <button type="button"
            onClick={() => setAirwayNA(v => !v)}
            className={`text-xs font-semibold px-3 py-1 rounded-full border-2 transition-all ${
              airwayNA
                ? "bg-slate-400 border-slate-400 text-white"
                : "border-slate-300 dark:border-[#444] text-slate-400 dark:text-[#666] hover:border-slate-400 hover:text-slate-500"
            }`}>
            N/A
          </button>
          {airwayNA && <span className="text-xs text-slate-400 dark:text-[#666]">No airway intervention documented</span>}
        </div>

        {!airwayNA && <>
        {/* Airway management instruments — multi-select */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Airway management instruments</p>
          <div className="flex flex-wrap gap-2">
            {([
              { v: "VIDEO_LARY",    label: "Video laryngoscopy"          },
              { v: "DIRECT_LARY",   label: "Direct laryngoscopy"         },
              { v: "FOB",           label: "Fibreoptic bronchoscopy"     },
              { v: "BOUGIE",        label: "Bougie"                      },
              { v: "STYLET",        label: "Intubation stylet"           },
              { v: "AWAKE",         label: "Awake intubation"            },
              { v: "RETROGRADE",    label: "Retrograde intubation"       },
              { v: "SUPRAGLOTTIC",  label: "Supraglottic as conduit"     },
            ] as { v: string; label: string }[]).map(({ v, label }) => {
              const tools: string[] = watch("airwayTools") ?? []
              const on = tools.includes(v)
              return (
                <button key={v} type="button"
                  onClick={() => setValue("airwayTools", on ? tools.filter(t => t !== v) : [...tools, v])}
                  className={`px-3 py-1.5 rounded-lg border-2 text-sm font-semibold transition-all ${
                    on ? "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white"
                       : "border-slate-200 dark:border-[#333] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#444] hover:bg-slate-50 dark:hover:bg-[#1e1e1e]"
                  }`}>
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Cormack-Lehane grade — shown when direct or video laryngoscopy performed */}
        {(watch("airwayTools") ?? []).some(t => ["DIRECT_LARY","VIDEO_LARY"].includes(t)) && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Cormack–Lehane grade at laryngoscopy</p>
            <Controller name="cormackLehane" control={control} render={({ field }) => (
              <div className="grid grid-cols-5 gap-2">
                {([
                  {
                    v: "I", label: "I", color: "bg-green-500 border-green-500 dark:bg-green-700 dark:border-green-600 text-white",
                    desc: "Full glottis",
                    svg: (
                      <svg viewBox="0 0 44 32" className="w-10 h-7 mx-auto mb-1">
                        <ellipse cx="22" cy="26" rx="16" ry="5" fill="currentColor" opacity="0.2"/>
                        <path d="M22 6 L8 26 L36 26 Z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round"/>
                        <line x1="8" y1="26" x2="36" y2="26" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3,2"/>
                      </svg>
                    ),
                  },
                  {
                    v: "IIa", label: "IIa", color: "bg-lime-500 border-lime-500 dark:bg-lime-700 dark:border-lime-600 text-white",
                    desc: "Posterior commissure",
                    svg: (
                      <svg viewBox="0 0 44 32" className="w-10 h-7 mx-auto mb-1">
                        <rect x="0" y="0" width="44" height="14" fill="currentColor" opacity="0.3" rx="2"/>
                        <path d="M22 14 L10 26 L34 26 Z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round"/>
                        <line x1="10" y1="26" x2="34" y2="26" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3,2"/>
                      </svg>
                    ),
                  },
                  {
                    v: "IIb", label: "IIb", color: "bg-yellow-500 border-yellow-500 dark:bg-yellow-700 dark:border-yellow-600 text-white",
                    desc: "Arytenoids only",
                    svg: (
                      <svg viewBox="0 0 44 32" className="w-10 h-7 mx-auto mb-1">
                        <rect x="0" y="0" width="44" height="18" fill="currentColor" opacity="0.3" rx="2"/>
                        <path d="M22 18 L16 26 L28 26 Z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round"/>
                        <line x1="16" y1="26" x2="28" y2="26" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2,2"/>
                      </svg>
                    ),
                  },
                  {
                    v: "III", label: "III", color: "bg-orange-500 border-orange-500 dark:bg-orange-700 dark:border-orange-600 text-white",
                    desc: "Epiglottis only",
                    svg: (
                      <svg viewBox="0 0 44 32" className="w-10 h-7 mx-auto mb-1">
                        <rect x="0" y="0" width="44" height="22" fill="currentColor" opacity="0.3" rx="2"/>
                        <path d="M8 22 Q22 10 36 22" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                      </svg>
                    ),
                  },
                  {
                    v: "IV", label: "IV", color: "bg-red-500 border-red-500 dark:bg-red-700 dark:border-red-600 text-white",
                    desc: "No view",
                    svg: (
                      <svg viewBox="0 0 44 32" className="w-10 h-7 mx-auto mb-1">
                        <rect x="0" y="0" width="44" height="32" fill="currentColor" opacity="0.25" rx="2"/>
                        <line x1="12" y1="10" x2="32" y2="22" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                        <line x1="32" y1="10" x2="12" y2="22" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                      </svg>
                    ),
                  },
                ] as const).map(opt => (
                  <button key={opt.v} type="button"
                    onClick={() => field.onChange(field.value === opt.v ? undefined : opt.v)}
                    className={`rounded-xl border-2 p-2.5 text-center transition-all ${
                      field.value === opt.v
                        ? opt.color + " shadow-sm"
                        : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#555]"
                    }`}>
                    {opt.svg}
                    <div className="text-sm font-bold leading-none">{opt.label}</div>
                    <div className="text-[9px] mt-1 leading-tight opacity-80">{opt.desc}</div>
                  </button>
                ))}
              </div>
            )} />
          </div>
        )}

        {/* Device — multi-select with collapse-after-selection */}
        {(() => {
          const devs: string[] = watch("airwayDevices") ?? []
          const tubeSize = watch("tubeSize")
          const cuffed   = watch("cuffed")
          const dltType  = watch("dltType")
          const dltSide  = watch("dltSide")
          const dltSize  = watch("dltSize")
          const ebSize   = watch("endobronchialSize")

          // Summary labels for devices with sub-options when collapsed
          const deviceSummary: Record<string, string | null> = {
            LMA:               tubeSize != null ? `LMA ${tubeSize}` : null,
            ORAL_ETT:          tubeSize != null && cuffed != null ? `Oral ETT ${tubeSize} ${cuffed ? "Cuffed" : "Uncuffed"}` : null,
            NASAL_ETT:         tubeSize != null && cuffed != null ? `Nasal ETT ${tubeSize} ${cuffed ? "Cuffed" : "Uncuffed"}` : null,
            DOUBLE_LUMEN_TUBE: (dltType || dltSide || dltSize != null) ? `DLT${dltType ? " " + dltType : ""}${dltSide ? " " + dltSide : ""}${dltSize != null ? " " + dltSize + "Fr" : ""}` : null,
            ENDOBRONCHIAL_TUBE:ebSize != null ? `Endobronchial ${ebSize}mm` : null,
          }
          const HAS_SUBOPTIONS = ["LMA","ORAL_ETT","NASAL_ETT","DOUBLE_LUMEN_TUBE","ENDOBRONCHIAL_TUBE"]

          const DEVICES: { v: string; label: string }[] = [
            { v: "FACE_MASK",         label: "Face Mask"         },
            { v: "OPA",               label: "Oral airway"       },
            { v: "NPA",               label: "Nasal airway"      },
            { v: "LMA",               label: "LMA"               },
            { v: "ORAL_ETT",          label: "Oral ETT"          },
            { v: "NASAL_ETT",         label: "Nasal ETT"         },
            { v: "DOUBLE_LUMEN_TUBE", label: "Double Lumen Tube" },
            { v: "ENDOBRONCHIAL_TUBE",label: "Endobronchial Tube"},
            { v: "SURGICAL_AIRWAY",   label: "Surgical Airway"   },
          ]

          function handleDeviceClick(v: string) {
            const isOn = devs.includes(v)
            if (isOn) {
              // deselect — remove device and collapse
              setValue("airwayDevices", devs.filter(d => d !== v))
              if (airwayExpandedDevice === v) setAirwayExpandedDevice(null)
            } else {
              // select — add device and expand if it has sub-options
              setValue("airwayDevices", [...devs, v])
              if (HAS_SUBOPTIONS.includes(v)) expandAirwayDevice(v)
            }
          }

          return (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Device</p>
              <div className="flex flex-wrap gap-2">
                {DEVICES.map(({ v, label }) => {
                  const on = devs.includes(v)
                  const summary = on && HAS_SUBOPTIONS.includes(v) ? deviceSummary[v] : null
                  const isExpanded = airwayExpandedDevice === v
                  const btnLabel = summary && !isExpanded ? summary : label
                  return (
                    <button key={v} type="button"
                      onClick={() => {
                        if (on && HAS_SUBOPTIONS.includes(v)) {
                          // toggle expand/collapse without deselecting
                          isExpanded ? setAirwayExpandedDevice(null) : expandAirwayDevice(v)
                        } else {
                          handleDeviceClick(v)
                        }
                      }}
                      onContextMenu={e => { e.preventDefault(); handleDeviceClick(v) }}
                      title={on && HAS_SUBOPTIONS.includes(v) ? (isExpanded ? "Click to collapse · Right-click to remove" : "Click to edit · Right-click to remove") : undefined}
                      className={`px-3 py-1.5 rounded-lg border-2 text-sm font-semibold transition-all ${
                        on
                          ? summary && !isExpanded
                            ? "bg-blue-700 border-blue-600 text-white dark:bg-blue-800 dark:border-blue-700 shadow-sm"
                            : "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white"
                          : "border-slate-200 dark:border-[#333] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#444] hover:bg-slate-50 dark:hover:bg-[#1e1e1e]"
                      }`}>
                      {btnLabel}
                    </button>
                  )
                })}
              </div>

              {/* Sub-option panels — LMA */}
              {devs.includes("LMA") && airwayExpandedDevice === "LMA" && (
                <div className="rounded-lg border border-slate-200 dark:border-[#333] bg-slate-50 dark:bg-[#1a1a1a] p-3 space-y-3">
                  <div className="w-40 space-y-1">
                    <Label>LMA Size</Label>
                    <RangeSelect name="tubeSize" control={control} min={1} max={5} step={0.5} placeholder="— size" />
                  </div>
                </div>
              )}

              {/* Sub-option panels — Oral/Nasal ETT */}
              {devs.some(d => ["ORAL_ETT","NASAL_ETT"].includes(d)) && ["ORAL_ETT","NASAL_ETT"].includes(airwayExpandedDevice ?? "") && (
                <div className="rounded-lg border border-slate-200 dark:border-[#333] bg-slate-50 dark:bg-[#1a1a1a] p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label>Tube Size (mm ID)</Label>
                      <RangeSelect name="tubeSize" control={control} min={4} max={9.5} step={0.5} placeholder="— size" />
                    </div>
                    <div className="space-y-1">
                      <Label>Cuffed</Label>
                      <div className="flex gap-2">
                        {([{ v: true, label: "Cuffed" }, { v: false, label: "Uncuffed" }] as const).map(opt => (
                          <button key={String(opt.v)} type="button"
                            onClick={() => setValue("cuffed", cuffed === opt.v ? undefined : opt.v)}
                            className={`flex-1 text-sm py-1.5 rounded-lg border-2 font-semibold transition-all ${
                              cuffed === opt.v
                                ? "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white"
                                : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-400"
                            }`}>{opt.label}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Sub-option panels — Double Lumen Tube */}
              {devs.includes("DOUBLE_LUMEN_TUBE") && airwayExpandedDevice === "DOUBLE_LUMEN_TUBE" && (
                <div className="rounded-lg border border-slate-200 dark:border-[#333] bg-slate-50 dark:bg-[#1a1a1a] p-3 space-y-3">
                  <div className="grid grid-cols-3 gap-4">
                    {/* Type */}
                    <div className="space-y-1">
                      <Label>Type</Label>
                      <div className="flex gap-2">
                        {(["Carlens","Robertshaw"] as const).map(t => (
                          <button key={t} type="button"
                            onClick={() => setValue("dltType", dltType === t ? undefined : t)}
                            className={`flex-1 text-xs py-1.5 rounded-lg border-2 font-semibold transition-all ${
                              dltType === t
                                ? "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white"
                                : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-400"
                            }`}>{t}</button>
                        ))}
                      </div>
                    </div>
                    {/* Side */}
                    <div className="space-y-1">
                      <Label>Side</Label>
                      <div className="flex gap-2">
                        {(["Left","Right"] as const).map(s => (
                          <button key={s} type="button"
                            onClick={() => setValue("dltSide", dltSide === s ? undefined : s)}
                            className={`flex-1 text-xs py-1.5 rounded-lg border-2 font-semibold transition-all ${
                              dltSide === s
                                ? "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white"
                                : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-400"
                            }`}>{s}</button>
                        ))}
                      </div>
                    </div>
                    {/* Size pills — Fr sizes */}
                    <div className="space-y-1">
                      <Label>Size (Fr)</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {[26,28,32,35,37,39,41].map(sz => (
                          <button key={sz} type="button"
                            onClick={() => setValue("dltSize", dltSize === sz ? undefined : sz)}
                            className={`px-2.5 py-1 rounded-full text-xs font-semibold border-2 transition-all ${
                              dltSize === sz
                                ? "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white"
                                : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-400"
                            }`}>{sz}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Sub-option panels — Endobronchial Tube */}
              {devs.includes("ENDOBRONCHIAL_TUBE") && airwayExpandedDevice === "ENDOBRONCHIAL_TUBE" && (
                <div className="rounded-lg border border-slate-200 dark:border-[#333] bg-slate-50 dark:bg-[#1a1a1a] p-3 space-y-3">
                  <div className="space-y-1">
                    <Label>Size (mm ID)</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {[6.0,6.5,7.0,7.5,8.0].map(sz => (
                        <button key={sz} type="button"
                          onClick={() => setValue("endobronchialSize", ebSize === sz ? undefined : sz)}
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold border-2 transition-all ${
                            ebSize === sz
                              ? "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white"
                              : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-400"
                          }`}>{sz}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {/* Ventilation — hierarchical multi-select */}
        <div className="space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Ventilation mode</p>
          <div className="flex flex-wrap gap-2">
            {/* Spontaneous */}
            {(() => {
              const modes: string[] = watch("ventilationModes") ?? []
              const on = modes.includes("Spontaneous")
              return (
                <button type="button"
                  onClick={() => setValue("ventilationModes", on ? modes.filter(m => m !== "Spontaneous") : [...modes, "Spontaneous"])}
                  className={`px-3 py-1.5 rounded-lg border-2 text-sm font-semibold transition-all ${
                    on ? "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white"
                       : "border-slate-200 dark:border-[#333] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#444] hover:bg-slate-50 dark:hover:bg-[#1e1e1e]"
                  }`}>Spontaneous</button>
              )
            })()}
            {/* Assisted — expander */}
            {(() => {
              const modes: string[] = watch("ventilationModes") ?? []
              const hasAny = VENT_ASSISTED.some(m => modes.includes(m.v))
              const open   = ventExpanded === "assisted"
              return (
                <button type="button"
                  onClick={() => setVentExpanded(open ? null : "assisted")}
                  className={`px-3 py-1.5 rounded-lg border-2 text-sm font-semibold transition-all flex items-center gap-1 ${
                    hasAny ? "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white"
                           : "border-slate-200 dark:border-[#333] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#444] hover:bg-slate-50 dark:hover:bg-[#1e1e1e]"
                  }`}>
                  Assisted <span className="text-[10px]">{open ? "▲" : "▼"}</span>
                </button>
              )
            })()}
            {/* Controlled — expander */}
            {(() => {
              const modes: string[] = watch("ventilationModes") ?? []
              const hasAny = VENT_CONTROLLED.some(m => modes.includes(m.v))
              const open   = ventExpanded === "controlled"
              return (
                <button type="button"
                  onClick={() => setVentExpanded(open ? null : "controlled")}
                  className={`px-3 py-1.5 rounded-lg border-2 text-sm font-semibold transition-all flex items-center gap-1 ${
                    hasAny ? "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white"
                           : "border-slate-200 dark:border-[#333] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#444] hover:bg-slate-50 dark:hover:bg-[#1e1e1e]"
                  }`}>
                  Controlled <span className="text-[10px]">{open ? "▲" : "▼"}</span>
                </button>
              )
            })()}
            {/* Jet ventilation — standalone */}
            {(() => {
              const modes: string[] = watch("ventilationModes") ?? []
              const on = modes.includes("Jet")
              return (
                <button type="button"
                  onClick={() => setValue("ventilationModes", on ? modes.filter(m => m !== "Jet") : [...modes, "Jet"])}
                  className={`px-3 py-1.5 rounded-lg border-2 text-sm font-semibold transition-all ${
                    on ? "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white"
                       : "border-slate-200 dark:border-[#333] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#444] hover:bg-slate-50 dark:hover:bg-[#1e1e1e]"
                  }`}>Jet ventilation</button>
              )
            })()}
          </div>

          {/* Assisted sub-modes */}
          {ventExpanded === "assisted" && (
            <div className="flex flex-wrap gap-1.5 pl-3 border-l-2 border-slate-200 dark:border-[#3a3a3a]">
              {VENT_ASSISTED.map(({ v, label }) => {
                const modes: string[] = watch("ventilationModes") ?? []
                const on = modes.includes(v)
                return (
                  <button key={v} type="button"
                    onClick={() => setValue("ventilationModes", on ? modes.filter(m => m !== v) : [...modes, v])}
                    className={`px-2.5 py-1 rounded-lg border-2 text-xs font-semibold transition-all ${
                      on ? "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white"
                         : "border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-[#555]"
                    }`}>{label}</button>
                )
              })}
            </div>
          )}

          {/* Controlled sub-modes */}
          {ventExpanded === "controlled" && (
            <div className="flex flex-wrap gap-1.5 pl-3 border-l-2 border-slate-200 dark:border-[#3a3a3a]">
              {VENT_CONTROLLED.map(({ v, label }) => {
                const modes: string[] = watch("ventilationModes") ?? []
                const on = modes.includes(v)
                return (
                  <button key={v} type="button"
                    onClick={() => setValue("ventilationModes", on ? modes.filter(m => m !== v) : [...modes, v])}
                    className={`px-2.5 py-1 rounded-lg border-2 text-xs font-semibold transition-all ${
                      on ? "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white"
                         : "border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-[#555]"
                    }`}>{label}</button>
                )
              })}
            </div>
          )}

        </div>

        {/* Notes */}
        <div className="space-y-1">
          <Label>Airway notes</Label>
          <Textarea {...register("airwayNotes")}
            placeholder="No patient-identifying information — difficult airway plan, technique used, Cormack–Lehane grade at laryngoscopy, complications during intubation…"
            rows={2} className="text-sm" />
        </div>
        </>}
      </SectionCard>}

      {/* Vascular access */}
      <SectionCard title="Vascular Access" collapsible defaultCollapsed
        badge={(() => { const a = (watch("vascularAccesses") ?? []) as any[]; return a.length ? `${a.length} access${a.length > 1 ? "es" : ""}` : undefined })()}>

        <Controller name="vascularAccesses" control={control} render={({ field }) => (
          <VascularAccessTree
            value={(field.value ?? []) as VascularAccess[]}
            onChange={field.onChange}
          />
        )} />
      </SectionCard>

      {/* Premedication */}
      <SectionCard title={t("intraop.premedicationSection")} collapsible defaultCollapsed
        badge={[watch("premedicationEvening"), watch("premedicationMorning")].filter(Boolean).join(" · ") || undefined}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Controller name="premedicationEvening" control={control} render={({ field }) => (
            <PremedicationPicker label={t("intraop.premedicationEvening")} value={field.value} onChange={field.onChange} />
          )} />
          <Controller name="premedicationMorning" control={control} render={({ field }) => (
            <PremedicationPicker label={t("intraop.premedicationMorning")} value={field.value} onChange={field.onChange} />
          )} />
        </div>
      </SectionCard>
      </div>{/* /intraop-technique */}

        </>)
        const tabChart = (<>

      {/* Intraoperative timetable */}
      <div data-tour="intraop-timetable">
      <SectionCard title={t("intraop.vitalsSection")}>
        <IntraopTimetable
          startTime={watch("startTime") || "08:00"}
          endTime={watch("endTime") || undefined}
          caseStarted={caseStartedProp || !!watch("startTime")}
          monitoring={monitoring}
          showAgentRow={showGases}
          ibw={preop?.heightCm && preop?.sex ? calcIBW(preop.heightCm, preop.sex as "MALE" | "FEMALE" | "OTHER") : null}
          tbw={preop?.weightKg ?? null}
          data={timetable}
          onChange={newData => { setTimetable(newData); setTimetableDirty(true) }}
          onEndCase={() => {
            const now = new Date()
            const hh  = String(now.getHours()).padStart(2, "0")
            const mm  = String(now.getMinutes()).padStart(2, "0")
            setValue("endTime", `${hh}:${mm}`)
            // Auto-advance end date if case crossed midnight
            const st = getValues("startTime") || "00:00"
            const [sh, sm] = st.split(":").map(Number)
            if (now.getHours() * 60 + now.getMinutes() < sh * 60 + sm) setValue("endTimeNextDay", true)
          }}
          onResumeCase={() => {
            setValue("endTime", "")
            setValue("endTimeNextDay", false)
          }}
          onPostopContinued={items => onPostopContinued?.(items)}
          onComplicationAdded={labels => {
            const cur = getValues("complications") || ""
            const existing = cur.split(";").map((s: string) => s.trim()).filter(Boolean)
            const newItems = labels.filter((l: string) => !existing.includes(l))
            if (newItems.length === 0) return
            setValue("complications", [...existing, ...newItems].join("; "))
          }}
        />
      </SectionCard>

      {/* Drugs and Fluid Balance Totals */}
      <SectionCard title="Drugs and Fluid Balance Totals" collapsible defaultCollapsed
        badge={(() => { const n = liveDrugTotals.bolusList.length + liveDrugTotals.infusionList.length; return n ? `${n} drug${n > 1 ? "s" : ""}` : undefined })()}>

        <p className="text-[10px] text-slate-400 -mt-1">Calculated automatically from the timetable timeline.</p>

        {/* Infusion totals */}
        {liveDrugTotals.infusionList.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-500 dark:text-violet-400">Infusions</p>
            {liveDrugTotals.infusionList.map(row => (
              <div key={row.name} className="flex items-center gap-2 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200 w-44 truncate">{row.name}</span>
                <span className="font-mono text-slate-600 dark:text-slate-300">
                  {row.total} {row.unit}
                </span>
                {row.mgTotal !== null && (
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">({row.mgTotal} mg)</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Bolus drug totals */}
        {liveDrugTotals.bolusList.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-500 dark:text-violet-400">Bolus drugs</p>
            {liveDrugTotals.bolusList.map(row => (
              <div key={row.name} className="flex items-center gap-2 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200 w-44 truncate">{row.name}</span>
                <span className="font-mono text-slate-600 dark:text-slate-300">{row.total} {row.unit}</span>
                {row.count > 1 && <span className="text-[10px] text-slate-400">({row.count} doses)</span>}
              </div>
            ))}
          </div>
        )}

        {/* Fluid balance */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-500 dark:text-teal-400 mb-2">Fluid balance</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {([
              { label: t("intraop.crystalloids"), field: "crystalloidsMl" as const },
              { label: t("intraop.colloids"),     field: "colloidsMl"     as const },
              { label: t("intraop.bloodTransfusion"), field: "bloodMl"   as const },
            ] as const).map(({ label, field }) => (
              <div key={field} className="space-y-1">
                <Label>{label}</Label>
                <div className="flex h-9 items-center rounded-md border border-slate-100 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#1e1e1e] px-3 text-sm font-medium text-slate-700 dark:text-slate-200">
                  {watch(field) ? `${watch(field)} mL` : <span className="text-slate-400">0 mL</span>}
                </div>
              </div>
            ))}
            {watch("urinaryCatheter") && (
              <div className="space-y-1 sm:col-span-3">
                <Label>{t("intraop.urineOutput")}</Label>
                <Controller name="urineMl" control={control} render={({ field }) => <NumberStepper value={field.value} onChange={field.onChange} min={0} max={5000} step={50} unit="mL" showSlider />} />
              </div>
            )}
            <div className="space-y-1 sm:col-span-2"><Label>{t("intraop.bloodProducts")}</Label><Input {...register("bloodProductsNote")} /></div>
          </div>
        </div>
      </SectionCard>
      </div>{/* /intraop-timetable */}

        </>)
        const tabFinish = (<>

      {/* Complications */}
      <SectionCard title={t("intraop.complicationsSection")} collapsible defaultCollapsed
        badge={watch("complications") ? "Documented" : undefined}>
        <Controller name="complications" control={control} render={({ field }) => (
          <div className="space-y-3">
            <ComplicationsPicker value={field.value} onChange={field.onChange} />
            <Textarea
              placeholder="No patient-identifying information — additional notes…"
              value={
                field.value
                  ? field.value.split(";").map((s: string) => s.trim()).filter((s: string) => s && !ALL_COMPLICATIONS.includes(s)).join("; ")
                  : ""
              }
              onChange={e => {
                const structured = field.value
                  ? field.value.split(";").map((s: string) => s.trim()).filter((s: string) => ALL_COMPLICATIONS.includes(s))
                  : []
                const combined = [...structured, ...(e.target.value.trim() ? [e.target.value.trim()] : [])].join("; ")
                field.onChange(combined)
              }}
              className="text-sm"
              rows={2}
            />
          </div>
        )} />

        {/* ── Mobile event log (read-only timeline) ──────────────────────── */}
        {eventLog && eventLog.length > 0 && (
          <div className="mt-5 border-t border-slate-100 dark:border-[#2a2a2a] pt-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-[#666] mb-3">Mobile event log</p>
            <div className="space-y-0">
              {[...eventLog].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()).map((ev: any) => {
                const hhmm = (() => { const d = new Date(ev.ts); return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}` })()
                let text = ""
                let color = "#64748b"
                if (ev.type === "drug") { text = `${ev.name} ${ev.dose} ${ev.unit}`; color = ev.color ?? "#3b82f6" }
                else if (ev.type === "vital") {
                  const parts: string[] = []
                  if (ev.systolic != null && ev.diastolic != null) parts.push(`BP ${ev.systolic}/${ev.diastolic}`)
                  if (ev.heartRate != null) parts.push(`HR ${ev.heartRate}`)
                  if (ev.spO2 != null) parts.push(`SpO₂ ${ev.spO2}%`)
                  if (ev.etco2 != null) parts.push(`EtCO₂ ${ev.etco2}`)
                  text = parts.join("  "); color = "#22c55e"
                }
                else if (ev.type === "clinical_event") { text = ev.label ?? "Event"; color = ev.color ?? "#6366f1" }
                else if (ev.type === "infusion_start") { text = `${ev.name} ${ev.rate} ${ev.unit} started`; color = ev.color ?? "#8b5cf6" }
                else if (ev.type === "infusion_stop") { text = `${ev.name} stopped`; color = "#64748b" }
                else if (ev.type === "infusion_rate") { text = `${ev.name} → ${ev.rate} ${ev.unit}`; color = ev.color ?? "#8b5cf6" }
                else if (ev.type === "fluid_start") { text = `${ev.name} ${ev.volume} mL`; color = ev.color ?? "#06b6d4" }
                else if (ev.type === "fluid_end") { text = `${ev.name} complete`; color = "#64748b" }
                else if (ev.type === "agent_start") { text = `${ev.name} on`; color = ev.color ?? "#a855f7" }
                else if (ev.type === "agent_stop") { text = `${ev.name} off`; color = "#64748b" }
                else { text = ev.type; color = "#64748b" }
                return (
                  <div key={ev.id} className="flex items-start gap-2.5 py-1.5 border-b border-slate-50 dark:border-[#1e1e1e] last:border-0">
                    <span className="text-[11px] text-slate-400 dark:text-[#666] tabular-nums pt-0.5 w-10 shrink-0">{hhmm}</span>
                    <div className="w-0.5 h-5 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: color }} />
                    <span className="text-[12px] text-slate-700 dark:text-slate-300 font-medium leading-snug">{text}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </SectionCard>

        </>)
        if (layoutMode === "scroll") return (
          <div className="space-y-6 mt-6">
            {tabOverview}
            {tabAnaesthesia}
            {tabChart}
            {tabFinish}
          </div>
        )
        return (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col gap-0">
            <TabsList variant="line" className="sticky top-0 z-20 w-full bg-white dark:bg-[#111] border-b border-slate-200 dark:border-[#2a2a2a] rounded-none px-4 mb-0 h-11 justify-start gap-1">
              <TabsTrigger value="overview"    className="text-xs font-semibold px-3">Overview</TabsTrigger>
              <TabsTrigger value="anaesthesia" className="text-xs font-semibold px-3">Anaesthesia</TabsTrigger>
              <TabsTrigger value="chart"       className="text-xs font-semibold px-3">Chart</TabsTrigger>
              <TabsTrigger value="finish"      className="text-xs font-semibold px-3">Finish</TabsTrigger>
            </TabsList>
            <TabsContent value="overview"    className="space-y-6 p-0 mt-6">{tabOverview}</TabsContent>
            <TabsContent value="anaesthesia" className="space-y-6 p-0 mt-6">{tabAnaesthesia}</TabsContent>
            <TabsContent value="chart"       className="space-y-6 p-0 mt-6">{tabChart}</TabsContent>
            <TabsContent value="finish"      className="space-y-6 p-0 mt-6">{tabFinish}</TabsContent>
          </Tabs>
        )
      })()}

      {/* Sticky footer — always visible across all tabs */}
      <div className="sticky bottom-0 z-20 bg-white dark:bg-[#111] border-t border-slate-200 dark:border-[#2a2a2a] px-4 py-3 flex justify-between items-center gap-3 mt-0">
        <Button type="button" variant="outline" size="lg" className="gap-2" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" /> {t("common.back")}
        </Button>
        <div className="flex items-center gap-3">
          {!!watch("endTime") && (formState.isDirty || timetableDirty) && (
            <Button type="button" size="lg"
              className={`gap-2 transition-colors ${manualSaved ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-600 hover:bg-slate-700"}`}
              onClick={handleManualSave}>
              {manualSaved ? "✓ Saved" : "Save Changes"}
            </Button>
          )}
          <Button type="button" size="lg" className="gap-2 bg-blue-600 hover:bg-blue-700" onClick={handleContinue} data-tour="intraop-submit">
            {t("intraop.continuePostop")} <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Incomplete-sections warning modal */}
      {incompleteItems && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setIncompleteItems(null)}>
          <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-4"
            onClick={e => e.stopPropagation()}>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Some sections look incomplete</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">The following sections have no data recorded:</p>
            </div>
            <ul className="space-y-1">
              {incompleteItems.map(item => (
                <li key={item} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-400">You can still continue — these fields are optional.</p>
            <div className="flex gap-2 pt-1">
              <button type="button"
                onClick={() => setIncompleteItems(null)}
                className="flex-1 text-sm font-medium px-4 py-2 rounded-lg border border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] transition-colors">
                Go back
              </button>
              <button type="button"
                onClick={() => { setIncompleteItems(null); doSubmit() }}
                className="flex-1 text-sm font-semibold px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                Continue anyway
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </form>
  )
}
