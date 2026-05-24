"use client"

import { useRef, useState } from "react"
import { X, Plus, ScanLine, Camera, Loader2, ChevronDown, ChevronUp } from "lucide-react"
import { Input } from "@/components/ui/input"

export type LabResult = { test: string; value: string; unit: string }

// ─── Catalogue ────────────────────────────────────────────────────────────────

const PRESETS: { cat: string; tests: { name: string; unit: string }[] }[] = [
  { cat: "Haematology", tests: [
    { name: "Hb",           unit: "g/dL"    },
    { name: "Hct",          unit: "%"       },
    { name: "RBC",          unit: "×10¹²/L" },
    { name: "WBC",          unit: "×10⁹/L" },
    { name: "Neutrophils",  unit: "×10⁹/L" },
    { name: "Lymphocytes",  unit: "×10⁹/L" },
    { name: "Monocytes",    unit: "×10⁹/L" },
    { name: "Eosinophils",  unit: "×10⁹/L" },
    { name: "Basophils",    unit: "×10⁹/L" },
    { name: "Platelets",    unit: "×10⁹/L" },
    { name: "MCV",          unit: "fL"      },
    { name: "MCH",          unit: "pg"      },
    { name: "MCHC",         unit: "g/dL"   },
    { name: "RDW",          unit: "%"       },
    { name: "Reticulocytes",unit: "%"       },
  ]},
  { cat: "Coagulation", tests: [
    { name: "PT/INR",       unit: "INR"    },
    { name: "PT",           unit: "s"      },
    { name: "aPTT",         unit: "s"      },
    { name: "Fibrinogen",   unit: "g/L"    },
    { name: "D-dimer",      unit: "µg/mL"  },
    { name: "Thrombin time",unit: "s"      },
    { name: "Anti-Xa",      unit: "IU/mL"  },
  ]},
  { cat: "Electrolytes", tests: [
    { name: "Na⁺",          unit: "mmol/L" },
    { name: "K⁺",           unit: "mmol/L" },
    { name: "Cl⁻",          unit: "mmol/L" },
    { name: "HCO₃⁻",        unit: "mmol/L" },
    { name: "Ca²⁺ (total)", unit: "mmol/L" },
    { name: "Ca²⁺ (ionised)",unit: "mmol/L"},
    { name: "Mg²⁺",         unit: "mmol/L" },
    { name: "Phosphate",    unit: "mmol/L" },
  ]},
  { cat: "Biochemistry", tests: [
    { name: "Creatinine",   unit: "µmol/L"        },
    { name: "Urea",         unit: "mmol/L"         },
    { name: "eGFR",         unit: "mL/min/1.73m²"  },
    { name: "Glucose",      unit: "mmol/L"         },
    { name: "HbA1c",        unit: "%"              },
    { name: "Uric acid",    unit: "µmol/L"         },
    { name: "Lactate",      unit: "mmol/L"         },
    { name: "Osmolality",   unit: "mOsm/kg"        },
    { name: "Total protein",unit: "g/L"            },
    { name: "Albumin",      unit: "g/L"            },
    { name: "Amylase",      unit: "U/L"            },
    { name: "Lipase",       unit: "U/L"            },
  ]},
  { cat: "Liver", tests: [
    { name: "ALT",              unit: "U/L"    },
    { name: "AST",              unit: "U/L"    },
    { name: "ALP",              unit: "U/L"    },
    { name: "GGT",              unit: "U/L"    },
    { name: "Bilirubin (total)",unit: "µmol/L" },
    { name: "Bilirubin (direct)",unit:"µmol/L" },
    { name: "LDH",              unit: "U/L"    },
  ]},
  { cat: "Cardiac", tests: [
    { name: "Troponin I",   unit: "ng/L"    },
    { name: "Troponin T",   unit: "ng/L"    },
    { name: "hsTroponin",   unit: "ng/L"    },
    { name: "CK",           unit: "U/L"     },
    { name: "CK-MB",        unit: "U/L"     },
    { name: "BNP",          unit: "pg/mL"   },
    { name: "NT-proBNP",    unit: "pg/mL"   },
    { name: "Myoglobin",    unit: "µg/L"    },
  ]},
  { cat: "Blood Gas", tests: [
    { name: "pH",           unit: ""        },
    { name: "PaO₂",         unit: "kPa"    },
    { name: "PaCO₂",        unit: "kPa"    },
    { name: "HCO₃⁻ (ABG)", unit: "mmol/L" },
    { name: "BE",           unit: "mmol/L" },
    { name: "SaO₂",         unit: "%"      },
    { name: "Lactate (ABG)",unit: "mmol/L" },
    { name: "FiO₂",         unit: "%"      },
  ]},
  { cat: "Thyroid", tests: [
    { name: "TSH",          unit: "mIU/L"  },
    { name: "Free T4",      unit: "pmol/L" },
    { name: "Free T3",      unit: "pmol/L" },
    { name: "Total T4",     unit: "nmol/L" },
  ]},
  { cat: "Other", tests: [
    { name: "CRP",          unit: "mg/L"   },
    { name: "ESR",          unit: "mm/h"   },
    { name: "Ferritin",     unit: "µg/L"   },
    { name: "Procalcitonin",unit: "µg/L"   },
    { name: "β-hCG",        unit: "IU/L"   },
    { name: "PSA",          unit: "µg/L"   },
    { name: "Vitamin B12",  unit: "pmol/L" },
    { name: "Folate",       unit: "nmol/L" },
  ]},
]

