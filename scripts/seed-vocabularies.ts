// Seed ICD-10, ICD-10CM synonyms, and ATC from Athena CSVs + BG Excel.
//
// Usage:
//   npx tsx scripts/seed-vocabularies.ts [--vocab-dir C:\losardoc\vocab]
//
// Expects these files in vocab-dir:
//   CONCEPT.csv            (from Athena download)
//   CONCEPT_SYNONYM.csv    (from Athena download)
//   CONCEPT_RELATIONSHIP.csv (from Athena download)
//   ICD10_*.xlsx           (official BG MZ ICD-10 labels, any filename matching)
//
// Idempotent: uses upsert for ICD-10 codes and ATC; truncate+insert for synonyms.
// Safe to re-run after vocabulary updates.

import "dotenv/config"
import fs from "fs"
import path from "path"
import readline from "readline"
import { PrismaClient, Prisma } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter } as any)
const VOCAB_DIR = process.argv.find(a => a.startsWith("--vocab-dir="))?.split("=")[1]
  ?? process.argv[process.argv.indexOf("--vocab-dir") + 1]
  ?? "C:\\losardoc\\vocab"

const BATCH = 500

// ── CSV streaming helpers ──────────────────────────────────────────────────────

function csvStream(file: string): readline.Interface {
  return readline.createInterface({ input: fs.createReadStream(file, "utf8"), crlfDelay: Infinity })
}

function parseLine(line: string): string[] {
  const cols: string[] = []
  let cur = ""
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { inQuote = !inQuote; continue }
    if (c === "\t" && !inQuote) { cols.push(cur); cur = ""; continue }
    cur += c
  }
  cols.push(cur)
  return cols
}

async function batchInsert<T>(rows: T[], fn: (batch: T[]) => Promise<void>) {
  for (let i = 0; i < rows.length; i += BATCH) {
    await fn(rows.slice(i, i + BATCH))
  }
}

