"use client"

import { useEffect, useLayoutEffect, useState, useRef } from "react"
import { flushSync } from "react-dom"
import { format } from "date-fns"
import { apfelRiskLabel, rcriRiskLabel, stopBangRiskLabel, calcIBW, calcABW } from "@/lib/scores"
import { useLocale } from "next-intl"
import { HANDOVER_GROUPS_EN, HANDOVER_GROUPS_BG } from "@/components/forms/PostopForm"

// ── Enum label maps ───────────────────────────────────────────────────────────
const TECHNIQUE_LABELS: Record<string, { en: string; bg: string }> = {
  GENERAL_INHALATION:      { en: "General Inhalation",              bg: "Обща инхалационна"                 },
  GENERAL_TIVA:            { en: "General IV (TIVA)",               bg: "Обща венозна (ТИВА)"               },
  GENERAL_COMBINED:        { en: "General Combined",                bg: "Обща комбинирана"                  },
  SPINAL:                  { en: "Spinal",                          bg: "Спинална"                          },
  SPINAL_SINGLE:           { en: "Spinal (single-shot)",            bg: "Спинална (единична доза)"          },
  EPIDURAL:                { en: "Epidural",                        bg: "Епидурална"                        },
  COMBINED_SPINAL_EPIDURAL:{ en: "Combined Spinal-Epidural (CSE)",  bg: "Комбинирана спинало-епидурална (КСЕ)" },
  PERIPHERAL_NERVE_BLOCK:  { en: "Peripheral Nerve Block",          bg: "Периферен нервен блок"             },
  LOCAL:                   { en: "Local Anaesthesia",               bg: "Местна анестезия"                  },
  SEDATION:                { en: "Sedation",                        bg: "Седация"                           },
}

const TOOL_LABELS: Record<string, { en: string; bg: string }> = {
  VIDEO_LARY:   { en: "Video laryngoscopy",        bg: "Видеоларингоскопия"                },
  DIRECT_LARY:  { en: "Direct laryngoscopy",       bg: "Директна ларингоскопия"            },
  FOB:          { en: "Fibreoptic bronchoscopy",   bg: "Фиброоптична бронхоскопия"         },
  BOUGIE:       { en: "Bougie",                    bg: "Буже"                              },
  STYLET:       { en: "Intubation stylet",         bg: "Стилет за интубация"               },
  AWAKE:        { en: "Awake intubation",          bg: "Интубация при буден пациент"       },
  RETROGRADE:   { en: "Retrograde intubation",     bg: "Ретроградна интубация"             },
  SUPRAGLOTTIC: { en: "Supraglottic as conduit",   bg: "Супраглотичен дихателен канал"     },
}

const POSITION_LABELS: Record<string, { en: string; bg: string }> = {
  SUPINE:                  { en: "Supine",                bg: "Супинация"                   },
  PRONE:                   { en: "Prone",                 bg: "Пронация"                    },
  LEFT_LATERAL:            { en: "Left lateral",          bg: "Ляво странично"              },
  RIGHT_LATERAL:           { en: "Right lateral",         bg: "Дясно странично"             },
  GYNECOLOGICAL:           { en: "Gynecological",         bg: "Гинекологично"               },
  TRENDELENBURG:           { en: "Trendelenburg",         bg: "Тренделенбург"               },
  REVERSE_TRENDELENBURG:   { en: "Rev. Trendelenburg",    bg: "Обратен Тренделенбург"       },
  FOWLER:                  { en: "Fowler's",              bg: "Полуседнало (Фаулър)"        },
  BEACH_CHAIR:             { en: "Beach chair",           bg: "Beach chair"                 },
  LLOYD_DAVIES:            { en: "Lloyd Davies",          bg: "Lloyd Davies"                },
  LATERAL_DECUBITUS_LEFT:  { en: "Lateral decub. L",      bg: "Ляв латерален декубитус"     },
  LATERAL_DECUBITUS_RIGHT: { en: "Lateral decub. R",      bg: "Десен латерален декубитус"   },
  SITTING:                 { en: "Sitting",               bg: "Седнало"                     },
  JACKKNIFE:               { en: "Jackknife",             bg: "Jackknife"                   },
  KNEE_CHEST:              { en: "Knee-chest",            bg: "Коляно-гръдно"               },
}

function tLabel(map: Record<string, { en: string; bg: string }>, key: string, locale: string): string {
  const entry = map[key]
  if (!entry) return key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
  return locale === "bg" ? entry.bg : entry.en
}

// ── Monitoring field map ─────────────────────────────────────────────────────
const MON = [
  { f: "ecg",              l: "ECG"      },
  { f: "spO2Monitor",      l: "SpO₂"     },
  { f: "nbpMonitor",       l: "NBP"      },
  { f: "etco2Monitor",     l: "EtCO₂"    },
  { f: "tempMonitor",      l: "Temp"     },
  { f: "invasiveBP",       l: "IBP"      },
  { f: "cvpMonitor",       l: "CVP"      },
  { f: "paCatheter",       l: "PA cath"  },
  { f: "tee",              l: "TEE"      },
  { f: "bis",              l: "BIS"      },
  { f: "entropyMonitor",   l: "Entropy"  },
  { f: "nirsMonitor",      l: "NIRS"     },
  { f: "evokedPotentials", l: "SSEP/MEP" },
  { f: "tofMonitor",       l: "TOF/NMT"  },
  { f: "bglMonitor",       l: "BGL"      },
  { f: "bloodGasMonitor",  l: "ABG"      },
  { f: "urinaryCatheter",  l: "Urine"    },
  { f: "stomachTube",      l: "NGT"      },
]

function colToHHMM(col: number, startISO?: string | null) {
  if (!startISO) return `+${col * 5}m`
  const d = new Date(startISO)
  // DB times are stored as UTC; use UTC methods to recover the original entered time.
  const totalMins = d.getUTCHours() * 60 + d.getUTCMinutes() + col * 5
  const hh = Math.floor(totalMins / 60) % 24
  const mm = totalMins % 60
  return `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`
}

const DEVICE_DISPLAY: Record<string, { en: string; bg: string; prefix_en?: string; prefix_bg?: string }> = {
  ORAL_ETT:          { en: "Oral ETT",         bg: "Орален ЕТТ"              },
  NASAL_ETT:         { en: "Nasal ETT",        bg: "Назален ЕТТ"             },
  LMA:               { en: "LMA",              bg: "ЛМА"                     },
  FACE_MASK:         { en: "Face Mask",        bg: "Лицева маска"             },
  OPA:               { en: "Oral airway (OPA)",bg: "Орофарингеален въздуховод (ОПА)" },
  NPA:               { en: "Nasal airway (NPA)",bg: "Назофарингеален въздуховод (НПА)" },
  DOUBLE_LUMEN_TUBE: { en: "DLT",             bg: "ДЛТ"                     },
  ENDOBRONCHIAL_TUBE:{ en: "Endobronchial",   bg: "Ендобронхиална тръба"    },
  SURGICAL_AIRWAY:   { en: "Surgical Airway", bg: "Хирургичен дихателен път" },
}

function deviceLabel(i: any, locale: string): string {
  const isBg = locale === "bg"
  const devs: string[] = Array.isArray(i?.airwayDevices) ? i.airwayDevices : []
  return devs.map((d: string) => {
    const cuffedStr = i?.cuffed != null
      ? (i.cuffed ? (isBg ? " с маншет" : " cuffed") : (isBg ? " без маншет" : " uncuffed"))
      : ""
    if (d === "ORAL_ETT" || d === "NASAL_ETT")
      return `${DEVICE_DISPLAY[d][isBg ? "bg" : "en"]}${i?.tubeSize ? " " + i.tubeSize + "mm" : ""}${cuffedStr}`
    if (d === "LMA")                return `${DEVICE_DISPLAY.LMA[isBg ? "bg" : "en"]}${i?.tubeSize ? " " + i.tubeSize : ""}`
    if (d === "DOUBLE_LUMEN_TUBE")  return `${DEVICE_DISPLAY.DOUBLE_LUMEN_TUBE[isBg ? "bg" : "en"]}${i?.dltType ? " " + i.dltType : ""}${i?.dltSide ? " " + i.dltSide : ""}${i?.dltSize ? " " + i.dltSize + "Fr" : ""}`
    if (d === "ENDOBRONCHIAL_TUBE") return `${DEVICE_DISPLAY.ENDOBRONCHIAL_TUBE[isBg ? "bg" : "en"]}${i?.endobronchialSize ? " " + i.endobronchialSize + "mm" : ""}`
    return (DEVICE_DISPLAY[d]?.[isBg ? "bg" : "en"]) ?? d.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
  }).join(" + ") || "—"
}