// ─── Reference ranges — keyed by test name, one entry per unit ───────────────
// Lookup: find the entry matching the user's selected unit.
// If no unit matches → no badge (Option A fallback, avoids false positives).

type RefRange = { lo: number; hi: number; unit: string }

const REF: Record<string, RefRange[]> = {
  // Haematology
  "Hb":             [{ lo: 12.0, hi: 17.5, unit: "g/dL"    }, { lo: 120,  hi: 175,   unit: "g/L"      }, { lo: 7.5,  hi: 10.9,  unit: "mmol/L"   }],
  "Hct":            [{ lo: 36,   hi: 52,   unit: "%"        }],
  "RBC":            [{ lo: 4.0,  hi: 6.0,  unit: "×10¹²/L" }],
  "WBC":            [{ lo: 4.0,  hi: 11.0, unit: "×10⁹/L"  }, { lo: 4.0,  hi: 11.0,  unit: "×10³/µL" }],
  "Neutrophils":    [{ lo: 1.8,  hi: 7.5,  unit: "×10⁹/L"  }],
  "Lymphocytes":    [{ lo: 1.0,  hi: 4.0,  unit: "×10⁹/L"  }],
  "Monocytes":      [{ lo: 0.2,  hi: 1.0,  unit: "×10⁹/L"  }],
  "Eosinophils":    [{ lo: 0.0,  hi: 0.5,  unit: "×10⁹/L"  }],
  "Basophils":      [{ lo: 0.0,  hi: 0.1,  unit: "×10⁹/L"  }],
  "Platelets":      [{ lo: 150,  hi: 400,  unit: "×10⁹/L"  }, { lo: 150,  hi: 400,   unit: "×10³/µL" }],
  "MCV":            [{ lo: 80,   hi: 100,  unit: "fL"       }],
  "MCH":            [{ lo: 27,   hi: 33,   unit: "pg"       }],
  "MCHC":           [{ lo: 32,   hi: 36,   unit: "g/dL"     }],
  "RDW":            [{ lo: 11.5, hi: 14.5, unit: "%"        }],
  "Reticulocytes":  [{ lo: 0.5,  hi: 2.5,  unit: "%"        }],
  // Coagulation
  "PT/INR":         [{ lo: 0.8,  hi: 1.2,  unit: "INR"      }],
  "PT":             [{ lo: 10,   hi: 13,   unit: "s"         }],
  "aPTT":           [{ lo: 25,   hi: 38,   unit: "s"         }],
  "Fibrinogen":     [{ lo: 2.0,  hi: 4.0,  unit: "g/L"      }, { lo: 200,  hi: 400,   unit: "mg/dL"   }],
  "D-dimer":        [{ lo: 0,    hi: 0.5,  unit: "µg/mL"    }],
  "Thrombin time":  [{ lo: 10,   hi: 15,   unit: "s"         }],
  // Electrolytes
  "Na⁺":            [{ lo: 136,  hi: 145,  unit: "mmol/L"   }, { lo: 136,  hi: 145,   unit: "mEq/L"   }],
  "K⁺":             [{ lo: 3.5,  hi: 5.0,  unit: "mmol/L"   }, { lo: 3.5,  hi: 5.0,   unit: "mEq/L"   }],
  "Cl⁻":            [{ lo: 98,   hi: 106,  unit: "mmol/L"   }, { lo: 98,   hi: 106,   unit: "mEq/L"   }],
  "HCO₃⁻":         [{ lo: 22,   hi: 29,   unit: "mmol/L"   }],
  "Ca²⁺ (total)":  [{ lo: 2.15, hi: 2.55, unit: "mmol/L"   }, { lo: 8.6,  hi: 10.2,  unit: "mg/dL"   }],
  "Ca²⁺ (ionised)":[{ lo: 1.15, hi: 1.35, unit: "mmol/L"   }, { lo: 4.6,  hi: 5.4,   unit: "mg/dL"   }],
  "Mg²⁺":          [{ lo: 0.7,  hi: 1.05, unit: "mmol/L"   }, { lo: 1.7,  hi: 2.55,  unit: "mg/dL"   }],
  "Phosphate":      [{ lo: 0.8,  hi: 1.5,  unit: "mmol/L"   }, { lo: 2.5,  hi: 4.5,   unit: "mg/dL"   }],
  // Biochemistry
  "Creatinine":     [{ lo: 60,   hi: 110,  unit: "µmol/L"   }, { lo: 0.7,  hi: 1.2,   unit: "mg/dL"   }],
  "Urea":           [{ lo: 2.5,  hi: 7.8,  unit: "mmol/L"   }, { lo: 15,   hi: 45,    unit: "mg/dL"   }],
  "eGFR":           [{ lo: 60,   hi: 999,  unit: "mL/min/1.73m²" }, { lo: 60, hi: 999, unit: "mL/min" }],
  "Glucose":        [{ lo: 4.0,  hi: 6.0,  unit: "mmol/L"   }, { lo: 72,   hi: 108,   unit: "mg/dL"   }],
  "HbA1c":          [{ lo: 0,    hi: 6.5,  unit: "%"         }, { lo: 0,    hi: 48,    unit: "mmol/mol"}],
  "Uric acid":      [{ lo: 200,  hi: 430,  unit: "µmol/L"   }, { lo: 3.4,  hi: 7.2,   unit: "mg/dL"   }],
  "Lactate":        [{ lo: 0.5,  hi: 2.0,  unit: "mmol/L"   }],
  "Osmolality":     [{ lo: 275,  hi: 295,  unit: "mOsm/kg"  }],
  "Total protein":  [{ lo: 60,   hi: 83,   unit: "g/L"      }, { lo: 6.0,  hi: 8.3,   unit: "g/dL"    }],
  "Albumin":        [{ lo: 35,   hi: 52,   unit: "g/L"      }, { lo: 3.5,  hi: 5.2,   unit: "g/dL"    }],
  "Amylase":        [{ lo: 28,   hi: 100,  unit: "U/L"      }],
  "Lipase":         [{ lo: 13,   hi: 60,   unit: "U/L"      }],
  // Liver
  "ALT":            [{ lo: 7,    hi: 56,   unit: "U/L"      }, { lo: 7,    hi: 56,    unit: "IU/L"    }],
  "AST":            [{ lo: 10,   hi: 40,   unit: "U/L"      }, { lo: 10,   hi: 40,    unit: "IU/L"    }],
  "ALP":            [{ lo: 44,   hi: 147,  unit: "U/L"      }, { lo: 44,   hi: 147,   unit: "IU/L"    }],
  "GGT":            [{ lo: 8,    hi: 61,   unit: "U/L"      }, { lo: 8,    hi: 61,    unit: "IU/L"    }],
  "Bilirubin (total)": [{ lo: 5, hi: 21,  unit: "µmol/L"   }, { lo: 0.3,  hi: 1.2,   unit: "mg/dL"   }],
  "Bilirubin (direct)":[{ lo: 0, hi: 5,   unit: "µmol/L"   }, { lo: 0,    hi: 0.3,   unit: "mg/dL"   }],
  "LDH":            [{ lo: 140,  hi: 280,  unit: "U/L"      }],
  // Cardiac
  "CK":             [{ lo: 24,   hi: 195,  unit: "U/L"      }],
  "CK-MB":          [{ lo: 0,    hi: 25,   unit: "U/L"      }],
  "BNP":            [{ lo: 0,    hi: 100,  unit: "pg/mL"    }, { lo: 0,    hi: 100,   unit: "ng/L"    }],
  "NT-proBNP":      [{ lo: 0,    hi: 125,  unit: "pg/mL"    }, { lo: 0,    hi: 125,   unit: "ng/L"    }],
  "Myoglobin":      [{ lo: 0,    hi: 90,   unit: "µg/L"     }],
  // Blood Gas
  "pH":             [{ lo: 7.35, hi: 7.45, unit: ""         }],
  "PaO₂":           [{ lo: 10.0, hi: 13.3, unit: "kPa"     }, { lo: 75,   hi: 100,   unit: "mmHg"    }],
  "PaCO₂":          [{ lo: 4.7,  hi: 6.0,  unit: "kPa"     }, { lo: 35,   hi: 45,    unit: "mmHg"    }],
  "HCO₃⁻ (ABG)":   [{ lo: 22,   hi: 28,   unit: "mmol/L"  }],
  "BE":             [{ lo: -2,   hi: 2,    unit: "mmol/L"  }],
  "SaO₂":           [{ lo: 95,   hi: 100,  unit: "%"        }],
  "Lactate (ABG)":  [{ lo: 0.5,  hi: 2.0,  unit: "mmol/L"  }],
  // Thyroid
  "TSH":            [{ lo: 0.4,  hi: 4.0,  unit: "mIU/L"   }, { lo: 0.4,  hi: 4.0,   unit: "µIU/mL" }],
  "Free T4":        [{ lo: 12,   hi: 22,   unit: "pmol/L"  }, { lo: 0.9,  hi: 1.7,   unit: "ng/dL"   }],
  "Free T3":        [{ lo: 3.1,  hi: 6.8,  unit: "pmol/L"  }, { lo: 2.0,  hi: 4.4,   unit: "pg/mL"   }],
  "Total T4":       [{ lo: 58,   hi: 161,  unit: "nmol/L"  }, { lo: 4.5,  hi: 12.5,  unit: "µg/dL"   }],
  // Other
  "CRP":            [{ lo: 0,    hi: 5,    unit: "mg/L"    }, { lo: 0,    hi: 0.5,   unit: "mg/dL"   }],
  "ESR":            [{ lo: 0,    hi: 20,   unit: "mm/h"    }],
  "Ferritin":       [{ lo: 15,   hi: 300,  unit: "µg/L"    }, { lo: 15,   hi: 300,   unit: "ng/mL"   }],
  "Procalcitonin":  [{ lo: 0,    hi: 0.5,  unit: "µg/L"    }, { lo: 0,    hi: 0.5,   unit: "ng/mL"   }],
  "PSA":            [{ lo: 0,    hi: 4.0,  unit: "µg/L"    }, { lo: 0,    hi: 4.0,   unit: "ng/mL"   }],
  "Vitamin B12":    [{ lo: 148,  hi: 738,  unit: "pmol/L"  }, { lo: 200,  hi: 1000,  unit: "pg/mL"   }],
  "Folate":         [{ lo: 7,    hi: 45,   unit: "nmol/L"  }, { lo: 3.1,  hi: 20,    unit: "ng/mL"   }],
}

