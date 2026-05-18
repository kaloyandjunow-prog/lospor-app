/**
 * Run once: npx tsx scripts/process-data.ts
 * Converts ICD-10 CSV and drug Excel into fast-searchable JSON files.
 */
import "dotenv/config"
import fs from "fs"
import path from "path"
import * as XLSX from "xlsx"

const OUT_DIR = path.join(process.cwd(), "src", "data")
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

// ── ICD-10 ────────────────────────────────────────────────────────────────────
console.log("Processing ICD-10 CSV…")
const csvPath = "C:\\losardoc\\codes.csv"
const csvLines = fs.readFileSync(csvPath, "utf8").split("\n")

type ICD10Entry = { code: string; description: string }
const icd10: ICD10Entry[] = []

for (const line of csvLines) {
  if (!line.trim()) continue
  // Format: category,sub,full_code,"description","description2","category_name"
  // Parse CSV properly (descriptions are quoted)
  const parts: string[] = []
  let current = ""
  let inQuote = false
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue }
    if (ch === "," && !inQuote) { parts.push(current); current = ""; continue }
    current += ch
  }
  parts.push(current)

  const code = (parts[2] ?? "").trim()
  const description = (parts[4] ?? parts[3] ?? "").trim()  // column E preferred
  if (code && description) {
    icd10.push({ code, description })
  }
}

fs.writeFileSync(path.join(OUT_DIR, "icd10.json"), JSON.stringify(icd10))
console.log(`  ✓ ${icd10.length} ICD-10 entries → src/data/icd10.json`)

// ── Drugs ─────────────────────────────────────────────────────────────────────
console.log("Processing drug registry Excel…")
const xlsxPath = "C:\\losardoc\\IAL_Register_04_2026.xlsx"
const wb = XLSX.readFile(xlsxPath)
const ws = wb.Sheets[wb.SheetNames[0]]
const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as string[][]

type DrugEntry = { name: string; inn: string; form: string; strength: string; atc: string }
const drugsMap = new Map<string, DrugEntry>()

for (let i = 1; i < rows.length; i++) {
  const row = rows[i]
  const tradeName = String(row[2] ?? "").trim()
  const inn       = String(row[13] ?? "").trim()
  const formEn    = String(row[5] ?? "").trim()
  const strength  = String(row[6] ?? "").trim()
  const atc       = String(row[14] ?? "").trim()

  if (!tradeName && !inn) continue

  // Deduplicate by INN + strength key; keep trade name as display label
  const key = `${inn.toLowerCase()}__${strength.toLowerCase()}`
  if (!drugsMap.has(key)) {
    drugsMap.set(key, {
      name: tradeName || inn,
      inn,
      form: formEn,
      strength,
      atc,
    })
  }
}

const drugs = Array.from(drugsMap.values())
fs.writeFileSync(path.join(OUT_DIR, "drugs.json"), JSON.stringify(drugs))
console.log(`  ✓ ${drugs.length} unique drug entries → src/data/drugs.json`)

// ── ICD-10-PCS ────────────────────────────────────────────────────────────────
console.log("Processing ICD-10-PCS CSV…")
const pcsPath = "C:\\losardoc\\PRCCSR_v2025-1\\PRCCSR_v2025-1.csv"
const pcsLines = fs.readFileSync(pcsPath, "utf8").split("\n")

type PCSEntry = { code: string; description: string; group: string; domain: string }
// Deduplicate by PRCCSR group — keep one canonical entry per group for the
// human-readable "short" name, but also store all full codes for search.
const pcsMap = new Map<string, PCSEntry>()   // key = full ICD-10-PCS code

for (let i = 1; i < pcsLines.length; i++) {
  const line = pcsLines[i].trim()
  if (!line) continue

  // Format: 'CODE',"DESCRIPTION",'PRCCSR','PRCCSR DESCRIPTION',DOMAIN
  // Quoted with single quotes for codes, double quotes for descriptions
  const parts: string[] = []
  let cur = ""
  let inDouble = false
  for (const ch of line) {
    if (ch === '"') { inDouble = !inDouble; continue }
    if (ch === "," && !inDouble) { parts.push(cur.trim().replace(/^'|'$/g, "")); cur = ""; continue }
    cur += ch
  }
  parts.push(cur.trim().replace(/^'|'$/g, ""))

  const code   = parts[0]
  const desc   = parts[1]
  const group  = parts[3]   // e.g. "Cholecystectomy"
  const domain = parts[4]   // e.g. "Hepatobiliary and Pancreatic Procedures"

  if (code && desc) {
    pcsMap.set(code, { code, description: desc, group: group || desc, domain: domain || "" })
  }
}

const pcs = Array.from(pcsMap.values())
fs.writeFileSync(path.join(OUT_DIR, "pcs.json"), JSON.stringify(pcs))
console.log(`  ✓ ${pcs.length} ICD-10-PCS entries → src/data/pcs.json`)

console.log("Done.")