// ── Drug/fluid totals ─────────────────────────────────────────────────────────
function calcDrugTotals(timetable: any) {
  const drugs: any[] = Array.isArray(timetable?.drugs) ? timetable.drugs : []
  const totals: Record<string, { total: number; unit: string }> = {}
  drugs.forEach((d: any) => {
    const key = `${d.name ?? ""}__${d.unit ?? ""}`
    if (!totals[key]) totals[key] = { total: 0, unit: d.unit ?? "" }
    totals[key].total += parseFloat(String(d.dose)) || 0
  })
  return Object.entries(totals).map(([key, v]) => ({
    name: key.split("__")[0],
    total: Math.round(v.total * 100) / 100,
    unit: v.unit,
  }))
}

function calcInfTotals(timetable: any) {
  const infs: any[] = Array.isArray(timetable?.infusions) ? timetable.infusions : []
  return infs.map((inf: any) => {
    const cols = Math.max(0, (inf.endCol ?? 0) - (inf.startCol ?? 0))
    const hrs  = (cols * 5) / 60
    const total = Math.round(inf.rate * hrs * 10) / 10
    return { name: inf.name ?? "", total, unit: inf.unit ?? "ml" }
  })
}

// ── Intraop timetable SVG (matching IntraopTimetable visual style) ────────────
const VB_W   = 1000
const YAX    = 28    // Y-axis label width
const GW     = VB_W - YAX  // 972
const GH     = 170   // vitals graph height
const YLBL_H = 14    // time-label row height
const DRUG_H = 34    // drug bolus row height
const BAR_H  = 13    // agent / infusion / fluid row height

// Colour scheme matching IntraopTimetable.tsx
const C_SYS  = "#ef4444"   // BP systolic — red
const C_DIA  = "#ef4444"   // BP diastolic — red dashed
const C_HR   = "#22c55e"   // HR — green
const C_SPO2 = "#06b6d4"   // SpO₂ — cyan

function agentColor(name: string) {
  const n = name?.toLowerCase()
  if (n?.includes("sevo"))  return { fill: "#c084fc55", stroke: "#a855f7" }
  if (n?.includes("des"))   return { fill: "#60a5fa55", stroke: "#3b82f6" }
  if (n?.includes("iso"))   return { fill: "#4ade8055", stroke: "#22c55e" }
  return { fill: "#c084fc55", stroke: "#a855f7" }
}

