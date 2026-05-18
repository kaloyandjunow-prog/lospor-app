export type BodySystem =
  | "Cardiovascular"
  | "Respiratory"
  | "Neurological / Psychiatric"
  | "Endocrine / Metabolic"
  | "Gastrointestinal / Hepatic"
  | "Renal / Urological"
  | "Haematological"
  | "Musculoskeletal"
  | "Neoplasms"
  | "Infectious diseases"
  | "Ophthalmological / ENT"
  | "Obstetric"
  | "Congenital"
  | "Other"

export const SYSTEM_COLORS: Record<BodySystem, string> = {
  "Cardiovascular":             "bg-red-100 text-red-800 border-red-200",
  "Respiratory":                "bg-sky-100 text-sky-800 border-sky-200",
  "Neurological / Psychiatric": "bg-purple-100 text-purple-800 border-purple-200",
  "Endocrine / Metabolic":      "bg-yellow-100 text-yellow-800 border-yellow-200",
  "Gastrointestinal / Hepatic": "bg-orange-100 text-orange-800 border-orange-200",
  "Renal / Urological":         "bg-teal-100 text-teal-800 border-teal-200",
  "Haematological":             "bg-rose-100 text-rose-800 border-rose-200",
  "Musculoskeletal":            "bg-lime-100 text-lime-800 border-lime-200",
  "Neoplasms":                  "bg-pink-100 text-pink-800 border-pink-200",
  "Infectious diseases":        "bg-amber-100 text-amber-800 border-amber-200",
  "Ophthalmological / ENT":     "bg-cyan-100 text-cyan-800 border-cyan-200",
  "Obstetric":                  "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200",
  "Congenital":                 "bg-indigo-100 text-indigo-800 border-indigo-200",
  "Other":                      "bg-slate-100 text-slate-700 border-slate-200",
}

export const SYSTEM_ORDER: BodySystem[] = [
  "Cardiovascular", "Respiratory", "Neurological / Psychiatric",
  "Endocrine / Metabolic", "Gastrointestinal / Hepatic", "Renal / Urological",
  "Haematological", "Musculoskeletal", "Neoplasms", "Infectious diseases",
  "Ophthalmological / ENT", "Obstetric", "Congenital", "Other",
]

export function getBodySystem(code: string): BodySystem {
  if (!code) return "Other"
  const prefix = code.charAt(0).toUpperCase()
  const num    = parseInt(code.substring(1, 3), 10) || 0

  if (prefix === "I") return "Cardiovascular"
  if (prefix === "J") return "Respiratory"
  if (prefix === "G" || prefix === "F") return "Neurological / Psychiatric"
  if (prefix === "E") return "Endocrine / Metabolic"
  if (prefix === "K") return "Gastrointestinal / Hepatic"
  if (prefix === "N") return "Renal / Urological"
  if (prefix === "D") return (num >= 50 && num <= 89) ? "Haematological" : "Neoplasms"
  if (prefix === "C") return "Neoplasms"
  if (prefix === "M") return "Musculoskeletal"
  if (prefix === "A" || prefix === "B") return "Infectious diseases"
  if (prefix === "H") return "Ophthalmological / ENT"
  if (prefix === "O") return "Obstetric"
  if (prefix === "Q") return "Congenital"
  return "Other"
}

