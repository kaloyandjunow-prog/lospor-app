"use client"

import { useState } from "react"
import { ChevronRight, Plus, X } from "lucide-react"

// ── Tree data (Combined removed — combine by adding multiple) ─────────────────
interface Node { v: string; label: string; children?: Node[] }

const TREE: Node[] = [
  {
    v: "GENERAL", label: "General Anaesthesia",
    children: [
      { v: "GENERAL_INHALATION", label: "Inhalational" },
      { v: "GENERAL_TIVA",       label: "TIVA" },
      { v: "GENERAL_BALANCED",   label: "Balanced (inhaled + IV)" },
    ],
  },
  {
    v: "REGIONAL", label: "Regional Anaesthesia",
    children: [
      {
        v: "NEURAXIAL", label: "Neuraxial",
        children: [
          {
            v: "SPINAL", label: "Spinal (SAB)",
            children: [
              {
                v: "SPINAL_SINGLE", label: "Single shot",
                children: [
                  { v: "SPINAL_SINGLE_LUMBAR",        label: "Lumbar" },
                  { v: "SPINAL_SINGLE_LOW_THORACIC",  label: "Low thoracic" },
                  { v: "SPINAL_SINGLE_MID_THORACIC",  label: "Mid thoracic" },
                  { v: "SPINAL_SINGLE_HIGH_THORACIC", label: "High thoracic" },
                ],
              },
              {
                v: "SPINAL_CONTINUOUS", label: "Continuous",
                children: [
                  { v: "SPINAL_CONT_LUMBAR",        label: "Lumbar" },
                  { v: "SPINAL_CONT_LOW_THORACIC",  label: "Low thoracic" },
                  { v: "SPINAL_CONT_MID_THORACIC",  label: "Mid thoracic" },
                  { v: "SPINAL_CONT_HIGH_THORACIC", label: "High thoracic" },
                ],
              },
            ],
          },
          {
            v: "EPIDURAL", label: "Epidural",
            children: [
              { v: "EPIDURAL_CAUDAL",        label: "Caudal" },
              { v: "EPIDURAL_LUMBAR",        label: "Lumbar" },
              { v: "EPIDURAL_LOW_THORACIC",  label: "Low thoracic" },
              { v: "EPIDURAL_MID_THORACIC",  label: "Mid thoracic" },
              { v: "EPIDURAL_HIGH_THORACIC", label: "High thoracic" },
            ],
          },
          {
            v: "CSE", label: "Combined spinal-epidural (CSE)",
            children: [
              { v: "CSE_LUMBAR",        label: "Lumbar" },
              { v: "CSE_LOW_THORACIC",  label: "Low thoracic" },
              { v: "CSE_MID_THORACIC",  label: "Mid thoracic" },
              { v: "CSE_HIGH_THORACIC", label: "High thoracic" },
            ],
          },
          { v: "DPE", label: "Dural Puncture Epidural (DPE)" },
        ],
      },
      {
        v: "PERIPHERAL", label: "Peripheral nerve block",
        children: [
          {
            v: "BLOCK_UPPER", label: "Upper extremity",
            children: [
              { v: "BLOCK_INTERSCALENE",    label: "Interscalene" },
              { v: "BLOCK_SUPRACLAVICULAR", label: "Supraclavicular" },
              { v: "BLOCK_INFRACLAVICULAR", label: "Infraclavicular" },
              { v: "BLOCK_AXILLARY",        label: "Axillary" },
              { v: "BLOCK_WRIST",           label: "Wrist block" },
              { v: "BLOCK_DIGITAL",         label: "Digital block" },
              { v: "BLOCK_BIER",            label: "Bier block (IVRA)" },
              { v: "BLOCK_ELBOW",           label: "Elbow block" },
            ],
          },
          {
            v: "BLOCK_LOWER", label: "Lower extremity",
            children: [
              { v: "BLOCK_FEMORAL",       label: "Femoral nerve" },
              { v: "BLOCK_ADDUCTOR",      label: "Adductor canal (saphenous)" },
              { v: "BLOCK_SCIATIC",       label: "Sciatic nerve" },
              { v: "BLOCK_POPLITEAL",     label: "Popliteal sciatic" },
              { v: "BLOCK_ANKLE",         label: "Ankle block" },
              { v: "BLOCK_OBTURATOR",     label: "Obturator nerve" },
              { v: "BLOCK_LAT_FEMORAL",   label: "Lateral femoral cutaneous" },
              { v: "BLOCK_LUMBAR_PLEXUS", label: "Lumbar plexus (psoas)" },
              { v: "BLOCK_IPACK",         label: "IPACK" },
              { v: "BLOCK_GENICULAR",     label: "Genicular nerves" },
              { v: "BLOCK_FOOT",          label: "Foot block" },
            ],
          },
          {
            v: "BLOCK_TRUNK", label: "Trunk / Abdominal wall",
            children: [
              { v: "BLOCK_TAP",            label: "TAP block" },
              { v: "BLOCK_RECTUS",         label: "Rectus sheath block" },
              { v: "BLOCK_PARAVERTEBRAL",  label: "Paravertebral block" },
              { v: "BLOCK_ESP",            label: "Erector spinae plane (ESP)" },
              { v: "BLOCK_SERRATUS",       label: "Serratus anterior plane" },
              { v: "BLOCK_PECS1",          label: "PECS I" },
              { v: "BLOCK_PECS2",          label: "PECS II" },
              { v: "BLOCK_QL",             label: "Quadratus lumborum (QL)" },
              { v: "BLOCK_ILIOINGUINAL",   label: "Ilioinguinal / iliohypogastric" },
              { v: "BLOCK_INTERCOSTAL",    label: "Intercostal block" },
            ],
          },
          {
            v: "BLOCK_HEAD_NECK", label: "Head & Neck",
            children: [
              { v: "BLOCK_SUPERFICIAL_CERVICAL", label: "Superficial cervical plexus" },
              { v: "BLOCK_DEEP_CERVICAL",        label: "Deep cervical plexus" },
              { v: "BLOCK_SCALP",                label: "Scalp block" },
              { v: "BLOCK_TRIGEMINAL",           label: "Trigeminal nerve" },
              { v: "BLOCK_SPHENOPALATINE",       label: "Sphenopalatine ganglion" },
              { v: "BLOCK_GLOSSOPHARYNGEAL",     label: "Glossopharyngeal nerve" },
            ],
          },
          {
            v: "BLOCK_OPHTHALMIC", label: "Ophthalmic",
            children: [
              { v: "BLOCK_PERIBULBAR",  label: "Peribulbar block" },
              { v: "BLOCK_RETROBULBAR", label: "Retrobulbar block" },
              { v: "BLOCK_SUB_TENONS",  label: "Sub-Tenon's block" },
              { v: "BLOCK_TOPICAL_EYE", label: "Topical (eye)" },
            ],
          },
        ],
      },
    ],
  },
  {
    v: "SEDATION", label: "Sedation / MAC",
    children: [
      { v: "SEDATION_CONSCIOUS", label: "Conscious sedation" },
      { v: "SEDATION_DEEP",      label: "Deep sedation" },
      { v: "SEDATION_MAC",       label: "Monitored anesthesia care (MAC)" },
    ],
  },
  { v: "LOCAL",  label: "Local infiltration" },
  { v: "OTHER",  label: "Other…" },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function techniqueColor(v: string): string {
  if (v.startsWith("GENERAL"))                                             return "bg-violet-600 dark:bg-violet-700 border-violet-600 dark:border-violet-700 text-white"
  if (v.startsWith("SPINAL") || v.startsWith("EPIDURAL") || v.startsWith("CSE") || v.startsWith("NEURAXIAL") || v === "DPE")
                                                                           return "bg-blue-600 dark:bg-blue-700 border-blue-600 dark:border-blue-700 text-white"
  if (v.startsWith("BLOCK") || v.startsWith("PERIPHERAL"))                return "bg-emerald-600 dark:bg-emerald-700 border-emerald-600 dark:border-emerald-700 text-white"
  if (v.startsWith("SEDATION"))                                            return "bg-amber-500 dark:bg-amber-600 border-amber-500 dark:border-amber-600 text-white"
  if (v === "LOCAL")                                                       return "bg-rose-500 dark:bg-rose-600 border-rose-500 dark:border-rose-600 text-white"
  return "bg-slate-600 dark:bg-slate-500 border-slate-600 dark:border-slate-500 text-white"
}

function findPath(nodes: Node[], target: string, path: Node[] = []): Node[] | null {
  for (const n of nodes) {
    const curr = [...path, n]
    if (n.v === target) return curr
    if (n.children) { const f = findPath(n.children, target, curr); if (f) return f }
  }
  return null
}

function labelFor(v: string): string {
  const path = findPath(TREE, v)
  return path ? path[path.length - 1].label : v
}

function shortLabel(v: string): string {
  if (v.startsWith("OTHER:")) return v.slice(6) || "Other"
  const path = findPath(TREE, v)
  if (!path) return v
  return path.slice(-2).map(n => n.label).join(" › ")
}

// ── Inline tree picker ────────────────────────────────────────────────────────
function TreePicker({ onSelect, exclude }: { onSelect: (v: string) => void; exclude: string[] }) {
  const [path, setPath]           = useState<Node[]>([])
  const [showOther, setShowOther] = useState(false)
  const [otherText, setOtherText] = useState("")
  const nodes = path.length === 0 ? TREE : path[path.length - 1].children ?? []

  function pick(node: Node) {
    if (node.v === "OTHER") { setShowOther(true); return }
    if (node.children?.length) { setPath(p => [...p, node]) }
    else { onSelect(node.v) }
  }

  function commitOther() {
    const t = otherText.trim()
    if (t) { onSelect(`OTHER:${t}`); setOtherText(""); setShowOther(false) }
  }

  return (
    <div className="space-y-2">
      {/* Breadcrumb */}
      {path.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-slate-400 dark:text-[#666] flex-wrap">
          <button type="button" onClick={() => { setPath([]); setShowOther(false) }}
            className="hover:text-blue-500 transition-colors">Technique</button>
          {path.map((n, i) => (
            <span key={n.v} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 opacity-40" />
              <button type="button" onClick={() => setPath(p => p.slice(0, i + 1))}
                className="hover:text-blue-500 transition-colors">{n.label}</button>
            </span>
          ))}
        </div>
      )}

      {showOther ? (
        <div className="flex items-center gap-2">
          <input autoFocus type="text" placeholder="Describe technique…"
            value={otherText}
            onChange={e => setOtherText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") commitOther(); if (e.key === "Escape") setShowOther(false) }}
            className="flex-1 text-sm bg-white dark:bg-[#2a2a2a] border border-slate-200 dark:border-[#3a3a3a] rounded-lg px-3 py-1.5 outline-none focus:border-blue-400" />
          <button type="button" onClick={commitOther}
            className="text-sm font-medium px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white transition-colors">
            Add
          </button>
          <button type="button" onClick={() => setShowOther(false)}
            className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {nodes.filter(n => !exclude.includes(n.v)).map(node => (
              <button key={node.v} type="button" onClick={() => pick(node)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-[#c0c0c0] text-sm font-medium hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-500 dark:hover:text-blue-300 transition-all">
                {node.label}
                {node.children && <ChevronRight className="h-3 w-3 opacity-40 shrink-0" />}
              </button>
            ))}
          </div>
          {path.length > 0 && (
            <button type="button" onClick={() => setPath(p => p.slice(0, -1))}
              className="text-xs text-slate-400 dark:text-[#666] hover:text-slate-600 transition-colors">
              ← Back
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ── Main multi-select component ───────────────────────────────────────────────
export function TechniqueTree({ value = [], onChange }: {
  value?: string[]
  onChange: (v: string[]) => void
}) {
  const [adding, setAdding] = useState(false)

  function add(v: string) {
    if (!value.includes(v)) onChange([...value, v])
    setAdding(false)
  }

  function remove(v: string) {
    onChange(value.filter(x => x !== v))
  }

  return (
    <div className="space-y-3">
      {/* Selected pills + add button */}
      <div className="flex flex-wrap items-center gap-2">
        {value.map(v => (
          <div key={v}
            className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full border ${techniqueColor(v)}`}>
            <span className="text-[11px] leading-tight">{shortLabel(v)}</span>
            <button type="button" onClick={() => remove(v)}
              className="opacity-70 hover:opacity-100 transition-opacity">
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}

        {!adding && (
          <button type="button" onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border-2 border-dashed border-slate-300 dark:border-[#444] text-slate-400 dark:text-[#666] text-sm hover:border-blue-400 hover:text-blue-500 transition-all">
            <Plus className="h-3.5 w-3.5" />
            {value.length === 0 ? "Select technique" : "Add"}
          </button>
        )}

        {adding && (
          <button type="button" onClick={() => setAdding(false)}
            className="text-xs text-slate-400 dark:text-[#666] hover:text-red-400 transition-colors">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Tree picker */}
      {adding && (
        <div className="rounded-xl border border-slate-200 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#1a1a1a] p-3">
          <TreePicker onSelect={add} exclude={value} />
        </div>
      )}
    </div>
  )
}

// ── Show/hide helpers for IntraopForm ─────────────────────────────────────────
export function techniqueIsGeneral(values: string[])  { return values.some(v => v.startsWith("GENERAL")) }
export function techniqueUsesGas(values: string[])    { return values.some(v => v === "GENERAL_INHALATION" || v === "GENERAL_BALANCED") }
export function techniqueNeedsBlock(values: string[]) {
  return values.some(v =>
    v.startsWith("BLOCK_")    ||
    v.startsWith("SPINAL_")   ||
    v.startsWith("EPIDURAL_") ||
    v.startsWith("CSE_")      ||
    v === "DPE"
  )
}