// ─── Unit options ─────────────────────────────────────────────────────────────

const UNIT_OPTIONS: Record<string, string[]> = {
  "Hb":             ["g/dL", "g/L", "mmol/L"],
  "Hct":            ["%"],
  "WBC":            ["×10⁹/L", "×10³/µL"],
  "Platelets":      ["×10⁹/L", "×10³/µL"],
  "PT/INR":         ["INR", "s", "%"],
  "aPTT":           ["s"],
  "Fibrinogen":     ["g/L", "mg/dL"],
  "Na⁺":            ["mmol/L", "mEq/L"],
  "K⁺":             ["mmol/L", "mEq/L"],
  "Creatinine":     ["µmol/L", "mg/dL"],
  "Urea":           ["mmol/L", "mg/dL"],
  "Glucose":        ["mmol/L", "mg/dL"],
  "eGFR":           ["mL/min/1.73m²", "mL/min"],
  "ALT":            ["U/L", "IU/L"],
  "AST":            ["U/L", "IU/L"],
  "ALP":            ["U/L", "IU/L"],
  "GGT":            ["U/L", "IU/L"],
  "Bilirubin (total)":  ["µmol/L", "mg/dL"],
  "Bilirubin (direct)": ["µmol/L", "mg/dL"],
  "Albumin":        ["g/L", "g/dL"],
  "Troponin I":     ["ng/L", "ng/mL", "µg/L"],
  "Troponin T":     ["ng/L", "ng/mL", "µg/L"],
  "hsTroponin":     ["ng/L", "ng/mL"],
  "BNP":            ["pg/mL", "ng/L"],
  "NT-proBNP":      ["pg/mL", "ng/L"],
  "HbA1c":          ["%", "mmol/mol"],
  "CRP":            ["mg/L", "mg/dL"],
  "β-hCG":          ["IU/L", "mIU/mL"],
  "TSH":            ["mIU/L", "µIU/mL"],
}

