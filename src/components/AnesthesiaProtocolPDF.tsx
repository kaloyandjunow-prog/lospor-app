"use client"

import { useEffect, useState } from "react"
import {
  PDFViewer, Document, Page, Text, View, StyleSheet,
  Svg, Line, Polyline, Rect, Circle, G, Polygon,
} from "@react-pdf/renderer"
import { format } from "date-fns"
import { apfelRiskLabel, rcriRiskLabel, stopBangRiskLabel } from "@/lib/scores"

// SVG Text alias — react-pdf v4 types don't fully expose SVG text attributes
const ST = Text as any

// ── Layout constants (pt) ────────────────────────────────────────────────────
const PAD = 20          // page padding
const L_W = 841.89      // landscape A4 width
const L_H = 595.28      // landscape A4 height
const P_W = 595.28      // portrait A4 width

const GW  = L_W - PAD * 2 - 24  // graph data area width (~778)
const YAXIS_W = 24               // Y-axis label column

const MONITORING_FIELDS = [
  { f: "ecg",             l: "ECG"       },
  { f: "spO2Monitor",     l: "SpO₂"      },
  { f: "nbpMonitor",      l: "NBP"       },
  { f: "etco2Monitor",    l: "EtCO₂"     },
  { f: "tempMonitor",     l: "Temp"      },
  { f: "invasiveBP",      l: "IBP"       },
  { f: "cvpMonitor",      l: "CVP"       },
  { f: "paCatheter",      l: "PA cath"   },
  { f: "tee",             l: "TEE"       },
  { f: "bis",             l: "BIS"       },
  { f: "entropyMonitor",  l: "Entropy"   },
  { f: "nirsMonitor",     l: "NIRS"      },
  { f: "evokedPotentials",l: "SSEP/MEP"  },
  { f: "tofMonitor",      l: "TOF/NMT"  },
  { f: "bglMonitor",      l: "BGL"       },
  { f: "bloodGasMonitor", l: "ABG"       },
  { f: "urinaryCatheter", l: "Urine"     },
  { f: "stomachTube",     l: "NGT"       },
]

// ── Styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page1:       { padding: PAD, fontSize: 7, fontFamily: "Helvetica", color: "#1e293b", backgroundColor: "#fff" },
  page2:       { padding: PAD, fontSize: 7, fontFamily: "Helvetica", color: "#1e293b", backgroundColor: "#fff" },
  header:      { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 7, paddingBottom: 5, borderBottom: "1.5pt solid #1e40af" },
  title:       { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1e40af", marginBottom: 1 },
  subtitle:    { fontSize: 6.5, color: "#64748b" },
  row:         { flexDirection: "row", gap: 6, marginBottom: 6 },
  col:         { flex: 1 },
  card:        { border: "0.5pt solid #e2e8f0", borderRadius: 3, padding: 6, marginBottom: 6 },
  sec:         { fontSize: 6, fontFamily: "Helvetica-Bold", color: "#1e40af", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3, paddingBottom: 2, borderBottom: "0.5pt solid #bfdbfe" },
  field:       { flexDirection: "row", justifyContent: "space-between", marginBottom: 1.5 },
  lbl:         { color: "#64748b", flex: 1 },
  val:         { fontFamily: "Helvetica-Bold", flex: 1, textAlign: "right" },
  tagRow:      { flexDirection: "row", flexWrap: "wrap", gap: 2 },
  tag:         { backgroundColor: "#f1f5f9", color: "#475569", fontSize: 5.5, paddingHorizontal: 3, paddingVertical: 1, borderRadius: 2 },
  tagRed:      { backgroundColor: "#fee2e2", color: "#991b1b" },
  tagAmber:    { backgroundColor: "#fef3c7", color: "#92400e" },
  tagGreen:    { backgroundColor: "#dcfce7", color: "#166534" },
  tagBlue:     { backgroundColor: "#dbeafe", color: "#1e40af" },
  fluidGrid:   { flexDirection: "row", gap: 4 },
  fluidItem:   { flex: 1, textAlign: "center", border: "0.5pt solid #e2e8f0", borderRadius: 3, padding: 4 },
  fluidVal:    { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#1e293b" },
  fluidLbl:    { color: "#64748b", fontSize: 5.5 },
  sigRow:      { flexDirection: "row", marginTop: 8, gap: 12 },
  sigCol:      { flex: 1, borderTop: "0.5pt solid #cbd5e1", paddingTop: 3 },
  footer:      { position: "absolute", bottom: 10, left: PAD, right: PAD, flexDirection: "row", justifyContent: "space-between", color: "#94a3b8", fontSize: 5.5, borderTop: "0.5pt solid #e2e8f0", paddingTop: 3 },
  disclaimer:  { backgroundColor: "#fffbeb", border: "0.5pt solid #fcd34d", borderRadius: 2, padding: 4, marginBottom: 6 },
  postopSep:   { borderTop: "1pt solid #1e40af", marginTop: 6, marginBottom: 5, paddingTop: 4 },
  postopTitle: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#1e40af", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 },
  aldreteRow:  { flexDirection: "row", gap: 4, marginBottom: 4 },
  aldreteCell: { flex: 1, border: "0.5pt solid #e2e8f0", borderRadius: 3, padding: 4, textAlign: "center" },
  badge:       { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3, fontSize: 7, fontFamily: "Helvetica-Bold", textAlign: "center" },
  badgeGreen:  { backgroundColor: "#dcfce7", color: "#166534" },
  badgeAmber:  { backgroundColor: "#fef3c7", color: "#92400e" },
  badgeRed:    { backgroundColor: "#fee2e2", color: "#991b1b" },
})

