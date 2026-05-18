"use client"

import { useState } from "react"
import { X, Plus } from "lucide-react"
import { Input } from "@/components/ui/input"

export type LabResult = { test: string; value: string; unit: string }

const PRESETS: { cat: string; tests: { name: string; unit: string }[] }[] = [
  { cat: "Haematology", tests: [
    { name: "Hb",        unit: "g/dL"    },
    { name: "Hct",       unit: "%"       },
    { name: "WBC",       unit: "×10⁹/L" },
    { name: "Platelets", unit: "×10⁹/L" },
  ]},
  { cat: "Coagulation", tests: [
    { name: "PT/INR",     unit: "INR"  },
    { name: "aPTT",       unit: "s"    },
    { name: "Fibrinogen", unit: "g/L"  },
  ]},
  { cat: "Biochemistry", tests: [
    { name: "Na⁺",        unit: "mmol/L"         },
    { name: "K⁺",         unit: "mmol/L"         },
    { name: "Creatinine", unit: "µmol/L"          },
    { name: "Urea",       unit: "mmol/L"          },
    { name: "Glucose",    unit: "mmol/L"          },
    { name: "eGFR",       unit: "mL/min/1.73m²"  },
  ]},
  { cat: "Liver", tests: [
    { name: "ALT",       unit: "U/L"    },
    { name: "AST",       unit: "U/L"    },
    { name: "Bilirubin", unit: "µmol/L" },
    { name: "Albumin",   unit: "g/L"    },
  ]},
  { cat: "Cardiac", tests: [
    { name: "Troponin", unit: "ng/L"  },
    { name: "BNP",      unit: "pg/mL" },
  ]},
  { cat: "Other", tests: [
    { name: "HbA1c", unit: "%"    },
    { name: "CRP",   unit: "mg/L" },
    { name: "β-hCG", unit: "IU/L" },
  ]},
]

// All available unit options per test name
const UNIT_OPTIONS: Record<string, string[]> = {
  "Hb":         ["g/dL", "mmol/L"],
  "Hct":        ["%"],
  "WBC":        ["×10⁹/L", "×10³/µL"],
  "Platelets":  ["×10⁹/L", "×10³/µL"],
  "PT/INR":     ["INR", "s", "%"],
  "aPTT":       ["s"],
  "Fibrinogen": ["g/L", "mg/dL"],
  "Na⁺":        ["mmol/L", "mEq/L"],
  "K⁺":         ["mmol/L", "mEq/L"],
  "Creatinine": ["µmol/L", "mg/dL"],
  "Urea":       ["mmol/L", "mg/dL"],
  "Glucose":    ["mmol/L", "mg/dL"],
  "eGFR":       ["mL/min/1.73m²", "mL/min"],
  "ALT":        ["U/L", "IU/L"],
  "AST":        ["U/L", "IU/L"],
  "Bilirubin":  ["µmol/L", "mg/dL"],
  "Albumin":    ["g/L", "g/dL"],
  "Troponin":   ["ng/L", "ng/mL", "µg/L"],
  "BNP":        ["pg/mL", "ng/L"],
  "HbA1c":     ["%", "mmol/mol"],
  "CRP":        ["mg/L", "mg/dL"],
  "β-hCG":     ["IU/L", "mIU/mL"],
}

// Fallback units shown for custom tests
const COMMON_UNITS = ["g/dL", "g/L", "mg/L", "mg/dL", "µg/L", "mmol/L", "µmol/L", "U/L", "IU/L", "%", "s"]

function UnitPicker({ test, value, onChange }: { test: string; value: string; onChange: (u: string) => void }) {
  const options = UNIT_OPTIONS[test] ?? COMMON_UNITS
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(u => (
        <button
          key={u}
          type="button"
          onClick={() => onChange(u)}
          className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
            value === u
              ? "bg-blue-500 border-blue-500 text-white font-medium"
              : "border-slate-200 dark:border-[#3a3a3a] text-slate-400 dark:text-slate-500 hover:border-blue-300 hover:text-blue-500"
          }`}
        >
          {u}
        </button>
      ))}
    </div>
  )
}

export function LabResults({
  value = [],
  onChange,
}: {
  value?: LabResult[]
  onChange: (v: LabResult[]) => void
}) {
  const [customName, setCustomName] = useState("")

  function addTest(name: string, unit: string) {
    if (value.some(r => r.test === name)) return
    onChange([...value, { test: name, value: "", unit }])
  }

  function addCustom() {
    const name = customName.trim()
    if (!name || value.some(r => r.test === name)) return
    onChange([...value, { test: name, value: "", unit: "" }])
    setCustomName("")
  }

  function update(idx: number, field: keyof LabResult, val: string) {
    onChange(value.map((r, i) => i === idx ? { ...r, [field]: val } : r))
  }

  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-4">
      {/* Results table */}
      {value.length > 0 && (
        <div className="rounded-lg border border-slate-200 dark:border-[#2e2e2e] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-[#1a1a1a] text-xs text-slate-500 uppercase tracking-wide">
                <th className="text-left px-3 py-2.5 font-medium w-[28%]">Test</th>
                <th className="text-left px-3 py-2.5 font-medium w-[18%]">Value</th>
                <th className="text-left px-3 py-2.5 font-medium">Unit</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2a2a2a]">
              {value.map((row, idx) => (
                <tr key={idx} className="group align-middle">
                  <td className="px-3 py-2">
                    <span className="font-medium text-slate-700 dark:text-slate-300 text-sm">{row.test}</span>
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={row.value}
                      onChange={e => update(idx, "value", e.target.value)}
                      className="h-7 text-sm px-2 w-full"
                      placeholder="—"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <UnitPicker
                      test={row.test}
                      value={row.unit}
                      onChange={u => update(idx, "unit", u)}
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => remove(idx)}
                      className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Quick-add presets */}
      <div className="space-y-2">
        {PRESETS.map(cat => (
          <div key={cat.cat} className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 w-20 shrink-0">
              {cat.cat}
            </span>
            {cat.tests.map(t => {
              const added = value.some(r => r.test === t.name)
              return (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => addTest(t.name, t.unit)}
                  disabled={added}
                  className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                    added
                      ? "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-500 dark:text-blue-400 cursor-default"
                      : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-blue-300 hover:text-blue-600 dark:hover:border-blue-700 dark:hover:text-blue-400"
                  }`}
                >
                  {t.name}
                </button>
              )
            })}
          </div>
        ))}

        {/* Custom test */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 w-20 shrink-0">
            Custom
          </span>
          <div className="flex items-center gap-1.5">
            <Input
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom() } }}
              placeholder="Test name…"
              className="h-7 text-sm w-36"
            />
            <button
              type="button"
              onClick={addCustom}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-slate-200 dark:border-[#3a3a3a] text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