function PrintTimetable({ timetable, startISO }: { timetable: any; startISO?: string | null }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [dims,   setDims]   = useState({ w: 0, h: 0 })
  const [isDark, setIsDark] = useState(false)

  // Read dimensions synchronously before first paint to avoid a zero-height
  // flash when the flex parent hasn't established its height yet.
  useLayoutEffect(() => {
    if (!wrapRef.current) return
    const r = wrapRef.current.getBoundingClientRect()
    if (r.width > 10) {
      const h = r.height > 10 ? r.height : Math.round(r.width * 0.58)
      setDims({ w: r.width, h })
    }
  }, [])

  useEffect(() => {
    if (!wrapRef.current) return
    const obs = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect
      if (r && r.width > 10) {
        const h = r.height > 10 ? r.height : Math.round(r.width * 0.58)
        setDims({ w: r.width, h })
      }
    })
    obs.observe(wrapRef.current)
    return () => obs.disconnect()
  }, [])

  // Detect dark mode via DOM class, update on change
  useEffect(() => {
    const update = () => setIsDark(document.documentElement.classList.contains("dark"))
    update()
    const mo = new MutationObserver(update)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => mo.disconnect()
  }, [])

  // Force light mode when printing so SVG colors are always white-on-light
  useEffect(() => {
    const onBefore = () => flushSync(() => setIsDark(false))
    const onAfter  = () => setIsDark(document.documentElement.classList.contains("dark"))
    window.addEventListener("beforeprint", onBefore)
    window.addEventListener("afterprint",  onAfter)
    return () => {
      window.removeEventListener("beforeprint", onBefore)
      window.removeEventListener("afterprint",  onAfter)
    }
  }, [])

  // Color palette — adapts to dark/light; print always overrides to white via CSS
  const C = isDark ? {
    chartBg:     "#161616",
    gridMajor:   "#2e2e2e",
    gridMinor:   "#202020",
    axis:        "#3d4e60",
    label:       "#718096",
    eventBg:     "#0f0f0f",
    eventBorder: "#282828",
    cellStroke:  "#a0aec0",
    drugText:    "#c4c9d4",
    timeText:    "#718096",
  } : {
    chartBg:     "#f8fafc",
    gridMajor:   "#e2e8f0",
    gridMinor:   "#f1f5f9",
    axis:        "#cbd5e1",
    label:       "#94a3b8",
    eventBg:     "#f8fafc",
    eventBorder: "#e2e8f0",
    cellStroke:  "#475569",
    drugText:    "#1e293b",
    timeText:    "#475569",
  }

  const vitals: any[]    = Array.isArray(timetable?.vitals)    ? timetable.vitals    : []
  const drugs: any[]     = Array.isArray(timetable?.drugs)     ? timetable.drugs     : []
  const agents: any[]    = Array.isArray(timetable?.agents)    ? timetable.agents    : []
  const infusions: any[] = Array.isArray(timetable?.infusions) ? timetable.infusions : []
  const fluids: any[]    = Array.isArray(timetable?.fluids)    ? timetable.fluids    : []

  const hasData = vitals.length || drugs.length || agents.length || infusions.length || fluids.length
  if (!hasData) {
    return (
      <div ref={wrapRef} className="flex items-center justify-center text-[11px] text-slate-400 dark:text-slate-600 border border-dashed border-slate-200 dark:border-[#333] rounded w-full h-full min-h-[200px]">
        No intraoperative data recorded
      </div>
    )
  }

  // Dynamic viewBox: matches container aspect ratio exactly → no whitespace
  const vbH = dims.w > 0 ? Math.round(VB_W * dims.h / dims.w) : 700

  const maxCols = Math.max(
    vitals.length,
    drugs.length     > 0 ? Math.max(...drugs.map((d: any)    => d.colIdx ?? 0)) + 3 : 0,
    agents.length    > 0 ? Math.max(...agents.map((a: any)   => a.endCol ?? a.startCol ?? 0)) + 3 : 0,
    infusions.length > 0 ? Math.max(...infusions.map((f: any) => f.endCol ?? f.startCol ?? 0)) + 3 : 0,
    fluids.length    > 0 ? Math.max(...fluids.map((f: any)   => f.endCol ?? f.startCol ?? 0)) + 3 : 0,
    12  // minimum 1 hour (12 × 5 min columns)
  ) + 2

  // Group drugs by name → one row per unique drug
  const ABBR: Record<string, string> = {
    propofol:'Prop', succinylcholine:'Sux', suxamethonium:'Sux',
    atracurium:'Atrac', rocuronium:'Roc', vecuronium:'Vec', cisatracurium:'Cis',
    fentanyl:'Fent', morphine:'Morph', alfentanil:'Alf', remifentanil:'Remi',
    sufentanil:'Suf', ketamine:'Ket', midazolam:'Mdz', diazepam:'Dz',
    ephedrine:'Eph', phenylephrine:'Phen', noradrenaline:'Nor', adrenaline:'Adr',
    neostigmine:'Neo', glycopyrrolate:'Glyc', atropine:'Atr',
    ondansetron:'Ond', dexamethasone:'Dex', metoclopramide:'Met',
    thiopental:'Thio', etomidate:'Etom', dexmedetomidine:'Dmed', sugammadex:'Sug',
  }
  function shorten(name: string): string {
    const lo = name.toLowerCase()
    for (const [k, v] of Object.entries(ABBR)) { if (lo.includes(k)) return v }
    return name.substring(0, 6)
  }

  const drugsByName: Record<string, { col: number; dose: string; unit: string }[]> = {}
  drugs.forEach((d: any) => {
    const name = String(d.name ?? "Unknown")
    if (!drugsByName[name]) drugsByName[name] = []
    drugsByName[name].push({ col: d.colIdx ?? 0, dose: String(d.dose ?? ""), unit: String(d.unit ?? "") })
  })
  const drugNames = Object.keys(drugsByName)

  const agentRows   = Math.min(agents.length, 3)
  const infRows     = Math.min(infusions.length, 4)
  const fluidRows   = Math.min(fluids.length, 5)
  const drugRowCount = Math.min(drugNames.length, 10)
  const numEventRows = drugRowCount + agentRows + infRows + fluidRows

  // Proportional split: chart 55%, event strip 45%
  const chartH     = Math.round(vbH * 0.55)
  const stripTotal  = vbH - chartH - YLBL_H - 4
  // No upper cap on row height — rows stretch to fill the full strip.
  // fSize is capped separately so text stays readable even in tall rows.
  const CELL_H_D    = Math.max(12, Math.floor(stripTotal / Math.max(numEventRows, 1)))

  const eventStripH = numEventRows * CELL_H_D + 2

  const cW   = GW / maxCols
  const xOf  = (col: number) => YAX + col * cW
  const yBP  = (v: number)   => chartH - (v / 220) * chartH
  const tick  = Math.max(3, Math.round(maxCols / 16) * 3)
  const eventY = chartH + YLBL_H

  // Polyline segment builder
  function segs(key: string) {
    const out: string[][] = []; let cur: string[] = []
    vitals.forEach((v: any, idx: number) => {
      const val = v?.[key]
      if (val != null && !isNaN(Number(val))) cur.push(`${xOf(idx)},${yBP(Number(val))}`)
      else { if (cur.length > 1) out.push(cur); cur = [] }
    })
    if (cur.length > 1) out.push(cur)
    return out
  }

  const fSize = Math.max(5, Math.min(11, Math.round(CELL_H_D * 0.38)))

  return (
    <div ref={wrapRef} className="timetable-wrap" style={{ width: "100%", height: "100%" }}>
    <svg viewBox={`0 0 ${VB_W} ${vbH}`} width="100%" height="100%"
      preserveAspectRatio="xMinYMin meet" className="timetable-svg" style={{ display: "block" }}>

      {/* SVG hatching patterns — use CSS var so they adapt to dark/light */}
      <defs>
        <pattern id="hatch-fwd" width="6" height="6" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="6" stroke={C.cellStroke} strokeWidth="1.2" />
        </pattern>
        <pattern id="hatch-bwd" width="6" height="6" patternTransform="rotate(-45 0 0)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="6" stroke={C.cellStroke} strokeWidth="1" />
        </pattern>
        <pattern id="hatch-cross" width="6" height="6" patternUnits="userSpaceOnUse">
          <line x1="0" y1="3" x2="6" y2="3" stroke={C.cellStroke} strokeWidth="0.8" />
          <line x1="3" y1="0" x2="3" y2="6" stroke={C.cellStroke} strokeWidth="0.8" />
        </pattern>
        <pattern id="hatch-dot" width="4" height="4" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="0.7" fill={C.cellStroke} />
        </pattern>
      </defs>

      {/* Graph background — CSS var for dark/light/print */}
      <rect x={YAX} y={0} width={GW} height={chartH} fill={C.chartBg} />

      {/* Horizontal gridlines */}
      {[40, 80, 120, 160, 200].map(y => (
        <g key={y}>
          <line x1={YAX} y1={yBP(y)} x2={VB_W} y2={yBP(y)}
            stroke={y % 80 === 0 ? C.gridMajor : C.gridMinor}
            strokeWidth={y % 80 === 0 ? 0.6 : 0.3} />
          <text x={YAX - 2} y={yBP(y) + 2} fontSize={7} fill={C.label} textAnchor="end">{y}</text>
        </g>
      ))}

      {/* Column separators */}
      {Array.from({ length: maxCols }).map((_, col) =>
        col % tick === 0
          ? <line key={col} x1={xOf(col)} y1={0} x2={xOf(col)} y2={chartH} stroke={C.gridMajor} strokeWidth={0.5} />
          : <line key={col} x1={xOf(col)} y1={0} x2={xOf(col)} y2={chartH} stroke={C.gridMinor} strokeWidth={0.25} />
      )}

      {/* Axes */}
      <line x1={YAX} y1={0}       x2={YAX}  y2={chartH} stroke={C.axis} strokeWidth={0.8} />
      <line x1={YAX} y1={chartH}  x2={VB_W} y2={chartH} stroke={C.axis} strokeWidth={0.8} />

      {/* Time labels — larger font + every-hour shading for orientation */}
      {Array.from({ length: maxCols }).map((_, col) => {
        const isHour = col % 12 === 0   // every 60 min
        const isTick = col % tick === 0
        return (
          <g key={col}>
            {isHour && col > 0 && (
              <rect x={xOf(col)} y={0} width={Math.max(cW * 12, 1)} height={chartH}
                fill={isDark ? "#ffffff08" : "#00000005"} />
            )}
            {isTick && (
              <>
                <line x1={xOf(col)} y1={chartH} x2={xOf(col)} y2={chartH + YLBL_H}
                  stroke={isHour ? C.axis : C.gridMajor} strokeWidth={isHour ? 1 : 0.5} />
                {/* Label background for legibility */}
                <rect x={xOf(col) - 18} y={chartH + 2} width={36} height={YLBL_H - 4} rx={2}
                  fill={isDark ? "#ffffff12" : "#00000008"} />
                <text x={xOf(col)} y={chartH + YLBL_H - 3} fontSize={12} fill={C.timeText}
                  textAnchor="middle" fontFamily="monospace" fontWeight={isHour ? "700" : "500"}>
                  {colToHHMM(col, startISO)}
                </text>
              </>
            )}
          </g>
        )
      })}

      {/* Pulse pressure fill */}
      {(() => {
        const pts: string[] = [], rev: string[] = []
        vitals.forEach((v: any, idx: number) => {
          if (v?.systolic != null && v?.diastolic != null) {
            pts.push(`${xOf(idx)},${yBP(v.systolic)}`)
            rev.unshift(`${xOf(idx)},${yBP(v.diastolic)}`)
          }
        })
        return pts.length > 1 ? <polygon points={[...pts, ...rev].join(" ")} fill="#ef4444" opacity={0.08} /> : null
      })()}

      {/* BP Systolic — solid, 1.5px */}
      {segs("systolic").map((s, k) => <polyline key={k} points={s.join(" ")} fill="none" stroke={C_SYS} strokeWidth={1.5} />)}
      {vitals.map((v: any, idx: number) =>
        v?.systolic != null ? <circle key={idx} cx={xOf(idx)} cy={yBP(v.systolic)} r={2.2} fill={C_SYS} /> : null
      )}

      {/* BP Diastolic — dashed 4,2 */}
      {segs("diastolic").map((s, k) => <polyline key={k} points={s.join(" ")} fill="none" stroke={C_DIA} strokeWidth={1.2} strokeDasharray="5,3" opacity={0.7} />)}
      {vitals.map((v: any, idx: number) =>
        v?.diastolic != null ? <circle key={idx} cx={xOf(idx)} cy={yBP(v.diastolic)} r={2} fill="none" stroke={C_DIA} strokeWidth={1.2} opacity={0.7} /> : null
      )}

      {/* HR — dotted 2,3 */}
      {segs("heartRate").map((s, k) => <polyline key={k} points={s.join(" ")} fill="none" stroke={C_HR} strokeWidth={1.5} strokeDasharray="2,4" />)}
      {vitals.map((v: any, idx: number) =>
        v?.heartRate != null ? (
          <g key={idx}>
            <line x1={xOf(idx)-2.5} y1={yBP(v.heartRate)-2.5} x2={xOf(idx)+2.5} y2={yBP(v.heartRate)+2.5} stroke={C_HR} strokeWidth={1.2} />
            <line x1={xOf(idx)+2.5} y1={yBP(v.heartRate)-2.5} x2={xOf(idx)-2.5} y2={yBP(v.heartRate)+2.5} stroke={C_HR} strokeWidth={1.2} />
          </g>
        ) : null
      )}

      {/* SpO₂ — dash-dot 6,2,1,2 */}
      {segs("spO2").map((s, k) => <polyline key={k} points={s.join(" ")} fill="none" stroke={C_SPO2} strokeWidth={1.2} strokeDasharray="6,2,1,2" />)}
      {vitals.map((v: any, idx: number) =>
        v?.spO2 != null ? <rect key={idx} x={xOf(idx)-2} y={yBP(v.spO2)-2} width={4} height={4} fill={C_SPO2} /> : null
      )}

      {/* Legend — left-aligned, larger font, safe inset from edges */}
      <g>
        <rect x={YAX} y={1} width={340} height={16} rx={2} fill={C.chartBg} opacity={0.85} />

        <line x1={YAX+6}  y1={9} x2={YAX+22} y2={9} stroke={C_SYS} strokeWidth={1.8} />
        <circle cx={YAX+14} cy={9} r={2.5} fill={C_SYS} />
        <text x={YAX+25} y={13} fontSize={10} fill={C.cellStroke} fontWeight="600">SBP</text>

        <line x1={YAX+72}  y1={9} x2={YAX+88} y2={9} stroke={C_DIA} strokeWidth={1.4} strokeDasharray="5,3" opacity={0.8} />
        <circle cx={YAX+80} cy={9} r={2.2} fill="none" stroke={C_DIA} strokeWidth={1.4} opacity={0.8} />
        <text x={YAX+91} y={13} fontSize={10} fill={C.cellStroke} fontWeight="600">DBP</text>

        <line x1={YAX+140} y1={9} x2={YAX+156} y2={9} stroke={C_HR} strokeWidth={1.8} strokeDasharray="2,4" />
        <line x1={YAX+145} y1={5.5} x2={YAX+151} y2={12.5} stroke={C_HR} strokeWidth={1.4} />
        <line x1={YAX+151} y1={5.5} x2={YAX+145} y2={12.5} stroke={C_HR} strokeWidth={1.4} />
        <text x={YAX+159} y={13} fontSize={10} fill={C.cellStroke} fontWeight="600">HR</text>

        <line x1={YAX+200} y1={9} x2={YAX+216} y2={9} stroke={C_SPO2} strokeWidth={1.4} strokeDasharray="6,2,1,2" />
        <rect x={YAX+206} y={6} width={5} height={5} fill={C_SPO2} />
        <text x={YAX+219} y={13} fontSize={10} fill={C.cellStroke} fontWeight="600">SpO₂</text>
      </g>

      {/* ── EVENT STRIP ─────────────────────────────────────── */}
      <rect x={0} y={eventY} width={VB_W} height={eventStripH} fill={C.eventBg} />
      <line x1={0} y1={eventY} x2={VB_W} y2={eventY} stroke={C.axis} strokeWidth={0.8} />

      {/* Drug rows — one per unique drug name */}
      {drugNames.slice(0, drugRowCount).map((name, ridx) => {
        const rowY = eventY + ridx * CELL_H_D
        const admins = drugsByName[name]
        const label  = shorten(name)
        return (
          <g key={name}>
            <text x={2} y={rowY + CELL_H_D / 2 + fSize / 2} fontSize={fSize}
              fill={C.cellStroke} fontWeight="600">{label}</text>
            {admins.map((adm, ai) => {
              const x = xOf(adm.col)
              const doseStr = `${adm.dose}${adm.unit}`
              return (
                <g key={ai}>
                  <line x1={x} y1={rowY + 2} x2={x} y2={rowY + CELL_H_D - 2}
                    stroke={C.cellStroke} strokeWidth={1.4} opacity={0.7} />
                  <text x={x + 3} y={rowY + CELL_H_D / 2 + fSize / 2} fontSize={fSize}
                    fill={C.drugText}>{doseStr}</text>
                </g>
              )
            })}
            <line x1={YAX} y1={rowY + CELL_H_D} x2={VB_W} y2={rowY + CELL_H_D}
              stroke={C.eventBorder} strokeWidth={0.3} />
          </g>
        )
      })}

      {/* Agent rows */}
      {agents.slice(0, agentRows).map((a: any, ridx: number) => {
        const rowY = eventY + drugRowCount * CELL_H_D + ridx * CELL_H_D
        const start = a.startCol ?? 0, end = a.endCol ?? start
        return (
          <g key={ridx}>
            <text x={2} y={rowY + CELL_H_D / 2 + fSize / 2} fontSize={fSize} fill={C.cellStroke} fontWeight="600">Agent</text>
            {Array.from({ length: end - start + 1 }).map((_, ci) => {
              const col = start + ci
              return (
                <g key={col}>
                  <rect x={xOf(col) + 0.5} y={rowY + 1} width={Math.max(cW - 1, 1)} height={CELL_H_D - 2}
                    fill="url(#hatch-fwd)" stroke={C.cellStroke} strokeWidth={0.5} />
                  {ci === 0 && (
                    <text x={xOf(col) + 3} y={rowY + CELL_H_D / 2 + fSize / 2} fontSize={fSize} fill={C.cellStroke}>
                      {String(a.name ?? "").substring(0, 22)}
                    </text>
                  )}
                </g>
              )
            })}
            <line x1={YAX} y1={rowY + CELL_H_D} x2={VB_W} y2={rowY + CELL_H_D} stroke={C.eventBorder} strokeWidth={0.3} />
          </g>
        )
      })}

      {/* Infusion rows */}
      {infusions.slice(0, infRows).map((inf: any, ridx: number) => {
        const rowY = eventY + (drugRowCount + agentRows) * CELL_H_D + ridx * CELL_H_D
        const start = inf.startCol ?? 0, end = inf.endCol ?? start
        return (
          <g key={ridx}>
            <text x={2} y={rowY + CELL_H_D / 2 + fSize / 2} fontSize={fSize} fill={C.cellStroke} fontWeight="600">Inf.</text>
            {Array.from({ length: end - start + 1 }).map((_, ci) => {
              const col = start + ci
              return (
                <g key={col}>
                  <rect x={xOf(col) + 0.5} y={rowY + 1} width={Math.max(cW - 1, 1)} height={CELL_H_D - 2}
                    fill="url(#hatch-bwd)" stroke={C.cellStroke} strokeWidth={0.4} />
                  {ci === 0 && (
                    <text x={xOf(col) + 3} y={rowY + CELL_H_D / 2 + fSize / 2} fontSize={fSize} fill={C.cellStroke}>
                      {`${String(inf.name ?? "").substring(0, 14)} ${inf.rate ?? ""}${inf.unit ?? ""}`}
                    </text>
                  )}
                </g>
              )
            })}
            <line x1={YAX} y1={rowY + CELL_H_D} x2={VB_W} y2={rowY + CELL_H_D} stroke={C.eventBorder} strokeWidth={0.3} />
          </g>
        )
      })}

      {/* Fluid rows */}
      {fluids.slice(0, fluidRows).map((f: any, ridx: number) => {
        const rowY = eventY + (drugRowCount + agentRows + infRows) * CELL_H_D + ridx * CELL_H_D
        const start = f.startCol ?? 0, end = f.endCol ?? start
        return (
          <g key={ridx}>
            <text x={2} y={rowY + CELL_H_D / 2 + fSize / 2} fontSize={fSize} fill={C.cellStroke} fontWeight="600">Fluid</text>
            {Array.from({ length: end - start + 1 }).map((_, ci) => {
              const col = start + ci
              return (
                <g key={col}>
                  <rect x={xOf(col) + 0.5} y={rowY + 1} width={Math.max(cW - 1, 1)} height={CELL_H_D - 2}
                    fill="url(#hatch-dot)" stroke={C.cellStroke} strokeWidth={0.4} opacity={0.7} />
                  {ci === 0 && (
                    <text x={xOf(col) + 3} y={rowY + CELL_H_D / 2 + fSize / 2} fontSize={fSize} fill={C.cellStroke}>
                      {`${String(f.name ?? "").substring(0, 14)}${f.volume ? " " + f.volume + "mL" : ""}`}
                    </text>
                  )}
                </g>
              )
            })}
            {ridx < fluidRows - 1 && <line x1={YAX} y1={rowY + CELL_H_D} x2={VB_W} y2={rowY + CELL_H_D} stroke={C.eventBorder} strokeWidth={0.3} />}
          </g>
        )
      })}
    </svg>
    </div>
  )
}

