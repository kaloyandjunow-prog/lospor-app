import type { RecordLane, RecordTimetable } from "@lospor/core/record-timetable"

/**
 * The record's timetable drawn as one SVG: the vitals graph on top, then a lane per drug (a diamond for
 * every dose, its amount beside it), then a bar lane for each infusion, agent, gas and fluid. Pure
 * drawing; the model decides what is on it (Core's `buildRecordTimetable`). Light paper in every theme.
 */
const INK = "#334155"
const FAINT = "#e2e8f0"
const SBP = "#f87171"
const HR = "#4ade80"
const BAND = "rgba(220,38,38,.12)"
const TONE: Record<string, string> = { infusion: "#2563eb", agent: "#0d9488", gas: "#0284c7", fluid: "#0ea5e9", position: "#64748b" }
const MARGIN_RIGHT = 10

type Props = {
  model: RecordTimetable
  width?: number
  labelWidth?: number
  fontSize?: number
  graphHeight?: number
  /** Minutes between the time marks; chosen from the length of the case when left out. */
  tickMinutes?: number
}

const colMinutes = 5

export function pickTickMinutes(columns: number): number {
  const hours = (columns * colMinutes) / 60
  return hours <= 4 ? 30 : hours <= 10 ? 60 : 120
}

type Placed = { px: number; text: string; flip: boolean; track: number; card: boolean }
type BolusRow = { kind: "bolus"; lane: Extract<RecordLane, { kind: "bolus" }>; placed: Placed[]; h: number }
type BarsRow = { kind: "bars"; lane: Extract<RecordLane, { kind: "bars" }>; h: number }

/** Where each dose label goes: beside its diamond when there is room, else the track above or below; dropped when none fits. */
function placeDoses(lane: Extract<RecordLane, { kind: "bolus" }>, x: (col: number) => number, left: number, width: number, fs: number): BolusRow {
  const cw = (txt: string) => txt.length * fs * 0.56 + 6
  const taken: Array<Array<[number, number]>> = [lane.doses.map(d => [x(d.col) - 5, x(d.col) + 5] as [number, number]), [], []]
  const placed: Placed[] = lane.doses.map(d => {
    const px = x(d.col)
    const text = d.label + (d.card ? " ★" : "")
    const wd = cw(text)
    const flip = px > left + (width - left) * 0.82
    const iv: [number, number] = flip ? [px - 8 - wd, px - 8] : [px + 8, px + 8 + wd]
    const free = (k: number) => !taken[k]!.some(([lo, hi]) => iv[0] < hi && iv[1] > lo)
    const track = [0, 1, 2].find(free) ?? -1
    if (track >= 0) taken[track]!.push(iv)
    return { px, text, flip, track, card: d.card }
  })
  return { kind: "bolus", lane, placed, h: placed.some(p => p.track !== 0) ? 34 : 20 }
}

