"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import type {
  LegacyKeyEvents, TimetableDrug, TimetableInfusion, VitalsEntry,
  AgentSegment, TimetableFluid,
} from "@/types/timetable"

function colToHHMM(col: number, startISO?: string | null) {
  if (!startISO) return `+${col * 5}m`
  const d = new Date(startISO)
  // DB times are stored as UTC; use UTC methods to recover the original entered time.
  const totalMins = d.getUTCHours() * 60 + d.getUTCMinutes() + col * 5
  const hh = Math.floor(totalMins / 60) % 24
  const mm = totalMins % 60
  return `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`
}

// ── Drug/fluid totals ─────────────────────────────────────────────────────────
export function calcDrugTotals(timetable: LegacyKeyEvents) {
  const drugs: TimetableDrug[] = Array.isArray(timetable?.drugs) ? timetable.drugs : []
  const totals: Record<string, { total: number; unit: string }> = {}
  drugs.forEach(d => {
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

export function calcInfTotals(timetable: LegacyKeyEvents) {
  const infs: TimetableInfusion[] = Array.isArray(timetable?.infusions) ? timetable.infusions : []
  return infs.map(inf => {
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
const YLBL_H = 14    // time-label row height

// Colour scheme matching IntraopTimetable.tsx
const C_SYS  = "#ef4444"   // BP systolic — red
const C_DIA  = "#ef4444"   // BP diastolic — red dashed
const C_HR   = "#22c55e"   // HR — green
const C_SPO2 = "#06b6d4"   // SpO₂ — cyan

export function PrintTimetable({ timetable, startISO }: { timetable: LegacyKeyEvents; startISO?: string | null }) {
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

  const vitals: VitalsEntry[]        = Array.isArray(timetable?.vitals)    ? timetable.vitals    : []
  const drugs: TimetableDrug[]       = Array.isArray(timetable?.drugs)     ? timetable.drugs     : []
  const agents: AgentSegment[]       = Array.isArray(timetable?.agents)    ? timetable.agents    : []
  const infusions: TimetableInfusion[] = Array.isArray(timetable?.infusions) ? timetable.infusions : []
  const fluids: TimetableFluid[]     = Array.isArray(timetable?.fluids)    ? timetable.fluids    : []

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
    drugs.length     > 0 ? Math.max(...drugs.map(d    => d.colIdx ?? 0)) + 3 : 0,
    agents.length    > 0 ? Math.max(...agents.map(a   => a.endCol ?? a.startCol ?? 0)) + 3 : 0,
    infusions.length > 0 ? Math.max(...infusions.map(f => f.endCol ?? f.startCol ?? 0)) + 3 : 0,
    fluids.length    > 0 ? Math.max(...fluids.map(f   => f.endCol ?? f.startCol ?? 0)) + 3 : 0,
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
  drugs.forEach(d => {
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
  function segs(key: keyof VitalsEntry) {
    const out: string[][] = []; let cur: string[] = []
    vitals.forEach((v, idx) => {
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
        vitals.forEach((v, idx) => {
          if (v?.systolic != null && v?.diastolic != null) {
            pts.push(`${xOf(idx)},${yBP(v.systolic)}`)
            rev.unshift(`${xOf(idx)},${yBP(v.diastolic)}`)
          }
        })
        return pts.length > 1 ? <polygon points={[...pts, ...rev].join(" ")} fill="#ef4444" opacity={0.08} /> : null
      })()}

      {/* BP Systolic — solid, 1.5px */}
      {segs("systolic").map((s, k) => <polyline key={k} points={s.join(" ")} fill="none" stroke={C_SYS} strokeWidth={1.5} />)}
      {vitals.map((v, idx) =>
        v?.systolic != null ? <circle key={idx} cx={xOf(idx)} cy={yBP(v.systolic)} r={2.2} fill={C_SYS} /> : null
      )}

      {/* BP Diastolic — dashed 4,2 */}
      {segs("diastolic").map((s, k) => <polyline key={k} points={s.join(" ")} fill="none" stroke={C_DIA} strokeWidth={1.2} strokeDasharray="5,3" opacity={0.7} />)}
      {vitals.map((v, idx) =>
        v?.diastolic != null ? <circle key={idx} cx={xOf(idx)} cy={yBP(v.diastolic)} r={2} fill="none" stroke={C_DIA} strokeWidth={1.2} opacity={0.7} /> : null
      )}

      {/* HR — dotted 2,3 */}
      {segs("heartRate").map((s, k) => <polyline key={k} points={s.join(" ")} fill="none" stroke={C_HR} strokeWidth={1.5} strokeDasharray="2,4" />)}
      {vitals.map((v, idx) =>
        v?.heartRate != null ? (
          <g key={idx}>
            <line x1={xOf(idx)-2.5} y1={yBP(v.heartRate)-2.5} x2={xOf(idx)+2.5} y2={yBP(v.heartRate)+2.5} stroke={C_HR} strokeWidth={1.2} />
            <line x1={xOf(idx)+2.5} y1={yBP(v.heartRate)-2.5} x2={xOf(idx)-2.5} y2={yBP(v.heartRate)+2.5} stroke={C_HR} strokeWidth={1.2} />
          </g>
        ) : null
      )}

      {/* SpO₂ — dash-dot 6,2,1,2 */}
      {segs("spO2").map((s, k) => <polyline key={k} points={s.join(" ")} fill="none" stroke={C_SPO2} strokeWidth={1.2} strokeDasharray="6,2,1,2" />)}
      {vitals.map((v, idx) =>
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
      {agents.slice(0, agentRows).map((a, ridx) => {
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
      {infusions.slice(0, infRows).map((inf, ridx) => {
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
      {fluids.slice(0, fluidRows).map((f, ridx) => {
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