// ── Helpers ──────────────────────────────────────────────────────────────────
function F({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "") return null
  return (
    <View style={S.field}>
      <Text style={S.lbl}>{label}</Text>
      <Text style={S.val}>{String(value)}</Text>
    </View>
  )
}

function Tag({ children, style }: { children: string; style?: any }) {
  return <View style={[S.tag, style]}><Text>{children}</Text></View>
}

function colToTime(col: number, startISO?: string | null): string {
  if (!startISO) return String(col * 5) + "m"
  const d = new Date(startISO)
  // DB times are stored in UTC; use UTC methods to recover the original entered time.
  const totalMins = d.getUTCHours() * 60 + d.getUTCMinutes() + col * 5
  const hh = Math.floor(totalMins / 60) % 24
  const mm = totalMins % 60
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
}

function deviceStr(i: any): string {
  const devs: string[] = Array.isArray(i?.airwayDevices) ? i.airwayDevices : []
  return devs.map(d => {
    if (d === "ORAL_ETT" || d === "NASAL_ETT") {
      const type = d === "ORAL_ETT" ? "Oral" : "Nasal"
      const size = i?.tubeSize ? ` ${i.tubeSize}mm` : ""
      const cuff = i?.cuffed != null ? (i.cuffed ? " cuffed" : " uncuffed") : ""
      return `${type} ETT${size}${cuff}`
    }
    if (d === "LMA")               return `LMA${i?.tubeSize ? " " + i.tubeSize : ""}`
    if (d === "DOUBLE_LUMEN_TUBE") return `DLT${i?.dltType ? " " + i.dltType : ""}${i?.dltSide ? " " + i.dltSide : ""}${i?.dltSize ? " " + i.dltSize + "Fr" : ""}`
    if (d === "ENDOBRONCHIAL_TUBE")return `Endobronchial${i?.endobronchialSize ? " " + i.endobronchialSize + "mm" : ""}`
    return d.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase())
  }).join(" + ") || "—"
}