// Bulk upsert via a single multi-row INSERT ... ON CONFLICT statement per batch,
// instead of one upsert() round trip per row (which is ruinously slow over a
// pooled connection with real network latency).
async function bulkUpsert(
  table: string,
  idColumn: string,
  columns: string[],
  rows: Record<string, unknown>[],
) {
  if (!rows.length) return
  const allCols = [idColumn, ...columns]
  const updateClause = columns.map(c => `"${c}" = excluded."${c}"`).join(", ")
  const values = Prisma.join(
    rows.map(r => Prisma.sql`(${Prisma.join(allCols.map(c => r[c] ?? null))})`),
  )
  const colList = allCols.map(c => `"${c}"`).join(", ")
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "${Prisma.raw(table)}" (${Prisma.raw(colList)})
    VALUES ${values}
    ON CONFLICT ("${Prisma.raw(idColumn)}") DO UPDATE SET ${Prisma.raw(updateClause)}
  `)
}

// ── Step 1: ATC from CONCEPT.csv ──────────────────────────────────────────────

async function seedAtc() {
  const file = path.join(VOCAB_DIR, "CONCEPT.csv")
  console.log("Seeding ATC from CONCEPT.csv...")
  const rl = csvStream(file)
  let headers: string[] = []
  let rows: { code: string; name: string; level: number; parentCode: string | null }[] = []
  let lineNo = 0
  let count = 0

  for await (const line of rl) {
    lineNo++
    if (lineNo === 1) { headers = parseLine(line); continue }
    const cols = parseLine(line)
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = cols[i] ?? "" })

    if (obj.vocabulary_id !== "ATC") continue
    if (obj.invalid_reason) continue

    const level = parseInt(obj.concept_class_id?.replace("ATC ", "") ?? "0", 10)
    if (!level || level < 1 || level > 5) continue

    rows.push({
      code:       obj.concept_code,
      name:       obj.concept_name,
      level,
      parentCode: null, // filled in step 2 via CONCEPT_RELATIONSHIP
    })

    if (rows.length >= BATCH * 10) {
      await batchInsert(rows, batch => bulkUpsert("Atc", "code", ["name", "level", "parentCode"], batch))
      count += rows.length
      rows = []
      process.stdout.write(`\r  ATC: ${count} codes...`)
    }
  }
  if (rows.length) {
    await batchInsert(rows, batch => bulkUpsert("Atc", "code", ["name", "level", "parentCode"], batch))
    count += rows.length
  }
  console.log(`\n  ATC done: ${count} codes.`)
}

// ── Step 2: ICD-10 codes from CONCEPT.csv ────────────────────────────────────

async function seedIcd10Concepts(): Promise<Map<string, string>> {
  const file = path.join(VOCAB_DIR, "CONCEPT.csv")
  console.log("Seeding ICD-10 codes from CONCEPT.csv...")
  const rl = csvStream(file)
  let headers: string[] = []
  const conceptIdToCode = new Map<string, string>()
  let rows: { code: string; labelEn: string }[] = []
  let lineNo = 0
  let count = 0

  for await (const line of rl) {
    lineNo++
    if (lineNo === 1) { headers = parseLine(line); continue }
    const cols = parseLine(line)
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = cols[i] ?? "" })

    if (obj.vocabulary_id !== "ICD10") continue
    if (obj.invalid_reason) continue

    conceptIdToCode.set(obj.concept_id, obj.concept_code)
    rows.push({ code: obj.concept_code, labelEn: obj.concept_name })

    if (rows.length >= BATCH * 10) {
      await batchInsert(rows, batch => bulkUpsert("Icd10Code", "code", ["labelEn"], batch))
      count += rows.length
      rows = []
      process.stdout.write(`\r  ICD-10: ${count} codes...`)
    }
  }
  if (rows.length) {
    await batchInsert(rows, batch => bulkUpsert("Icd10Code", "code", ["labelEn"], batch))
    count += rows.length
  }
  console.log(`\n  ICD-10 done: ${count} codes. Concept→code map: ${conceptIdToCode.size} entries.`)
  return conceptIdToCode
}

// ── Step 3: ICD-10CM→ICD-10 mappings + synonyms ──────────────────────────────

async function seedIcd10CmSynonyms(icd10ConceptIds: Map<string, string>) {
  // Build ICD-10CM concept_id → ICD-10 code via code-prefix matching.
  // Athena "Maps to" only points to SNOMED (standard), not cross-source-vocab.
  // ICD-10CM codes are extensions of ICD-10: e.g. J18.90 → J18.9, A00.01 → A00.0
  const icd10CodeSet = new Set(icd10ConceptIds.values())
  console.log("Building ICD-10CM→ICD-10 mapping by code-prefix from CONCEPT.csv...")
  const cm10Map = new Map<string, string>() // CM concept_id → ICD-10 code

  const rl1 = csvStream(path.join(VOCAB_DIR, "CONCEPT.csv"))
  let headers: string[] = []
  let lineNo = 0

  for await (const line of rl1) {
    lineNo++
    if (lineNo === 1) { headers = parseLine(line); continue }
    const cols = parseLine(line)
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = cols[i] ?? "" })

    if (obj.vocabulary_id !== "ICD10CM") continue
    if (obj.invalid_reason) continue

    const cmCode = obj.concept_code
    // Try progressively shorter prefixes until an ICD-10 code matches
    for (let len = cmCode.length; len >= 3; len--) {
      const prefix = cmCode.slice(0, len)
      if (icd10CodeSet.has(prefix)) {
        cm10Map.set(obj.concept_id, prefix)
        break
      }
    }
  }
  console.log(`  Mappings: ${cm10Map.size} ICD-10CM→ICD-10 pairs.`)

  // Second: read ICD-10CM concepts, get synonym terms via CONCEPT_SYNONYM.csv
  const synFile = path.join(VOCAB_DIR, "CONCEPT_SYNONYM.csv")
  console.log("Seeding ICD-10CM synonyms...")

  // Build set of ICD-10CM concept_ids that map to ICD-10
  const cm10ConceptSet = new Set(cm10Map.keys())

  // Also map ICD-10CM concept_id → concept_name from CONCEPT.csv
  const cm10Names = new Map<string, { id: string; name: string }>()
  {
    const rl2 = csvStream(path.join(VOCAB_DIR, "CONCEPT.csv"))
    let h2: string[] = []
    let ln2 = 0
    for await (const line of rl2) {
      ln2++
      if (ln2 === 1) { h2 = parseLine(line); continue }
      const cols = parseLine(line)
      const obj: Record<string, string> = {}
      h2.forEach((h, i) => { obj[h] = cols[i] ?? "" })
      if (obj.vocabulary_id !== "ICD10CM") continue
      if (!cm10ConceptSet.has(obj.concept_id)) continue
      cm10Names.set(obj.concept_id, { id: obj.concept_id, name: obj.concept_name })
    }
  }

  // Now stream synonyms
  await prisma.icd10Synonym.deleteMany()
  console.log("  Cleared existing synonyms.")

  const rl3 = csvStream(synFile)
  let synHeaders: string[] = []
  let synLineNo = 0
  let synBatch: { id: string; icd10Code: string; synonym: string }[] = []
  let synCount = 0

  const flush = async () => {
    if (!synBatch.length) return
    await prisma.icd10Synonym.createMany({ data: synBatch, skipDuplicates: true })
    synCount += synBatch.length
    synBatch = []
  }

  for await (const line of rl3) {
    synLineNo++
    if (synLineNo === 1) { synHeaders = parseLine(line); continue }
    const cols = parseLine(line)
    const obj: Record<string, string> = {}
    synHeaders.forEach((h, i) => { obj[h] = cols[i] ?? "" })

    const icd10Code = cm10Map.get(obj.concept_id)
    if (!icd10Code) continue
    const synonym = obj.concept_synonym_name?.trim()
    if (!synonym) continue

    // Also include the concept name itself as a synonym
    const name = cm10Names.get(obj.concept_id)?.name
    if (name && name !== synonym) {
      synBatch.push({ id: `${obj.concept_id}-name`, icd10Code, synonym: name })
    }
    synBatch.push({ id: `${obj.concept_id}-${Buffer.from(synonym).toString("hex").slice(0, 12)}`, icd10Code, synonym })

    if (synBatch.length >= BATCH) {
      await flush()
      process.stdout.write(`\r  Synonyms: ${synCount}...`)
    }
  }
  await flush()
  console.log(`\n  Synonyms done: ${synCount} rows.`)
}

// ── Step 4: BG labels from Excel ──────────────────────────────────────────────

async function seedBgLabels() {
  const files = fs.readdirSync(VOCAB_DIR).filter(f => f.match(/ICD10.*\.xlsx$/i))
  if (!files.length) {
    console.log("No ICD10*.xlsx found in vocab-dir — skipping BG labels.")
    return
  }
  const xlsxPath = path.join(VOCAB_DIR, files[0])
  console.log(`Seeding BG labels from ${files[0]}...`)

  let xlsx: any
  try {
    const m = await import("xlsx")
    xlsx = (m as any).default ?? m
  } catch {
    console.warn("  'xlsx' package not found. Run: npm install xlsx --save-dev")
    console.warn("  Skipping BG label seeding.")
    return
  }

  const wb = xlsx.readFile(xlsxPath)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: any[] = xlsx.utils.sheet_to_json(ws, { defval: "" })

  // Try to detect columns: look for something like "code", "label", "bg", etc.
  if (!rows.length) { console.log("  Excel appears empty."); return }
  const sample = rows[0]
  const keys = Object.keys(sample)

  // Heuristic: first column with short uppercase values = code; longest text col = label
  const codeKey = keys.find(k => /^code|^icd|^шифр|^код/i.test(k)) ?? keys[0]
  const bgKey   = keys.find(k => /bg|bg_label|label_bg|описание|наименование/i.test(k))
    ?? keys.find(k => k !== codeKey && String(sample[k]).length > 10)
    ?? keys[1]

  console.log(`  Detected columns: code="${codeKey}", bg_label="${bgKey}"`)

  const pairs: { code: string; labelBg: string }[] = []
  for (const row of rows) {
    const code   = String(row[codeKey] ?? "").trim().toUpperCase()
    const labelBg = String(row[bgKey] ?? "").trim()
    if (!code || !labelBg) continue
    pairs.push({ code, labelBg })
  }

  let updated = 0
  await batchInsert(pairs, async batch => {
    const values = Prisma.join(batch.map(p => Prisma.sql`(${p.code}, ${p.labelBg})`))
    const res: any = await prisma.$executeRaw(Prisma.sql`
      UPDATE "Icd10Code" AS i SET "labelBg" = v.label_bg
      FROM (VALUES ${values}) AS v(code, label_bg)
      WHERE i.code = v.code
    `)
    updated += typeof res === "number" ? res : batch.length
    process.stdout.write(`\r  BG labels: ${updated}...`)
  })
  console.log(`\n  BG labels done: ${updated} codes updated.`)
}

// ── Step 5: Drug table from drugs.json ────────────────────────────────────────

async function seedDrugs() {
  const drugFile = path.join(process.cwd(), "src", "data", "drugs.json")
  if (!fs.existsSync(drugFile)) { console.log("drugs.json not found — skipping."); return }
  console.log("Seeding Drug table from drugs.json...")

  const drugs: { name: string; inn: string; form: string; strength: string; atc: string }[] = JSON.parse(fs.readFileSync(drugFile, "utf8"))
  const rows = drugs.map(d => ({
    id: `drug-${d.name.slice(0, 80)}`,
    name: d.name,
    inn: d.inn || null,
    atcCode: d.atc?.trim() || null,
    form: d.form || null,
    strength: d.strength || null,
  }))
  await batchInsert(rows, batch => bulkUpsert("Drug", "id", ["name", "inn", "atcCode", "form", "strength"], batch))
  console.log(`  Drugs done: ${rows.length} rows.`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Vocab directory: ${VOCAB_DIR}\n`)

  await seedAtc()
  const icd10Map = await seedIcd10Concepts()
  await seedIcd10CmSynonyms(icd10Map)
  await seedBgLabels()
  await seedDrugs()

  console.log("\nAll vocabulary seeds complete.")
}

main().catch(console.error).finally(() => prisma.$disconnect())