const COMMON_UNITS = ["g/dL", "g/L", "mg/L", "mg/dL", "µg/L", "mmol/L", "µmol/L", "U/L", "IU/L", "%", "s", "kPa", "mmHg", "pg/mL"]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findRef(test: string, unit: string): RefRange | null {
  return REF[test]?.find(r => r.unit === unit) ?? null
}

function refFlag(test: string, val: string, unit: string): "low" | "high" | "normal" | null {
  const ref = findRef(test, unit)
  if (!ref) return null
  const n = parseFloat(val.replace(",", "."))
  if (isNaN(n)) return null
  if (n < ref.lo) return "low"
  if (n > ref.hi) return "high"
  return "normal"
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip data URL prefix to get bare base64
      resolve(result.split(",")[1] ?? "")
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function RefBadge({ flag, ref }: { flag: "low" | "high" | "normal"; ref: RefRange }) {
  const rangeStr = `${ref.lo}–${ref.hi}`
  if (flag === "normal") {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 whitespace-nowrap">
        {rangeStr}
      </span>
    )
  }
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 font-semibold whitespace-nowrap">
      {flag === "low" ? "▼" : "▲"} {rangeStr}
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LabResults({
  value = [],
  onChange,
}: {
  value?: LabResult[]
  onChange: (v: LabResult[]) => void
}) {
  const [customName, setCustomName] = useState("")
  const [search, setSearch]         = useState("")
  const [aiLoading, setAiLoading]   = useState(false)
  const [aiPreview, setAiPreview]   = useState<LabResult[] | null>(null)
  const [aiSelected, setAiSelected] = useState<Set<number>>(new Set())
  const [aiError, setAiError]       = useState<string | null>(null)
  const [presetsOpen, setPresetsOpen] = useState(false)
  const fileInputRef   = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  // Filtered preset catalogue
  const q = search.trim().toLowerCase()
  const filtered = q
    ? PRESETS.map(cat => ({ ...cat, tests: cat.tests.filter(t => t.name.toLowerCase().includes(q)) }))
        .filter(cat => cat.tests.length > 0)
    : PRESETS

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

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    setAiLoading(true)
    setAiPreview(null)
    setAiError(null)
    try {
      const imageBase64 = await toBase64(file)
      const res = await fetch("/api/ai/read-labs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, mimeType: file.type }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setAiError(data.error ?? "Scan failed")
      } else if (!data.results?.length) {
        setAiError("No results found in the image")
      } else {
        setAiPreview(data.results)
        setAiSelected(new Set(data.results.map((_: any, i: number) => i)))
      }
    } catch {
      setAiError("Network error — please try again")
    } finally {
      setAiLoading(false)
    }
  }

  function confirmAiPreview() {
    if (!aiPreview) return
    const toAdd = aiPreview
      .filter((_, i) => aiSelected.has(i))
      .filter(r => !value.some(existing => existing.test.toLowerCase() === r.test.toLowerCase()))
    onChange([...value, ...toAdd])
    setAiPreview(null)
    setAiSelected(new Set())
  }

  function toggleAiRow(idx: number) {
    setAiSelected(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  return (
    <div className="space-y-4">
      {/* AI scan button */}
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-1.5">
            Lab report images are sent to Mistral AI (EU) for text extraction. Before uploading, crop out all patient names, date of birth, ID or MRN numbers, and any other identifying information. Do not upload the image if patient identifiers cannot be removed.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => { setAiError(null); fileInputRef.current?.click() }}
              disabled={aiLoading}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-400 hover:border-blue-300 hover:text-blue-600 dark:hover:border-blue-700 dark:hover:text-blue-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {aiLoading
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Scanning…</>
                : <><ScanLine className="h-3.5 w-3.5" /> Scan lab report</>
              }
            </button>
            <button
              type="button"
              onClick={() => { setAiError(null); cameraInputRef.current?.click() }}
              disabled={aiLoading}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-400 hover:border-blue-300 hover:text-blue-600 dark:hover:border-blue-700 dark:hover:text-blue-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Camera className="h-3.5 w-3.5" /> Take a picture
            </button>
          </div>
          {aiError && <p className="text-[11px] text-red-500 mt-1">{aiError}</p>}
        </div>
        {/* Gallery picker */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileSelect}
        />
        {/* Camera capture — opens rear camera directly on mobile */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* AI preview panel */}
      {aiPreview && (
        <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 overflow-hidden">
          <div className="px-3 py-2 border-b border-blue-200 dark:border-blue-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">
              {aiPreview.length} result{aiPreview.length !== 1 ? "s" : ""} found — select to add
            </span>
            <button type="button" onClick={() => setAiPreview(null)} className="text-slate-400 hover:text-slate-600">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="max-h-52 overflow-y-auto">
            <table className="w-full text-xs">
              <tbody className="divide-y divide-blue-100 dark:divide-blue-900">
                {aiPreview.map((r, i) => {
                  const alreadyAdded = value.some(existing => existing.test.toLowerCase() === r.test.toLowerCase())
                  return (
                    <tr key={i} className={`${alreadyAdded ? "opacity-40" : ""}`}>
                      <td className="px-3 py-1.5 w-6">
                        <input
                          type="checkbox"
                          checked={aiSelected.has(i) && !alreadyAdded}
                          disabled={alreadyAdded}
                          onChange={() => !alreadyAdded && toggleAiRow(i)}
                          className="rounded"
                        />
                      </td>
                      <td className="py-1.5 font-medium text-slate-700 dark:text-slate-300">
                        {r.test} {alreadyAdded && <span className="text-[10px] text-slate-400">(already added)</span>}
                      </td>
                      <td className="py-1.5 px-2 text-slate-600 dark:text-slate-400">{r.value}</td>
                      <td className="py-1.5 pr-3 text-slate-400">{r.unit}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t border-blue-200 dark:border-blue-800 flex gap-2">
            <button
              type="button"
              onClick={confirmAiPreview}
              className="text-xs px-3 py-1 rounded-md bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors"
            >
              Add selected ({aiPreview.filter((_, i) => aiSelected.has(i) && !value.some(e => e.test.toLowerCase() === aiPreview[i].test.toLowerCase())).length})
            </button>
            <button
              type="button"
              onClick={() => setAiPreview(null)}
              className="text-xs px-3 py-1 rounded-md border border-slate-200 dark:border-[#3a3a3a] text-slate-500 hover:border-slate-300 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Results table */}
      {value.length > 0 && (
        <div className="rounded-lg border border-slate-200 dark:border-[#2e2e2e] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-[#1a1a1a] text-xs text-slate-500 uppercase tracking-wide">
                <th className="text-left px-3 py-2.5 font-medium w-[26%]">Test</th>
                <th className="text-left px-3 py-2.5 font-medium w-[14%]">Value</th>
                <th className="text-left px-3 py-2.5 font-medium w-[30%]">Unit</th>
                <th className="text-left px-3 py-2.5 font-medium">Ref range</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2a2a2a]">
              {value.map((row, idx) => {
                const ref  = findRef(row.test, row.unit)
                const flag = ref && row.value ? refFlag(row.test, row.value, row.unit) : null
                return (
                  <tr key={idx} className="group align-middle">
                    <td className="px-3 py-2">
                      <span className="font-medium text-slate-700 dark:text-slate-300 text-sm">{row.test}</span>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={row.value}
                        onChange={e => update(idx, "value", e.target.value)}
                        className={`h-7 text-sm px-2 w-full ${flag === "low" || flag === "high" ? "border-amber-300 dark:border-amber-700" : ""}`}
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
                    <td className="px-3 py-2">
                      {flag && ref && (
                        <RefBadge flag={flag} ref={ref} />
                      )}
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
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Manual entry — collapsible */}
      <div>
        <button
          type="button"
          onClick={() => setPresetsOpen(o => !o)}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          {presetsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          Add tests manually
        </button>

        {presetsOpen && (
          <div className="space-y-2 mt-3">
            {/* Search */}
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tests…"
              className="h-7 text-sm w-48 mb-1"
            />

            {filtered.map(cat => (
              <div key={cat.cat} className="flex items-start gap-2 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 w-20 shrink-0 pt-1">
                  {cat.cat}
                </span>
                <div className="flex flex-wrap gap-1">
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
              </div>
            ))}

            {/* No search results */}
            {q && filtered.length === 0 && (
              <p className="text-xs text-slate-400 pl-22">No matching tests — use Custom below</p>
            )}

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
        )}
      </div>
    </div>
  )
}