// ── Shared helpers ────────────────────────────────────────────────────────────
function F({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "") return null
  return (
    <div className="flex justify-between gap-2 py-[2px] border-b border-slate-100 dark:border-[#252525] last:border-0 text-[10.5px]">
      <span className="text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
      <span className="font-semibold text-slate-800 dark:text-slate-100 text-right min-w-0 break-words">{String(value)}</span>
    </div>
  )
}

function Sec({ title }: { title: string }) {
  return <p className="text-[8.5px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 border-b border-blue-100 dark:border-blue-900/40 pb-0.5 mb-1.5 mt-2.5 first:mt-0">{title}</p>
}

function Chip({ children, color = "slate" }: { children: string; color?: string }) {
  const c: Record<string, string> = {
    slate:  "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    blue:   "bg-blue-100  text-blue-800  dark:bg-blue-900/40 dark:text-blue-300",
    amber:  "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    red:    "bg-red-100   text-red-700   dark:bg-red-900/30  dark:text-red-300",
    green:  "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  }
  return <span className={`inline-block text-[8.5px] px-1.5 py-0.5 rounded font-medium mr-1 mb-1 ${c[color] ?? c.slate}`}>{children}</span>
}

// ── Protocol label translations ───────────────────────────────────────────────
const LABELS = {
  en: {
    protocol: "ANAESTHESIA PROTOCOL", preoppost: "Preoperative & Postoperative Assessment",
    staff: "Staff", patient: "Patient", anaesthesia: "Anaesthesia", monitoring: "Monitoring",
    vascular: "Vascular Access", premed: "Premedication", drugTotals: "Drug totals", fluidBal: "Fluid balance",
    anaesthesiologist: "Anaesthesiologist", surgeon: "Surgeon", nurse: "Nurse", duration: "Duration",
    diagnosis: "Diagnosis", procedure: "Planned Procedure", heightWeight: "Height / Weight",
    technique: "Technique", airway: "Airway", tools: "Tools", ventilation: "Ventilation",
    agent: "Agent", position: "Position",
    cryst: "Cryst.", colloid: "Colloid", blood: "Blood", urine: "Urine",
    riskScores: "Risk Scores", preVitals: "Preoperative Vitals", comorbidities: "Comorbidities",
    medications: "Medications", allergies: "Allergies", lab: "Laboratory",
    mouthOpening: "Mouth opening", thyromental: "Thyromental dist.", neckMobility: "Neck mobility",
    clGrade: "C-L grade", bp: "BP", hr: "HR", temp: "Temp", rr: "RR",
    postopRecovery: "Postoperative Recovery", total: "TOTAL", ready: "Ready",
    monitor: "Monitor", continueStr: "Continue", recovery: "Recovery",
    disposition: "Disposition", handover: "Handover",
    temperature: "Temperature", painNRS: "Pain NRS", ponv: "PONV", timeInPacu: "Time in PACU",
    sigAnest: "Anaesthesiologist", sigNurse: "Anaesthesia nurse", sigSurg: "Surgeon",
    page1: "Page 1 of 2", page2: "Page 2 of 2", confidential: "Confidential",
    gdprNote: "GDPR: Patient-identifiable data — store securely. Anonymised record in LOSPOR.",
    reviewNote: "Review the two-page protocol below, then print or save as PDF.",
    privacyNote: "Patient name and ID are entered at print time only — they are never uploaded or stored.",
    printBtn: "🖨 Print / Save as PDF",
    warningTitle: "Before you print",
    warningText: "Once the case record has been finalised, any changes will require reopening the case again. Make sure all information is accurate before generating the protocol.",
    goBack: "Go back", continuePrint: "Continue to print",
    patientDialogTitle: "Patient identity for protocol",
    patientDialogNote: "These details are not stored in LOSPOR — only printed on the document.",
    lastNamePlaceholder: "Last name", firstNamePlaceholder: "First name", idPlaceholder: "File / ID number (optional)",
    cancel: "Cancel",
    noDrugs: "No drugs recorded", evening: "Evening", morning: "Morning",
    latexAllergy: "⚠ Latex allergy", familyHistory: "⚠ Family anaesthesia history",
    difficultAirway: "⚠ Difficult airway history",
    loadingCase: "Loading case summary…", loadFailed: "Failed to load case data.",
  },
  bg: {
    protocol: "АНЕСТЕЗИОЛОГИЧЕН ПРОТОКОЛ", preoppost: "Предоперативна и следоперативна оценка",
    staff: "Персонал", patient: "Пациент", anaesthesia: "Анестезия", monitoring: "Мониторинг",
    vascular: "Съдов достъп", premed: "Премедикация", drugTotals: "Медикаменти", fluidBal: "Баланс на течности",
    anaesthesiologist: "Анестезиолог", surgeon: "Хирург", nurse: "Мед. сестра", duration: "Продължителност",
    diagnosis: "Диагноза", procedure: "Интервенция", heightWeight: "Ръст / Тегло",
    technique: "Техника", airway: "Дихателен път", tools: "Инструменти", ventilation: "Вентилация",
    agent: "Агент", position: "Положение",
    cryst: "Крист.", colloid: "Колоид", blood: "Кръв", urine: "Диуреза",
    riskScores: "Скали за оценка на риска", preVitals: "Предоп. витални показатели", comorbidities: "Придружаващи заболявания",
    medications: "Медикаменти", allergies: "Алергии", lab: "Лабораторни изследвания",
    mouthOpening: "Разстояние между резците", thyromental: "Тиромандибулярно разст.", neckMobility: "Подвижност на шията",
    clGrade: "C-L степен", bp: "АН", hr: "СЧ", temp: "Темп.", rr: "ДЧ",
    postopRecovery: "Постоперативно състояние", total: "ОБЩО", ready: "Готов",
    monitor: "Наблюдение", continueStr: "Продължи", recovery: "Състояние при извеждане от операционната зала",
    disposition: "Извежда се към", handover: "Препоръки за постоперативния период",
    temperature: "Температура", painNRS: "Болкова скала NRS", ponv: "ПОНВ", timeInPacu: "Престой в зала за събуждане",
    sigAnest: "Анестезиолог", sigNurse: "Анестезиологична мед. сестра", sigSurg: "Хирург",
    page1: "Страница 1 от 2", page2: "Страница 2 от 2", confidential: "Поверително",
    gdprNote: "GDPR: Документът съдържа лични данни — съхранявайте в историята. Анонимен запис в LOSPOR.",
    reviewNote: "Прегледайте протокола по-долу, след което отпечатайте или запазете като PDF.",
    privacyNote: "Имената и ИД на пациента се въвеждат само при печат — никога не се качват или съхраняват.",
    printBtn: "🖨 Печат / Запази като PDF",
    warningTitle: "Преди да отпечатате",
    warningText: "След финализиране на случая промените изискват повторното му отваряне. Уверете се, че всички данни са верни преди генерирането на протокола.",
    goBack: "Назад", continuePrint: "Продължи към печат",
    patientDialogTitle: "Самоличност на пациента за протокола",
    patientDialogNote: "Тези данни не се съхраняват в LOSPOR — само се отпечатват на документа.",
    lastNamePlaceholder: "Фамилия", firstNamePlaceholder: "Собствено", idPlaceholder: "ИЗ / Идентификатор (незадължително)",
    cancel: "Отказ",
    noDrugs: "Без записани медикаменти", evening: "Вечер", morning: "Сутрин",
    latexAllergy: "⚠ Алергия към латекс", familyHistory: "⚠ Фамилна анестезиологична история",
    difficultAirway: "⚠ История на труден дихателен път",
    loadingCase: "Зареждане на резюмето…", loadFailed: "Грешка при зареждане на данните.",
  },
}

// ── Main Component ────────────────────────────────────────────────────────────
export function CaseSummary({ caseId }: { caseId: string }) {
  const locale = useLocale()
  const L = locale === "bg" ? LABELS.bg : LABELS.en
  const handoverLookup = (() => {
    const groups = locale === "bg" ? HANDOVER_GROUPS_BG : HANDOVER_GROUPS_EN
    const map: Record<string, string> = {}
    groups.forEach(g => g.items.forEach(i => { map[i.code] = i.label }))
    return map
  })()

  const [data,    setData]    = useState<any>(null)
  const [loading, setLoading]     = useState(true)
  const [showWarning, setShowWarning] = useState(false)

  useEffect(() => {
    fetch(`/api/cases/${caseId}`).then(r => r.json()).then(d => { setData(d); setLoading(false) })
  }, [caseId])

  if (loading) return <div className="text-sm text-slate-400 dark:text-slate-500 text-center py-12 animate-pulse">{L.loadingCase}</div>
  if (!data)   return <div className="text-sm text-red-500 text-center py-12">{L.loadFailed}</div>

  const p    = data.preop
  const i    = data.intraop
  const o    = data.postop
  const inst = data.institution

  const techniques:    string[] = Array.isArray(i?.techniques)       ? i.techniques       : []
  const positions:     string[] = Array.isArray(i?.positions)        ? i.positions        : []
  const ventModes:     string[] = Array.isArray(i?.ventilationModes) ? i.ventilationModes : []
  const airwayTools:   string[] = Array.isArray(i?.airwayTools)      ? i.airwayTools      : []
  const vascular:      any[]    = Array.isArray(i?.vascularAccesses) ? i.vascularAccesses : []
  const comorbidities: any[]    = Array.isArray(p?.comorbidities)    ? p.comorbidities    : []
  const labResults:    any[]    = Array.isArray(p?.labResults)       ? p.labResults.filter((l: any) => l.value) : []
  const handoverItems: string[] = Array.isArray(o?.handoverItems)    ? o.handoverItems    : []
  const timetable = (i?.keyEvents && typeof i.keyEvents === "object" && !Array.isArray(i.keyEvents)) ? i.keyEvents : {}

  const activeMonitors = MON.filter(m => i?.[m.f]).map(m => m.l)
  const dateStr = (() => {
    if (!i?.monthYear) return ""
    const [y, m] = i.monthYear.split("-")
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"]
    return `${months[parseInt(m, 10) - 1] ?? ""} ${y}`
  })()
  const drugTotals     = calcDrugTotals(timetable)
  const infTotals      = calcInfTotals(timetable)
  const ageSuffix  = locale === "bg" ? "г." : "y"
  const sexLabel   = (s: string) => locale === "bg" ? (s === "MALE" ? "М" : s === "FEMALE" ? "Ж" : "") : (s === "MALE" ? "M" : s === "FEMALE" ? "F" : "")
  const patientLine = [p?.ageYears ? `${p.ageYears}${ageSuffix}` : "", p?.sex ? sexLabel(p.sex) : ""].filter(Boolean).join(" · ")

  function duration() {
    if (!i?.startTime || !i?.endTime) return null
    const s = new Date(i.startTime), e = new Date(i.endTime)
    const mins = Math.round((e.getTime() - s.getTime()) / 60000)
    return `${format(s, "HH:mm")} → ${format(e, "HH:mm")} (${Math.floor(mins / 60)}h ${mins % 60}m)`
  }

  const aldreteTotal = o?.aldreteTotal ?? 0
  const aldreteBg = aldreteTotal >= 9 ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-300 dark:border-green-700"
    : aldreteTotal >= 7 ? "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700"
    : "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 border-red-300 dark:border-red-700"

  // Compact row card shared between panels
  const panel = "border border-slate-200 dark:border-[#2a2a2a] rounded-lg p-2 bg-white dark:bg-[#161616]"

  return (
    <>
      {/* ── Print styles ─────────────────────────────────────────────────────── */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 0; }

          /* Both pages fill the full A4 landscape sheet.
             calc(210mm - 1px) avoids the Chrome float-rounding bug that creates a blank 3rd page. */
          .page-intraop,
          .page-preoppost {
            min-height: unset !important;
            width: 297mm !important;
            height: calc(210mm - 1px) !important;
            padding: 7mm !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
            border: none !important;
            border-radius: 0 !important;
          }
          .page-preoppost { break-before: page; break-after: avoid; }

          /* White paper regardless of dark mode */
          .protocol-root *:not(svg, svg *) {
            background-color: white !important;
            color: #1e293b !important;
            border-color: #e2e8f0 !important;
          }
          * { -webkit-print-color-adjust: exact !important; color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
          /* SVG light-mode is handled via beforeprint listener — no filter needed */

          /* Compact lab rows in print — overrides Tailwind text-[10.5px] / py-[2px] */
          .lab-compact .lab-entry > div {
            font-size: 8px !important;
            padding-top: 1px !important;
            padding-bottom: 1px !important;
          }
          .lab-compact .lab-entry > div > * { font-size: 8px !important; }
        }
      `}</style>

      {/* ── Pre-print warning ──────────────────────────────────────────────── */}
      {showWarning && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowWarning(false)}>
          <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4"
            onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{L.warningTitle}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{L.warningText}</p>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setShowWarning(false)}
                className="flex-1 text-sm font-medium px-4 py-2 rounded-lg border border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] transition-colors">
                {L.goBack}
              </button>
              <button type="button" onClick={() => { setShowWarning(false); setTimeout(() => window.print(), 100) }}
                className="flex-1 text-sm font-semibold px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                {L.continuePrint}
              </button>
            </div>
          </div>
        </div>
      )}


      <div className="protocol-root space-y-3">

        {/* Print button + privacy notice — screen only */}
        <div className="no-print space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500 dark:text-slate-400">{L.reviewNote}</p>
            <button onClick={() => setShowWarning(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm">
              {L.printBtn}
            </button>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 italic">
            {L.privacyNote}
          </p>
        </div>

        {/* ═══════════════════════════════════════════════════════
            PAGE 1 — LANDSCAPE — INTRAOPERATIVE
        ════════════════════════════════════════════════════════ */}
        <div data-tour="summary-page1" className="page-intraop border border-slate-200 dark:border-[#2a2a2a] rounded-xl bg-white dark:bg-[#1c1c1c] p-3 flex flex-col gap-2 min-h-[520px]">

          {/* Header strip */}
          <div className="flex items-center justify-between border-b-2 border-blue-700 dark:border-blue-500 pb-1.5">
            <div>
              <span className="text-[12px] font-bold text-blue-700 dark:text-blue-400">{L.protocol}</span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 ml-2">· {inst?.name}{inst?.city ? ", " + inst.city : ""} · {dateStr}</span>
              {p?.diagnosis && <span className="text-[10px] font-semibold text-slate-800 dark:text-slate-100 ml-2">· {p.diagnosis}</span>}
            </div>
            <div className="text-right text-[10px] flex items-center gap-2">
              <span className="text-slate-400 border-b border-dashed border-slate-300 w-36 inline-block" />
              {patientLine && <span className="text-slate-500 dark:text-slate-400">· {patientLine}</span>}
              {p?.asaScore && <span className="font-bold text-amber-700 dark:text-amber-400">ASA {p.asaScore}{p.emergencySurgery ? "E" : ""}</span>}
            </div>
          </div>

          {/* Main body: timetable (65%) + right panel (35%) */}
          <div className="flex gap-2 flex-1 min-h-0">

            {/* LEFT: Timetable 65% — fills full panel height */}
            <div className="w-[65%] shrink-0 flex flex-col gap-1 min-h-0">
              <div className={`${panel} flex-1 overflow-hidden flex flex-col`}>
                <div className="flex-1 min-h-0">
                  <PrintTimetable timetable={timetable} startISO={i?.startTime} />
                </div>
              </div>
            </div>

            {/* RIGHT: info 35% */}
            <div className="flex-1 flex flex-col gap-1.5 min-h-0 overflow-hidden">

              {/* TOP: Clinical info */}
              <div className={`${panel} flex-1 overflow-hidden`}>
                {/* Staff + timeline */}
                <div className="grid grid-cols-2 gap-x-3">
                  <div>
                    <Sec title={L.staff} />
                    <div className="flex items-center gap-1 py-0.5 text-[9px]"><span className="text-slate-400 shrink-0 w-20">{L.anaesthesiologist}</span><span className="flex-1 border-b border-dashed border-slate-300 dark:border-slate-600 h-3" /></div>
                    <div className="flex items-center gap-1 py-0.5 text-[9px]"><span className="text-slate-400 shrink-0 w-20">{L.surgeon}</span><span className="flex-1 border-b border-dashed border-slate-300 dark:border-slate-600 h-3" /></div>
                    <div className="flex items-center gap-1 py-0.5 text-[9px]"><span className="text-slate-400 shrink-0 w-20">{L.nurse}</span><span className="flex-1 border-b border-dashed border-slate-300 dark:border-slate-600 h-3" /></div>
                    {duration() && <F label={L.duration} value={duration()} />}

                    <Sec title={L.patient} />
                    {p?.diagnosis        && <F label={L.diagnosis} value={p.diagnosis} />}
                    {p?.plannedProcedure && <F label={L.procedure} value={p.plannedProcedure} />}
                    <F label={L.heightWeight} value={p?.heightCm && p?.weightKg ? `${p.heightCm} cm / ${p.weightKg} kg` : null} />
                    <F label="BMI"  value={p?.bmi ? `${p.bmi} kg/m²` : null} />
                    {p?.heightCm && p?.sex && (() => {
                      const ibw = calcIBW(p.heightCm, p.sex as any)
                      const abw = p?.weightKg ? calcABW(ibw, p.weightKg) : null
                      return <>
                        <F label="IBW" value={ibw ? `${ibw} kg` : null} />
                        {abw != null && <F label="ABW" value={`${abw} kg`} />}
                      </>
                    })()}
                  </div>
                  <div>
                    <Sec title={L.anaesthesia} />
                    {techniques.length > 0 && <F label={L.technique} value={techniques.map((t: string) => tLabel(TECHNIQUE_LABELS, t, locale)).join(" + ")} />}
                    <F label={L.airway} value={deviceLabel(i, locale)} />
                    {airwayTools.length > 0 && <F label={L.tools} value={airwayTools.map((t: string) => tLabel(TOOL_LABELS, t, locale)).join(", ")} />}
                    {ventModes.length > 0   && <F label={L.ventilation} value={ventModes.join(", ")} />}
                    {i?.volatileAgent && <F label={L.agent} value={i.volatileAgent} />}
                    {positions.length > 0   && <F label={L.position} value={positions.map((s: string) => tLabel(POSITION_LABELS, s, locale)).join(", ")} />}
                  </div>
                </div>

                {/* Monitoring */}
                {activeMonitors.length > 0 && (
                  <>
                    <Sec title={L.monitoring} />
                    <div className="flex flex-wrap">{activeMonitors.map(m => <Chip key={m} color="blue">{m}</Chip>)}</div>
                  </>
                )}

                {/* Vascular */}
                {vascular.length > 0 && (
                  <>
                    <Sec title={L.vascular} />
                    <p className="text-[10px] text-slate-700 dark:text-slate-300">
                      {vascular.map((a: any) => `${a.siteLabel?.split(" › ").pop() ?? a.site ?? ""} ${a.size ?? ""}${a.sizeUnit ?? ""}`.trim()).join(" · ")}
                    </p>
                  </>
                )}

                {/* Premedication */}
                {(p?.premedicationEvening || p?.premedicationMorning) && (
                  <>
                    <Sec title={L.premed} />
                    <F label={L.evening} value={p?.premedicationEvening} />
                    <F label={L.morning} value={p?.premedicationMorning} />
                  </>
                )}
              </div>

              {/* BOTTOM: Drug totals + Fluid balance */}
              <div className={`${panel}`}>
                <div className="grid grid-cols-2 gap-x-3">
                  <div>
                    <Sec title={L.drugTotals} />
                    {drugTotals.length === 0 && infTotals.length === 0 &&
                      <p className="text-[10px] text-slate-400 dark:text-slate-600">{L.noDrugs}</p>}
                    {drugTotals.map(d => (
                      <div key={d.name} className="flex justify-between text-[10px] py-[1px]">
                        <span className="text-slate-600 dark:text-slate-400">{d.name}</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-100">{d.total} {d.unit}</span>
                      </div>
                    ))}
                    {infTotals.map(d => (
                      <div key={d.name} className="flex justify-between text-[10px] py-[1px]">
                        <span className="text-slate-600 dark:text-slate-400 italic">{d.name}</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-100">{d.total} {d.unit}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <Sec title={L.fluidBal} />
                    <div className="grid grid-cols-2 gap-1 mt-1">
                      {[
                        { label: L.cryst,   value: i?.crystalloidsMl },
                        { label: L.colloid, value: i?.colloidsMl },
                        { label: L.blood,   value: i?.bloodMl },
                        { label: L.urine,   value: i?.urineMl },
                      ].map(({ label, value }) => (
                        <div key={label} className="border border-slate-200 dark:border-[#2a2a2a] rounded text-center py-0.5">
                          <p className="text-[11px] font-bold text-slate-800 dark:text-slate-100">{value ?? "—"}</p>
                          <p className="text-[8px] text-slate-500 dark:text-slate-400">{label} mL</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-between text-[7.5px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-[#222] pt-1">
            <span>{L.gdprNote}</span>
            <span>{L.page1} · {format(new Date(), "dd MMM yyyy HH:mm")} · {L.confidential}</span>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════
            PAGE 2 — PORTRAIT — PREOP + POSTOP
        ════════════════════════════════════════════════════════ */}
        <div data-tour="summary-page2" className="page-preoppost border border-slate-200 dark:border-[#2a2a2a] rounded-xl bg-white dark:bg-[#1c1c1c] p-3 flex flex-col gap-2 min-h-[520px]">

          {/* Header */}
          <div className="flex items-center justify-between border-b-2 border-blue-700 dark:border-blue-500 pb-1.5">
            <div>
              <span className="text-[12px] font-bold text-blue-700 dark:text-blue-400">{L.protocol}</span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 ml-2">· {L.preoppost} · {dateStr}</span>
            </div>
            <div className="text-right text-[10px]">
              <span className="text-slate-400 border-b border-dashed border-slate-300 w-40 inline-block" />
            </div>
          </div>

          {/* PREOP — top 50% */}
          <div className="flex-1 flex gap-2 overflow-hidden">
            {/* LEFT */}
            <div className={`${panel} flex-1 overflow-hidden`}>
              {p?.diagnosis        && <><Sec title={L.diagnosis} /><p className="text-[10.5px] font-semibold text-slate-800 dark:text-slate-100">{p.diagnosis}</p></>}
              {p?.plannedProcedure && <><Sec title={L.procedure} /><p className="text-[10.5px] text-slate-700 dark:text-slate-300">{p.plannedProcedure}</p></>}

              <Sec title={L.riskScores} />
              <F label="ASA"       value={p?.asaScore ? `Class ${p.asaScore}${p.emergencySurgery ? "E" : ""}` : null} />
              {p?.rcriScore  != null && <F label="RCRI"      value={`${p.rcriScore}/6 — ${rcriRiskLabel(p.rcriScore)}`} />}
              {p?.apfelScore != null && <F label="Apfel"     value={`${p.apfelScore}/4 — ${apfelRiskLabel(p.apfelScore)}`} />}
              {p?.stopBangScore != null && <F label="STOP-BANG" value={`${p.stopBangScore}/8 — ${stopBangRiskLabel(p.stopBangScore)}`} />}

              <Sec title={L.airway} />
              <F label="Mallampati"      value={p?.mallampati} />
              <F label={L.mouthOpening}  value={p?.mouthOpeningCm ? `${p.mouthOpeningCm} cm` : null} />
              <F label={L.thyromental}   value={p?.thyromental ? `${p.thyromental} cm` : null} />
              <F label={L.neckMobility}  value={p?.neckMobility} />
              <F label="ULBT"            value={p?.upperLipBiteTest} />
              <F label={L.clGrade}       value={p?.cormackLehane} />
              {p?.difficultAirwayHistory && (
                <p className="text-[9px] font-semibold text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded px-1.5 py-0.5 mt-1">{L.difficultAirway}{p.difficultAirwayNotes ? ": " + p.difficultAirwayNotes : ""}</p>
              )}

              <Sec title={L.preVitals} />
              <F label={L.bp}   value={p?.bpSystolic && p?.bpDiastolic ? `${p.bpSystolic}/${p.bpDiastolic} mmHg` : null} />
              <F label={L.hr}   value={p?.heartRate ? `${p.heartRate} bpm` : null} />
              <F label="SpO₂"   value={p?.spO2 ? `${p.spO2}%` : null} />
              <F label={L.temp} value={p?.temperature ? `${p.temperature} °C` : null} />
              <F label={L.rr}   value={p?.respiratoryRate ? `${p.respiratoryRate}/min` : null} />
            </div>

            {/* RIGHT */}
            <div className={`${panel} flex-1 overflow-hidden`}>
              <F label={L.heightWeight} value={p?.heightCm && p?.weightKg ? `${p.heightCm} cm / ${p.weightKg} kg` : null} />
              <F label="BMI"           value={p?.bmi ? `${p.bmi} kg/m²` : null} />

              {comorbidities.length > 0 && (
                <>
                  <Sec title={L.comorbidities} />
                  <div className="flex flex-wrap">{comorbidities.map((c: any, idx: number) => <Chip key={idx} color="amber">{c.label ?? String(c)}</Chip>)}</div>
                </>
              )}

              {p?.currentMedications && (
                <>
                  <Sec title={L.medications} />
                  <p className="text-[10px] text-slate-700 dark:text-slate-300 leading-snug">{p.currentMedications}</p>
                </>
              )}

              {(p?.allergies || p?.latexAllergy) && (
                <>
                  <Sec title={L.allergies} />
                  {p?.allergyDetails && <p className="text-[10px] font-semibold text-red-700 dark:text-red-400">{p.allergyDetails}</p>}
                  {p?.latexAllergy   && <p className="text-[9px] text-red-600 dark:text-red-400">{L.latexAllergy}</p>}
                </>
              )}

              {labResults.length > 0 && (
                <>
                  <Sec title={L.lab} />
                  <div
                    className={labResults.length >= 9 ? "lab-compact" : ""}
                    style={{
                      columns: labResults.length >= 30 ? 4 : labResults.length >= 16 ? 3 : labResults.length >= 9 ? 2 : 1,
                      columnGap: "0.5rem",
                    }}
                  >
                    {labResults.map((l: any, idx: number) => (
                      <div key={idx} className="lab-entry" style={{ breakInside: "avoid" }}>
                        <F label={l.test} value={`${l.value}${l.unit ? " " + l.unit : ""}`} />
                      </div>
                    ))}
                  </div>
                </>
              )}

              {p?.familyAnesthesiaProblems && (
                <p className="text-[9px] text-amber-700 dark:text-amber-400 mt-2">{L.familyHistory}</p>
              )}
            </div>
          </div>

          {/* POSTOP — bottom 50% */}
          <div className="flex-1 flex flex-col gap-1.5 border-t-2 border-blue-700 dark:border-blue-500 pt-2 overflow-hidden">
            <p className="text-[9px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">{L.postopRecovery}</p>

            {/* Aldrete */}
            <div className="grid grid-cols-6 gap-1">
              {[
                ["Activity",      o?.aldreteActivity],
                ["Respiration",   o?.aldreteRespiration],
                ["Circulation",   o?.aldreteCirculation],
                ["Consciousness", o?.aldreteConsciousness],
                ["SpO₂",          o?.aldreteSpO2],
              ].map(([lbl, val]) => (
                <div key={lbl as string} className="border border-slate-200 dark:border-[#2a2a2a] rounded text-center py-1">
                  <p className="text-[7.5px] text-slate-500 dark:text-slate-400">{lbl as string}</p>
                  <p className="text-[13px] font-bold text-slate-800 dark:text-slate-100 leading-tight">{val ?? "—"}/2</p>
                </div>
              ))}
              <div className={`border rounded text-center py-1 ${aldreteBg}`}>
                <p className="text-[7.5px] font-medium">{L.total}</p>
                <p className="text-[13px] font-bold leading-tight">{o?.aldreteTotal ?? "—"}/10</p>
                <p className="text-[6.5px]">{aldreteTotal >= 9 ? L.ready : aldreteTotal >= 7 ? L.monitor : L.continueStr}</p>
              </div>
            </div>

            {/* Recovery + disposition */}
            <div className="flex gap-2 flex-1 overflow-hidden">
              <div className={`${panel} flex-1`}>
                <Sec title={L.recovery} />
                <F label={L.temperature} value={o?.temperatureCelsius ? `${o.temperatureCelsius} °C` : null} />
                <F label={L.painNRS}     value={o?.painScoreNRS != null ? `${o.painScoreNRS}/10` : null} />
                <F label={L.ponv}        value={o?.ponv ? "Yes" : o?.ponv === false ? "No" : null} />
                <F label={L.timeInPacu}  value={o?.timeInRecoveryMin ? `${o.timeInRecoveryMin} min` : null} />
              </div>
              <div className={`${panel} flex-1`}>
                <Sec title={L.disposition} />
                {o?.disposition && (
                  <span className={`inline-block text-[10px] font-bold px-3 py-0.5 rounded border mb-1.5 ${
                    o.disposition === "WARD" ? "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700" :
                    o.disposition === "PACU" ? "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700" :
                    "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700"
                  }`}>{o.disposition}</span>
                )}
                {o?.dispositionNotes && <p className="text-[10px] text-slate-700 dark:text-slate-300 leading-snug">{o.dispositionNotes}</p>}
              </div>
              {handoverItems.length > 0 && (
                <div className={`${panel} flex-1`}>
                  <Sec title={L.handover} />
                  <ul className="text-[10px] text-slate-700 dark:text-slate-300 space-y-0.5 list-none">
                    {handoverItems.map((code: string, idx: number) => (
                      <li key={idx}>✓ {handoverLookup[code] ?? code.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-3 gap-6 mt-1">
            {[L.sigAnest, L.sigNurse, L.sigSurg].map(r => (
              <div key={r} className="border-t border-slate-300 dark:border-[#333] pt-1">
                <p className="text-[8px] text-slate-400 dark:text-slate-500">{r}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[7.5px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-[#222] pt-1">
            <span>LOSPOR — Large Open Source Perioperative Register</span>
            <span>{L.page2} · {format(new Date(), "dd MMM yyyy HH:mm")} · {L.confidential}</span>
          </div>
        </div>

        {/* Print-only disclaimer footer */}
        <div className="print-only hidden" style={{ display: "none" }}>
          <style>{`@media print { .lospor-print-disclaimer { display: block !important; } }`}</style>
          <p className="lospor-print-disclaimer text-[7px] text-center text-slate-400 mt-2 border-t border-slate-200 pt-1">
            LOSPOR — Personal anaesthetic case log. Not a clinical record. Patient identifiers must not be added. © 2026 Kaloyan Dzhunov · AGPL-3.0
          </p>
        </div>
      </div>
    </>
  )
}