export function RecordChart({ model, width = 1040, labelWidth = 118, fontSize = 9.5, graphHeight = 175, tickMinutes }: Props) {
  const { firstCol, lastCol } = model
  const left = labelWidth
  const span = Math.max(1, lastCol - firstCol + 1)
  const x = (col: number) => left + ((Math.min(Math.max(col, firstCol), lastCol + 1) - firstCol) / span) * (width - left - MARGIN_RIGHT)
  const tick = tickMinutes ?? pickTickMinutes(span)
  const tickStep = Math.max(1, Math.round(tick / colMinutes))
  const ticks: number[] = []
  for (let col = firstCol; col <= lastCol + 1; col += tickStep) ticks.push(col)

  // Vitals graph
  const top = model.flags.length ? 40 : 10
  const bottom = 18
  const lo = 40, hi = 180
  const y = (v: number) => top + (1 - (v - lo) / (hi - lo)) * (graphHeight - top - bottom)
  const line = (key: "systolic" | "diastolic" | "heartRate") => model.vitals.filter(v => typeof v[key] === "number").map((v, i) => `${i ? "L" : "M"}${x(v.col + 0.5).toFixed(1)} ${y(v[key] as number).toFixed(1)}`).join(" ")

  // Lanes
  const rows: Array<BolusRow | BarsRow> = model.lanes.map(lane => lane.kind === "bolus"
    ? placeDoses(lane, c => x(c + 0.5), left, width, fontSize)
    : { kind: "bars", lane, h: 20 })
  const lanesHeight = rows.reduce((sum, r) => sum + r.h, 0) + 18
  const total = graphHeight + lanesHeight
  const tops = rows.reduce<number[]>((acc, r, k) => { acc.push(k === 0 ? graphHeight : acc[k - 1]! + rows[k - 1]!.h); return acc }, [])

  return (
    <svg viewBox={`0 0 ${width} ${total}`} width="100%" role="img" aria-label="Vitals, drugs, infusions and fluids on the time axis" style={{ display: "block", font: `${fontSize}px system-ui, sans-serif` }}>
      {/* episode bands run through the graph and the lanes */}
      {model.episodes.map((e, i) => <rect key={`band-${i}`} x={x(e.fromCol)} y={top} width={Math.max(2, x(e.toCol + 1) - x(e.fromCol))} height={total - top - 16} fill={BAND} />)}
      {[60, 90, 120, 150].map(v => (
        <g key={v}><line x1={left} x2={width - MARGIN_RIGHT} y1={y(v)} y2={y(v)} stroke={FAINT} strokeWidth={0.7} /><text x={left - 6} y={y(v) + 3} fill={INK} textAnchor="end" opacity={0.6}>{v}</text></g>
      ))}
      {ticks.map(col => <line key={`g-${col}`} x1={x(col)} x2={x(col)} y1={top} y2={total - 16} stroke={FAINT} strokeWidth={0.7} />)}
      <path d={line("diastolic")} fill="none" stroke={SBP} strokeWidth={1.1} strokeDasharray="3 3" opacity={0.7} />
      <path d={line("systolic")} fill="none" stroke={SBP} strokeWidth={1.7} />
      <path d={line("heartRate")} fill="none" stroke={HR} strokeWidth={1.5} />
      {model.flags.map((f, i) => (
        <g key={`flag-${i}`}>
          <line x1={x(f.col)} x2={x(f.col)} y1={top - 4} y2={graphHeight - bottom} stroke="#6366f1" strokeWidth={0.8} strokeDasharray="3 3" opacity={0.7} />
          <text x={x(f.col) + 3} y={12 + (i % 3) * 11} fill="#4f46e5" fontSize={9.5}>{f.label}</text>
        </g>
      ))}
      {rows.map((row, ri) => {
        const rowTop = tops[ri]!
        const yc = rowTop + (row.kind === "bolus" && row.h > 20 ? 17 : 10)
        return (
          <g key={`row-${ri}`}>
            <line x1={left} x2={width - MARGIN_RIGHT} y1={rowTop + row.h} y2={rowTop + row.h} stroke={FAINT} strokeWidth={0.5} />
            <text x={left - 6} y={yc + 3.5} textAnchor="end" fill={INK} fontWeight={600}>{row.lane.name}</text>
            {row.kind === "bolus" ? row.placed.map((p, pi) => {
              const colour = p.card ? "#d97706" : "#0369a1"
              const ty = p.track === 1 ? yc - 8 : p.track === 2 ? yc + 10 : yc + 3.5
              return (
                <g key={pi}>
                  <path d={`M${p.px} ${yc - 5} l4.5 5 l-4.5 5 l-4.5 -5z`} fill={colour} />
                  {p.track >= 0 && <text x={p.flip ? p.px - 8 : p.px + 8} y={ty} textAnchor={p.flip ? "end" : "start"} fill={colour} fontWeight={700}>{p.text}</text>}
                </g>
              )
            }) : row.lane.bars.map((b, bi) => {
              const a = x(b.startCol), e = x(b.endCol + 1), wd = e - a
              const fits = wd > b.label.length * fontSize * 0.56 + 22
              return (
                <g key={bi}>
                  <rect x={a} y={yc - 6.5} width={Math.max(2, wd)} height={13} rx={6.5} fill={TONE[row.lane.tone]} opacity={bi % 2 ? 0.82 : 1} />
                  {fits && <text x={a + 7} y={yc + 3.4} fill="#fff" fontWeight={600}>{b.label}</text>}
                </g>
              )
            })}
          </g>
        )
      })}
      {ticks.map(col => <text key={`t-${col}`} x={x(col)} y={total - 4} textAnchor="middle" fill={INK} opacity={0.65}>{model.time(col)}</text>)}
    </svg>
  )
}