// ── Clinical Chart SVG ───────────────────────────────────────────────────────
function ClinicalChart({ timetable, startISO }: { timetable: any; startISO?: string | null }) {
  const vitals: any[]    = Array.isArray(timetable?.vitals)    ? timetable.vitals    : []
  const drugs: any[]     = Array.isArray(timetable?.drugs)     ? timetable.drugs     : []
  const agents: any[]    = Array.isArray(timetable?.agents)    ? timetable.agents    : []
  const infusions: any[] = Array.isArray(timetable?.infusions) ? timetable.infusions : []
  const fluids: any[]    = Array.isArray(timetable?.fluids)    ? timetable.fluids    : []

  const hasData = vitals.length || drugs.length || agents.length || infusions.length || fluids.length

  if (!hasData) {
    return (
      <View style={[S.card, { alignItems: "center", paddingVertical: 16 }]}>
        <Text style={{ color: "#94a3b8" }}>No intraoperative monitoring data recorded</Text>
      </View>
    )
  }

  // Calculate total columns
  const maxCols = Math.max(
    vitals.length,
    drugs.length  > 0 ? Math.max(...drugs.map((d: any)     => d.colIdx ?? 0)) + 1 : 0,
    agents.length > 0 ? Math.max(...agents.map((a: any)    => a.endCol ?? a.startCol ?? 0)) + 1 : 0,
    infusions.length > 0 ? Math.max(...infusions.map((f: any) => f.endCol ?? f.startCol ?? 0)) + 1 : 0,
    fluids.length > 0 ? Math.max(...fluids.map((f: any)   => f.endCol ?? f.startCol ?? 0)) + 1 : 0,
    24
  ) + 4
  const colW = GW / maxCols

  // Graph geometry
  const GH    = 100   // BP/HR graph height
  const SPO2H = 14    // SpO₂ strip height
  const XLBL  = 12    // X-axis label row height
  const DGAP  = 4     // gap between graph and event strip

  // Drug row
  const DRUG_H   = 36
  // Agent/infusion/fluid rows
  const BAR_H    = 11
  const agentRows  = Math.min(agents.length, 3)
  const infRows    = Math.min(infusions.length, 4)
  const fluidRows  = Math.min(fluids.length, 4)
  const stripH = DRUG_H + (agentRows + infRows + fluidRows) * BAR_H + 4

  const totalH = GH + SPO2H + XLBL + DGAP + stripH

  // Y-scale for BP/HR (0–240)
  const yBP = (v: number) => GH - (v / 240) * GH

  // Build polyline segments (skip null values)
  function segs(key: string, xFn: (i: number) => number, yFn: (v: number) => number) {
    const out: string[][] = []
    let cur: string[] = []
    vitals.forEach((v: any, i: number) => {
      const val = v?.[key]
      if (val != null && !isNaN(Number(val))) {
        cur.push(`${xFn(i)},${yFn(Number(val))}`)
      } else {
        if (cur.length > 1) out.push(cur)
        cur = []
      }
    })
    if (cur.length > 1) out.push(cur)
    return out
  }

  const xOf = (col: number) => YAXIS_W + col * colW

  const sysSeg = segs("systolic",  (i) => xOf(i), yBP)
  const diaSeg = segs("diastolic", (i) => xOf(i), yBP)
  const hrSeg  = segs("heartRate", (i) => xOf(i), yBP)

  // Time tick interval: every 30 min = 6 cols
  const tickInterval = Math.max(6, Math.ceil(maxCols / 20) * 3)

  // Event strip Y positions (relative to start of strip section)
  const stripY0 = GH + SPO2H + XLBL + DGAP
  const drugY   = stripY0
  const agentY0 = drugY + DRUG_H
  const infY0   = agentY0 + agentRows * BAR_H
  const fluidY0 = infY0  + infRows  * BAR_H

  // Fluid colours
  function fluidColor(cat: string) {
    if (cat === "Crystalloids")   return "#0ea5e9"
    if (cat === "Colloids")       return "#f59e0b"
    if (cat === "Blood products") return "#ef4444"
    return "#6b7280"
  }

  return (
    <Svg width={GW + YAXIS_W} height={totalH}>
      {/* ── Y-axis gridlines & labels ──────────────────────── */}
      {[0, 40, 80, 120, 160, 200, 240].map(y => (
        <G key={y}>
          {y > 0 && <Line x1={YAXIS_W} y1={yBP(y)} x2={GW + YAXIS_W} y2={yBP(y)} stroke={y % 80 === 0 ? "#cbd5e1" : "#f1f5f9"} strokeWidth={0.5} />}
          <ST x={YAXIS_W - 2} y={yBP(y) + 2} fontSize={4.5} fill="#94a3b8" textAnchor="end">{y}</ST>
        </G>
      ))}

      {/* ── Y-axis border ──────────────────────────────────── */}
      <Line x1={YAXIS_W} y1={0} x2={YAXIS_W} y2={GH} stroke="#cbd5e1" strokeWidth={0.5} />
      <Line x1={YAXIS_W} y1={GH} x2={GW + YAXIS_W} y2={GH} stroke="#cbd5e1" strokeWidth={0.5} />

      {/* ── X-axis ticks & time labels ─────────────────────── */}
      {Array.from({ length: maxCols }).map((_, col) =>
        col % tickInterval === 0 ? (
          <G key={col}>
            <Line x1={xOf(col)} y1={GH} x2={xOf(col)} y2={GH + SPO2H + XLBL + 2} stroke="#94a3b8" strokeWidth={0.3} />
            <ST x={xOf(col)} y={GH + SPO2H + XLBL} fontSize={4.5} fill="#64748b" textAnchor="middle">
              {colToTime(col, startISO)}
            </ST>
          </G>
        ) : null
      )}

      {/* ── BP Systolic ────────────────────────────────────── */}
      {sysSeg.map((pts, k) => (
        <Polyline key={k} points={pts.join(" ")} fill="none" stroke="#dc2626" strokeWidth={0.8} />
      ))}
      {vitals.map((v: any, i: number) =>
        v?.systolic != null ? <Circle key={i} cx={xOf(i)} cy={yBP(v.systolic)} r={1.2} fill="#dc2626" /> : null
      )}

      {/* ── BP Diastolic ───────────────────────────────────── */}
      {diaSeg.map((pts, k) => (
        <Polyline key={k} points={pts.join(" ")} fill="none" stroke="#f87171" strokeWidth={0.8} strokeDasharray="2,1" />
      ))}
      {vitals.map((v: any, i: number) =>
        v?.diastolic != null ? <Circle key={i} cx={xOf(i)} cy={yBP(v.diastolic)} r={1.2} fill="none" stroke="#f87171" strokeWidth={0.8} /> : null
      )}

      {/* ── HR ─────────────────────────────────────────────── */}
      {hrSeg.map((pts, k) => (
        <Polyline key={k} points={pts.join(" ")} fill="none" stroke="#16a34a" strokeWidth={0.8} />
      ))}
      {vitals.map((v: any, i: number) =>
        v?.heartRate != null ? (
          <Polygon key={i}
            points={`${xOf(i)},${yBP(v.heartRate) - 2} ${xOf(i) - 1.8},${yBP(v.heartRate) + 1.5} ${xOf(i) + 1.8},${yBP(v.heartRate) + 1.5}`}
            fill="#16a34a" />
        ) : null
      )}

      {/* ── SpO₂ strip ─────────────────────────────────────── */}
      <Rect x={YAXIS_W} y={GH + 2} width={GW} height={SPO2H - 2} fill="#f0f9ff" />
      <ST x={YAXIS_W - 2} y={GH + 2 + (SPO2H - 2) / 2 + 2} fontSize={4.5} fill="#0369a1" textAnchor="end">SpO₂</ST>
      {vitals.map((v: any, i: number) =>
        v?.spO2 != null ? (
          <G key={i}>
            <Circle cx={xOf(i)} cy={GH + 2 + (SPO2H - 2) / 2} r={1.2} fill="#0369a1" />
            {i % tickInterval === 0 && (
              <ST x={xOf(i)} y={GH + 2 + (SPO2H - 2) / 2 - 3} fontSize={4} fill="#0369a1" textAnchor="middle">{v.spO2}</ST>
            )}
          </G>
        ) : null
      )}

      {/* ── Legend ─────────────────────────────────────────── */}
      <G>
        {/* SBP */}
        <Line x1={GW - 115 + YAXIS_W} y1={5} x2={GW - 100 + YAXIS_W} y2={5} stroke="#dc2626" strokeWidth={0.8} />
        <Circle cx={GW - 107 + YAXIS_W} cy={5} r={1.2} fill="#dc2626" />
        <ST x={GW - 98 + YAXIS_W} y={7} fontSize={4.5} fill="#dc2626">SBP (mmHg)</ST>
        {/* DBP */}
        <Line x1={GW - 72 + YAXIS_W} y1={5} x2={GW - 57 + YAXIS_W} y2={5} stroke="#f87171" strokeWidth={0.8} strokeDasharray="2,1" />
        <ST x={GW - 55 + YAXIS_W} y={7} fontSize={4.5} fill="#f87171">DBP</ST>
        {/* HR */}
        <Polygon points={`${GW - 35 + YAXIS_W},2.5 ${GW - 37 + YAXIS_W},7.5 ${GW - 33 + YAXIS_W},7.5`} fill="#16a34a" />
        <ST x={GW - 30 + YAXIS_W} y={7} fontSize={4.5} fill="#16a34a">HR (bpm)</ST>
        {/* SpO₂ */}
        <Circle cx={GW - 12 + YAXIS_W} cy={5} r={1.2} fill="#0369a1" />
        <ST x={GW - 9 + YAXIS_W} y={7} fontSize={4.5} fill="#0369a1">SpO₂</ST>
      </G>

      {/* ── EVENT STRIP BACKGROUND ─────────────────────────── */}
      <Rect x={YAXIS_W} y={stripY0} width={GW} height={stripH} fill="#fafafa" />
      <Line x1={YAXIS_W} y1={stripY0} x2={GW + YAXIS_W} y2={stripY0} stroke="#e2e8f0" strokeWidth={0.5} />

      {/* ── Drug boluses ───────────────────────────────────── */}
      <ST x={1} y={drugY + DRUG_H / 2 + 2} fontSize={4.5} fill="#7c3aed" textAnchor="start">Drugs</ST>
      {drugs.map((d: any, i: number) => {
        const x = xOf(d.colIdx ?? 0)
        const above = i % 2 === 0
        const labelY = above ? drugY + 6 : drugY + DRUG_H - 2
        const tickTop = above ? drugY + 10 : drugY + 2
        const tickBot = above ? drugY + DRUG_H / 2 : drugY + DRUG_H - 8
        const name = String(d.name ?? "").substring(0, 10)
        const dose = `${d.dose ?? ""}${d.unit ?? ""}`
        return (
          <G key={i}>
            <Line x1={x} y1={tickTop} x2={x} y2={tickBot} stroke="#7c3aed" strokeWidth={0.5} />
            <Circle cx={x} cy={tickBot} r={1} fill="#7c3aed" />
            <ST x={x} y={labelY} fontSize={4} fill="#4c1d95" textAnchor="middle">{name}</ST>
            <ST x={x} y={labelY + 5} fontSize={3.5} fill="#6d28d9" textAnchor="middle">{dose}</ST>
          </G>
        )
      })}

      {/* ── Volatile agent bars ────────────────────────────── */}
      <ST x={1} y={agentY0 + BAR_H / 2 + 2} fontSize={4} fill="#0f766e" textAnchor="start">Agent</ST>
      {agents.slice(0, agentRows).map((a: any, i: number) => {
        const x1 = xOf(a.startCol ?? 0)
        const x2 = xOf(a.endCol ?? a.startCol ?? 0)
        const y  = agentY0 + i * BAR_H
        const w  = Math.max(x2 - x1, 4)
        const label = String(a.name ?? "").substring(0, 18)
        return (
          <G key={i}>
            <Rect x={x1} y={y + 1} width={w} height={BAR_H - 3} fill="#ccfbf1" stroke="#0d9488" strokeWidth={0.5} />
            <ST x={x1 + 2} y={y + 7} fontSize={4} fill="#0f766e">{label}</ST>
          </G>
        )
      })}

      {/* ── Infusion bars ──────────────────────────────────── */}
      <ST x={1} y={infY0 + BAR_H / 2 + 2} fontSize={4} fill="#0369a1" textAnchor="start">Inf.</ST>
      {infusions.slice(0, infRows).map((inf: any, i: number) => {
        const x1 = xOf(inf.startCol ?? 0)
        const x2 = xOf(inf.endCol ?? inf.startCol ?? 0)
        const y  = infY0 + i * BAR_H
        const w  = Math.max(x2 - x1, 4)
        const label = `${String(inf.name ?? "").substring(0, 14)} ${inf.rate ?? ""}${inf.unit ? " " + inf.unit : ""}`
        return (
          <G key={i}>
            <Rect x={x1} y={y + 1} width={w} height={BAR_H - 3} fill="#dbeafe" stroke="#3b82f6" strokeWidth={0.5} />
            <ST x={x1 + 2} y={y + 7} fontSize={4} fill="#0369a1">{label}</ST>
          </G>
        )
      })}

      {/* ── Fluid bars ─────────────────────────────────────── */}
      <ST x={1} y={fluidY0 + BAR_H / 2 + 2} fontSize={4} fill="#374151" textAnchor="start">Fluids</ST>
      {fluids.slice(0, fluidRows).map((f: any, i: number) => {
        const x1  = xOf(f.startCol ?? 0)
        const x2  = xOf(f.endCol ?? f.startCol ?? 0)
        const y   = fluidY0 + i * BAR_H
        const w   = Math.max(x2 - x1, 4)
        const col = fluidColor(f.category ?? "")
        const label = `${String(f.name ?? "").substring(0, 12)}${f.volume ? " " + f.volume + "mL" : ""}`
        return (
          <G key={i}>
            <Rect x={x1} y={y + 1} width={w} height={BAR_H - 3} fill={col + "33"} stroke={col} strokeWidth={0.5} />
            <ST x={x1 + 2} y={y + 7} fontSize={4} fill={col}>{label}</ST>
          </G>
        )
      })}

      {/* ── Strip dividers ─────────────────────────────────── */}
      {agentY0 > 0 && <Line x1={YAXIS_W} y1={agentY0} x2={GW + YAXIS_W} y2={agentY0} stroke="#e2e8f0" strokeWidth={0.3} />}
      {infY0 > agentY0 && <Line x1={YAXIS_W} y1={infY0} x2={GW + YAXIS_W} y2={infY0} stroke="#e2e8f0" strokeWidth={0.3} />}
      {fluidY0 > infY0 && <Line x1={YAXIS_W} y1={fluidY0} x2={GW + YAXIS_W} y2={fluidY0} stroke="#e2e8f0" strokeWidth={0.3} />}
    </Svg>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────
type CaseData = any

export function AnesthesiaProtocolPDF({
  caseId, height = "600px",
}: {
  caseId: string
  height?: string
}) {
  const [data,    setData]    = useState<CaseData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/cases/${caseId}`).then(r => r.json()).then(d => { setData(d); setLoading(false) })
  }, [caseId])

  if (loading) return <p className="text-sm text-slate-500 py-8 text-center">Loading case data…</p>
  if (!data)   return <p className="text-sm text-red-500">Failed to load case data.</p>

  const p    = data.preop
  const i    = data.intraop
  const o    = data.postop
  const inst = data.institution

  // Parsed arrays
  const techniques:   string[] = Array.isArray(i?.techniques)       ? i.techniques       : []
  const positions:    string[] = Array.isArray(i?.positions)        ? i.positions        : []
  const ventModes:    string[] = Array.isArray(i?.ventilationModes) ? i.ventilationModes : []
  const airwayTools:  string[] = Array.isArray(i?.airwayTools)      ? i.airwayTools      : []
  const vascular:     any[]    = Array.isArray(i?.vascularAccesses) ? i.vascularAccesses : []
  const comorbidities: any[]   = Array.isArray(p?.comorbidities)    ? p.comorbidities    : []
  const labResults:   any[]    = Array.isArray(p?.labResults)       ? p.labResults.filter((l: any) => l.value) : []
  const handoverItems: string[] = Array.isArray(o?.handoverItems)   ? o.handoverItems    : []

  const activeMonitors = MONITORING_FIELDS.filter(m => i?.[m.f]).map(m => m.l)

  const timetable = i?.keyEvents && typeof i.keyEvents === "object" && !Array.isArray(i.keyEvents) ? i.keyEvents : {}

  // Duration string
  function duration() {
    if (!i?.startTime || !i?.endTime) return null
    const s = new Date(i.startTime), e = new Date(i.endTime)
    const mins = Math.round((e.getTime() - s.getTime()) / 60000)
    const fmt = (d: Date) => `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`
    return `${fmt(s)} → ${fmt(e)} (${Math.floor(mins / 60)}h ${mins % 60}m)`
  }

  // Vascular access summary
  function vascStr() {
    return vascular.map(a => `${a.siteLabel?.split(" › ").pop() ?? a.site ?? ""} ${a.size ?? ""}${a.sizeUnit ?? ""}`.trim()).join(" · ") || null
  }

  // Postop Aldrete badge style
  const aldreteTotal = o?.aldreteTotal ?? 0
  const aldreteBadge = aldreteTotal >= 9 ? S.badgeGreen : aldreteTotal >= 7 ? S.badgeAmber : S.badgeRed

  const patientLine = `${p?.ageYears ?? ""}y · ${p?.sex === "MALE" ? "M" : p?.sex === "FEMALE" ? "F" : p?.sex ?? "—"}`
    + (p?.bloodType ? ` · ${p.bloodType}${p.rhFactor === "POSITIVE" ? "+" : p.rhFactor === "NEGATIVE" ? "−" : ""}` : "")

  const dateStr = (() => {
    if (!i?.monthYear) return ""
    const [y, m] = i.monthYear.split("-")
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"]
    return `${months[parseInt(m, 10) - 1] ?? ""} ${y}`
  })()

  function PageHeader({ page }: { page: number }) {
    return (
      <View style={S.header}>
        <View>
          <Text style={S.title}>ANAESTHESIA PROTOCOL — LOSPOR</Text>
          <Text style={S.subtitle}>{inst?.name}{inst?.city ? " · " + inst.city : ""} · {dateStr}</Text>
          {p?.diagnosis && <Text style={[S.subtitle, { marginTop: 2, fontFamily: "Helvetica-Bold", color: "#1e293b" }]}>{p.diagnosis}</Text>}
          {p?.plannedProcedure && <Text style={[S.subtitle, { color: "#475569" }]}>{p.plannedProcedure}</Text>}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <View style={{ borderBottom: "0.5pt solid #cbd5e1", width: 120, marginBottom: 2 }} />
          <Text style={S.subtitle}>{patientLine}</Text>
          <Text style={[S.subtitle, { marginTop: 2, color: "#94a3b8" }]}>Page {page} of 2</Text>
        </View>
      </View>
    )
  }

  return (
    <div style={{ height }}>
      <PDFViewer width="100%" height="100%" style={{ borderRadius: 8 }}>
        <Document title={`LOSPOR Protocol — ${data?.caseCode ?? "draft"}`}>

          {/* ══════════════════════════════════════════════════════
              PAGE 1 — LANDSCAPE — INTRAOPERATIVE
          ══════════════════════════════════════════════════════ */}
          <Page size="A4" orientation="landscape" style={S.page1}>
            <PageHeader page={1} />

            {/* GDPR */}
            <View style={S.disclaimer}>
              <Text style={{ color: "#92400e", fontSize: 5.5 }}>
                Personal anaesthetic case log — not a clinical record. Patient identity fields are blank; fill in by hand after printing.
              </Text>
            </View>

            {/* Info row: Technique | Monitoring | Timeline */}
            <View style={[S.row, { marginBottom: 6 }]}>
              {/* Technique & Airway */}
              <View style={[S.card, S.col]}>
                <Text style={S.sec}>Anaesthesia</Text>
                {techniques.length > 0 && (
                  <F label="Technique" value={techniques.map((t: string) => t.replace(/_/g, " ")).join(" + ")} />
                )}
                <F label="Airway"     value={deviceStr(i)} />
                {airwayTools.length > 0 && (
                  <F label="Tools" value={airwayTools.map((t: string) => t.replace(/_/g, " ")).join(", ")} />
                )}
                {i?.cormackLehane && <F label="Cormack-Lehane" value={i.cormackLehane} />}
                {ventModes.length > 0 && (
                  <F label="Ventilation" value={ventModes.join(", ")} />
                )}
                {i?.peepCmH2O   && <F label="PEEP"    value={`${i.peepCmH2O} cmH₂O`} />}
                {i?.volatileAgent && <F label="Agent"  value={i.volatileAgent} />}
                {i?.fgfLitersPerMin != null && <F label="Fresh gas flow" value={`${i.fgfLitersPerMin} L/min`} />}
                {i?.carrierGas && <F label="Carrier gas" value={`O₂ + ${i.carrierGas === "n2o" ? "N₂O" : "Air"}`} />}
                {i?.fio2Percent != null && <F label="FiO₂" value={`${i.fio2Percent}%`} />}
                {p?.premedicationEvening && <F label="Premed. eve." value={p.premedicationEvening} />}
                {p?.premedicationMorning && <F label="Premed. morn." value={p.premedicationMorning} />}
              </View>

              {/* Monitoring */}
              <View style={[S.card, S.col]}>
                <Text style={S.sec}>Monitoring</Text>
                {activeMonitors.length > 0 ? (
                  <View style={S.tagRow}>
                    {activeMonitors.map(m => (
                      <Tag key={m} style={S.tagBlue}>{m}</Tag>
                    ))}
                  </View>
                ) : (
                  <Text style={{ color: "#94a3b8" }}>Not documented</Text>
                )}
                {vascular.length > 0 && (
                  <>
                    <Text style={[S.sec, { marginTop: 5 }]}>Vascular Access</Text>
                    <Text style={{ fontSize: 6.5, color: "#1e293b" }}>{vascStr()}</Text>
                  </>
                )}
              </View>

              {/* Timeline & positions */}
              <View style={[S.card, S.col]}>
                <Text style={S.sec}>Timeline</Text>
                {duration() && <F label="Duration" value={duration()} />}
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
                  <Text style={[S.lbl, { width: 60 }]}>Anaesthesiologist</Text>
                  <View style={{ flex: 1, borderBottom: "0.5pt solid #cbd5e1" }} />
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
                  <Text style={[S.lbl, { width: 60 }]}>Nurse</Text>
                  <View style={{ flex: 1, borderBottom: "0.5pt solid #cbd5e1" }} />
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
                  <Text style={[S.lbl, { width: 60 }]}>Surgeon</Text>
                  <View style={{ flex: 1, borderBottom: "0.5pt solid #cbd5e1" }} />
                </View>
                {positions.length > 0 && (
                  <F label="Position" value={positions.map((pos: string) => pos.replace(/_/g, " ")).join(", ")} />
                )}
                {p?.asaScore && (
                  <View style={[S.field, { marginTop: 4 }]}>
                    <Text style={S.lbl}>ASA</Text>
                    <View style={[S.badge, S.tagAmber]}><Text>Class {p.asaScore}{p.emergencySurgery ? "E" : ""}</Text></View>
                  </View>
                )}
              </View>
            </View>

            {/* Clinical chart */}
            <ClinicalChart timetable={timetable} startISO={i?.startTime} />

            {/* Fluid balance */}
            <View style={[S.card, { marginTop: 6 }]}>
              <Text style={S.sec}>Fluid balance</Text>
              <View style={S.fluidGrid}>
                {[
                  { label: "Crystalloids", value: i?.crystalloidsMl },
                  { label: "Colloids",     value: i?.colloidsMl },
                  { label: "Blood",        value: i?.bloodMl },
                  { label: "Urine out",    value: i?.urineMl },
                ].map(({ label, value }) => (
                  <View key={label} style={S.fluidItem}>
                    <Text style={S.fluidVal}>{value ?? "—"}</Text>
                    <Text style={S.fluidLbl}>{label} (mL)</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Signatures */}
            <View style={S.sigRow}>
              {["Anaesthesiologist", "Anaesthesia nurse", "Surgeon"].map(r => (
                <View key={r} style={S.sigCol}>
                  <Text style={{ color: "#94a3b8", fontSize: 6 }}>{r}</Text>
                </View>
              ))}
            </View>

            <View style={S.footer} fixed>
              <Text style={{ flexShrink: 1 }}>LOSPOR personal case log · Not a clinical record · No patient IDs</Text>
              <Text style={{ flexShrink: 0, marginLeft: 8 }}>Generated {format(new Date(), "dd MMM yyyy HH:mm")}</Text>
            </View>
          </Page>

          {/* ══════════════════════════════════════════════════════
              PAGE 2 — PORTRAIT — PREOP + POSTOP
          ══════════════════════════════════════════════════════ */}
          <Page size="A4" style={S.page2}>
            <PageHeader page={2} />

            {/* ── PREOPERATIVE ─────────────────────────────────── */}
            <View style={S.row}>
              {/* LEFT: Risk + Airway */}
              <View style={[S.card, S.col]}>
                <Text style={S.sec}>Risk scores</Text>
                {p?.asaScore   && <F label="ASA"        value={`Class ${p.asaScore}${p.emergencySurgery ? "E" : ""}`} />}
                {p?.rcriScore  != null && <F label="RCRI"  value={`${p.rcriScore}/6 — ${rcriRiskLabel(p.rcriScore)}`} />}
                {p?.gutaScore  != null && <F label="GUPTA" value={`${p.gutaScore}%`} />}
                {p?.apfelScore != null && <F label="Apfel" value={`${p.apfelScore}/4 — ${apfelRiskLabel(p.apfelScore)}`} />}
                {p?.stopBangScore != null && <F label="STOP-BANG" value={`${p.stopBangScore}/8 — ${stopBangRiskLabel(p.stopBangScore)}`} />}

                <Text style={[S.sec, { marginTop: 5 }]}>Airway assessment</Text>
                <F label="Mallampati"     value={p?.mallampati} />
                <F label="Mouth opening"  value={p?.mouthOpeningCm ? `${p.mouthOpeningCm} cm` : null} />
                <F label="Thyromental"    value={p?.thyromental ? `${p.thyromental} cm` : null} />
                <F label="Neck mobility"  value={p?.neckMobility} />
                <F label="ULBT"           value={p?.upperLipBiteTest} />
                <F label="Cormack-Lehane" value={p?.cormackLehane} />
                {p?.difficultAirwayHistory && (
                  <View style={[S.tag, S.tagRed, { marginTop: 3 }]}><Text>⚠ Difficult airway history</Text></View>
                )}
                {p?.difficultAirwayNotes && (
                  <Text style={{ fontSize: 6, color: "#991b1b", marginTop: 2 }}>{p.difficultAirwayNotes}</Text>
                )}

                <Text style={[S.sec, { marginTop: 5 }]}>Preoperative vitals</Text>
                <F label="BP"     value={p?.bpSystolic && p?.bpDiastolic ? `${p.bpSystolic}/${p.bpDiastolic} mmHg` : null} />
                <F label="HR"     value={p?.heartRate ? `${p.heartRate} bpm` : null} />
                <F label="SpO₂"   value={p?.spO2 ? `${p.spO2}%` : null} />
                <F label="Temp"   value={p?.temperature ? `${p.temperature} °C` : null} />
                <F label="RR"     value={p?.respiratoryRate ? `${p.respiratoryRate}/min` : null} />
              </View>

              {/* RIGHT: History + Labs */}
              <View style={[S.card, S.col]}>
                <Text style={S.sec}>Patient</Text>
                <F label="Height / Weight" value={p?.heightCm && p?.weightKg ? `${p.heightCm} cm / ${p.weightKg} kg` : null} />
                <F label="BMI"            value={p?.bmi ? `${p.bmi} kg/m²` : null} />

                {comorbidities.length > 0 && (
                  <>
                    <Text style={[S.sec, { marginTop: 5 }]}>Comorbidities</Text>
                    <View style={S.tagRow}>
                      {comorbidities.map((c: any, idx: number) => (
                        <Tag key={idx} style={S.tagAmber}>{c.label ?? String(c)}</Tag>
                      ))}
                    </View>
                  </>
                )}

                {p?.currentMedications && (
                  <>
                    <Text style={[S.sec, { marginTop: 5 }]}>Current medications</Text>
                    <Text style={{ fontSize: 6.5, color: "#1e293b", lineHeight: 1.4 }}>{p.currentMedications}</Text>
                  </>
                )}

                {(p?.allergies || p?.latexAllergy) && (
                  <>
                    <Text style={[S.sec, { marginTop: 5, color: "#991b1b" }]}>Allergies</Text>
                    {p?.allergyDetails && (
                      <Text style={{ fontSize: 6.5, color: "#991b1b", fontFamily: "Helvetica-Bold" }}>{p.allergyDetails}</Text>
                    )}
                    {p?.latexAllergy && <Text style={{ fontSize: 6, color: "#991b1b" }}>⚠ Latex allergy</Text>}
                  </>
                )}

                {labResults.length > 0 && (
                  <>
                    <Text style={[S.sec, { marginTop: 5 }]}>Laboratory results</Text>
                    {labResults.map((l: any, idx: number) => (
                      <View key={idx} style={S.field}>
                        <Text style={S.lbl}>{l.test}</Text>
                        <Text style={S.val}>{l.value}{l.unit ? " " + l.unit : ""}</Text>
                      </View>
                    ))}
                  </>
                )}
              </View>
            </View>

            {/* ── POSTOPERATIVE ─────────────────────────────────── */}
            <View style={S.postopSep}>
              <Text style={S.postopTitle}>Postoperative Recovery</Text>

              {/* Aldrete row */}
              <View style={S.aldreteRow}>
                {[
                  ["Activity",      o?.aldreteActivity],
                  ["Respiration",   o?.aldreteRespiration],
                  ["Circulation",   o?.aldreteCirculation],
                  ["Consciousness", o?.aldreteConsciousness],
                  ["SpO₂",          o?.aldreteSpO2],
                ].map(([label, val]) => (
                  <View key={label as string} style={S.aldreteCell}>
                    <Text style={{ fontSize: 5.5, color: "#64748b", marginBottom: 2 }}>{label as string}</Text>
                    <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: "#1e293b" }}>{val ?? "—"}/2</Text>
                  </View>
                ))}
                <View style={[S.aldreteCell, { backgroundColor: aldreteTotal >= 9 ? "#dcfce7" : aldreteTotal >= 7 ? "#fef3c7" : "#fee2e2" }]}>
                  <Text style={{ fontSize: 5.5, color: "#64748b", marginBottom: 2 }}>TOTAL</Text>
                  <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: aldreteTotal >= 9 ? "#166534" : aldreteTotal >= 7 ? "#92400e" : "#991b1b" }}>
                    {o?.aldreteTotal ?? "—"}/10
                  </Text>
                  <Text style={{ fontSize: 4.5, color: "#64748b", marginTop: 1 }}>
                    {aldreteTotal >= 9 ? "Ready" : aldreteTotal >= 7 ? "Monitor" : "Continue"}
                  </Text>
                </View>
              </View>

              {/* Recovery metrics */}
              <View style={[S.row, { marginBottom: 0 }]}>
                <View style={[S.card, S.col]}>
                  <Text style={S.sec}>Recovery</Text>
                  <F label="Blood pressure" value={o?.recoveryBpSystolic != null && o?.recoveryBpDiastolic != null ? `${o.recoveryBpSystolic}/${o.recoveryBpDiastolic} mmHg` : null} />
                  <F label="Heart rate" value={o?.recoveryHeartRate != null ? `${o.recoveryHeartRate} bpm` : null} />
                  <F label="SpO₂" value={o?.recoverySpO2 != null ? `${o.recoverySpO2}%` : null} />
                  <F label="Temperature"    value={o?.temperatureCelsius ? `${o.temperatureCelsius} °C` : null} />
                  <F label="Pain (NRS)"     value={o?.painScoreNRS != null ? `${o.painScoreNRS}/10` : null} />
                  <F label="PONV"           value={o?.ponv ? "Yes" : o?.ponv === false ? "No" : null} />
                </View>
                <View style={[S.card, S.col]}>
                  <Text style={S.sec}>Disposition</Text>
                  {o?.disposition && (
                    <View style={[S.badge,
                      o.disposition === "WARD" ? S.badgeGreen :
                      o.disposition === "PACU" ? S.badgeAmber : S.badgeRed,
                      { marginBottom: 4, alignSelf: "flex-start" }
                    ]}>
                      <Text>{o.disposition}</Text>
                    </View>
                  )}
                  {o?.dispositionNotes && (
                    <Text style={{ fontSize: 6.5, color: "#1e293b", lineHeight: 1.4 }}>{o.dispositionNotes}</Text>
                  )}
                </View>
              </View>

              {/* Handover checklist */}
              {handoverItems.length > 0 && (
                <View style={[S.card, { marginTop: 0 }]}>
                  <Text style={S.sec}>Handover instructions</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 3 }}>
                    {handoverItems.map((code: string, idx: number) => {
                      // Resolve code to label
                      const label = code.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
                      return (
                        <View key={idx} style={[S.tag, { backgroundColor: "#f0fdf4", paddingHorizontal: 4 }]}>
                          <Text>✓ {label}</Text>
                        </View>
                      )
                    })}
                  </View>
                </View>
              )}
            </View>

            {/* Signatures */}
            <View style={S.sigRow}>
              {["Anaesthesiologist", "Anaesthesia nurse", "Surgeon"].map(r => (
                <View key={r} style={S.sigCol}>
                  <Text style={{ color: "#94a3b8", fontSize: 6 }}>{r}</Text>
                </View>
              ))}
            </View>

            <View style={S.footer} fixed>
              <Text style={{ flexShrink: 1 }}>LOSPOR personal case log · Not a clinical record · No patient IDs</Text>
              <Text style={{ flexShrink: 0, marginLeft: 8 }}>Generated {format(new Date(), "dd MMM yyyy HH:mm")}</Text>
            </View>
          </Page>
        </Document>
      </PDFViewer>
    </div>
  )
}