// ── ASA suggestion from ICD-10 tags ──────────────────────────────────────────
// Each entry: [code_prefix, min_chars_to_match, asa_class, label]
const ASA_RULES: [string, number, number, string][] = [
  // ASA IV
  ["N18.6", 5, 4, "End-stage renal disease (not on dialysis)"],
  ["N18.5", 5, 4, "Chronic kidney disease stage 5"],
  ["I50.2", 5, 4, "Systolic heart failure"],
  ["I50.3", 5, 4, "Diastolic heart failure"],

  // ASA III
  ["I50",  3, 3, "Heart failure"],
  ["I21",  3, 3, "Acute myocardial infarction"],
  ["I25",  3, 3, "Chronic ischaemic heart disease"],
  ["I63",  3, 3, "Cerebral infarction (stroke)"],
  ["I64",  3, 3, "Stroke / CVA"],
  ["G45",  3, 3, "TIA"],
  ["Z95.0",5, 3, "Pacemaker / ICD"],
  ["Z95.1",5, 3, "Implanted cardiac device"],
  ["J44",  3, 3, "COPD"],
  ["J45.5",5, 3, "Severe persistent asthma"],
  ["E10",  3, 3, "Type 1 diabetes mellitus"],
  ["K70.3",5, 3, "Alcoholic liver cirrhosis"],
  ["K74",  3, 3, "Cirrhosis of liver"],
  ["N18",  3, 3, "Chronic kidney disease"],
  ["Z99.2",5, 3, "Dialysis"],
  ["E66.9",5, 3, "Morbid obesity"],
  ["G20",  3, 3, "Parkinson's disease"],
  ["F10.2",5, 3, "Alcohol dependence"],
  ["F19.2",5, 3, "Substance dependence"],
  ["Z86.7",5, 3, "History of MI/stroke > 3 months"],

  // ASA II
  ["I10",  3, 2, "Hypertension"],
  ["I11",  3, 2, "Hypertensive heart disease"],
  ["I48",  3, 2, "Atrial fibrillation"],
  ["I49",  3, 2, "Arrhythmia"],
  ["I73",  3, 2, "Peripheral vascular disease"],
  ["I83",  3, 2, "Varicose veins / CVI"],
  ["I82",  3, 2, "DVT history"],
  ["J45",  3, 2, "Asthma"],
  ["J44",  3, 2, "COPD (mild)"],
  ["E11",  3, 2, "Type 2 diabetes mellitus"],
  ["E03",  3, 2, "Hypothyroidism"],
  ["E05",  3, 2, "Hyperthyroidism"],
  ["E04",  3, 2, "Thyroid disease"],
  ["G40",  3, 2, "Epilepsy"],
  ["G43",  3, 2, "Migraine"],
  ["F32",  3, 2, "Depressive episode"],
  ["F33",  3, 2, "Recurrent depression"],
  ["F41",  3, 2, "Anxiety disorder"],
  ["K29",  3, 2, "Gastritis / peptic ulcer"],
  ["K57",  3, 2, "Diverticular disease"],
  ["K21",  3, 2, "GERD"],
  ["K73",  3, 2, "Chronic hepatitis"],
  ["K74",  3, 2, "Liver fibrosis"],
  ["N03",  3, 2, "Chronic glomerulonephritis"],
  ["N11",  3, 2, "Chronic pyelonephritis"],
  ["D50",  3, 2, "Anaemia (iron deficiency)"],
  ["D51",  3, 2, "Vitamin B12 deficiency anaemia"],
  ["D64",  3, 2, "Anaemia"],
  ["M05",  3, 2, "Rheumatoid arthritis"],
  ["M06",  3, 2, "Rheumatoid arthritis"],
  ["M81",  3, 2, "Osteoporosis"],
  ["Z87.3",5, 2, "History of musculoskeletal disease"],
  ["F17.2",5, 2, "Nicotine dependence (smoker)"],
]

export type ASASuggestion = { cls: "I" | "II" | "III" | "IV"; reasons: string[] }

export function suggestASAFromTags(
  tags: { label: string; sub?: string }[],
  bmi: number | null
): ASASuggestion | null {
  if (tags.length === 0 && !bmi) return null

  const reasons4: string[] = []
  const reasons3: string[] = []
  const reasons2: string[] = []

  for (const tag of tags) {
    const code = (tag.sub ?? "").toUpperCase()
    for (const [prefix, minLen, asaClass, label] of ASA_RULES) {
      if (code.startsWith(prefix.toUpperCase()) && code.length >= minLen) {
        if (asaClass === 4) reasons4.push(label)
        else if (asaClass === 3) { if (!reasons3.includes(label)) reasons3.push(label) }
        else if (asaClass === 2) { if (!reasons2.includes(label)) reasons2.push(label) }
        break
      }
    }
  }

  // BMI-based
  if (bmi && bmi >= 40) reasons3.push(`Morbid obesity (BMI ${bmi})`)
  else if (bmi && bmi >= 30) reasons2.push(`Obesity (BMI ${bmi})`)

  if (reasons4.length > 0) return { cls: "IV", reasons: reasons4 }
  if (reasons3.length > 0) return { cls: "III", reasons: reasons3.slice(0, 4) }
  if (reasons2.length > 0) return { cls: "II",  reasons: reasons2.slice(0, 4) }
  if (tags.length > 0)     return { cls: "II",  reasons: ["Comorbidities present"] }
  return { cls: "I", reasons: [] }
}
