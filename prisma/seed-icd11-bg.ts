/**
 * Seed ICD-11 Bulgarian translations using Google Translate (free, no API key).
 * Reads the WHO SimpleTabulation TSV, translates, upserts into Icd11Code.
 * Resumable — already-translated codes are skipped.
 * Run: npx tsx prisma/seed-icd11-bg.ts
 */

import "dotenv/config"
import * as fs   from "fs"
import * as path from "path"
import { translate } from "@vitalets/google-translate-api"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg }     from "@prisma/adapter-pg"

const TSV_PATH = path.join("C:/losardoc/SimpleTabulation-ICD-11-MMS-en", "SimpleTabulation-ICD-11-MMS-en.txt")
const BATCH    = 50     // Google Translate handles batches via newline-joined text
const DELAY_MS = 1500   // ms between requests to avoid rate limiting

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter } as any)

// ── Parse TSV ────────────────────────────────────────────────────────────────
function parseTsv(): { code: string; labelEn: string }[] {
  const lines = fs.readFileSync(TSV_PATH, "utf8").split("\n")
  const results: { code: string; labelEn: string }[] = []

  for (const line of lines) {
    const cols = line.split("\t")
    if (cols.length < 6) continue

    const code      = cols[2].trim().replace(/^"|"$/g, "")
    const classKind = cols[5].trim().replace(/^"|"$/g, "")
    const rawTitle  = cols[4].trim().replace(/^"|"$/g, "")

    if (!code || classKind !== "category") continue

    const labelEn = rawTitle.replace(/^[-\s]+/, "").trim()
    if (!labelEn) continue

    results.push({ code, labelEn })
  }

  return results
}

// ── Translate a batch via Google Translate ────────────────────────────────────
// Joins terms with a unique separator, translates as one request, then splits back.
async function translateBatch(titles: string[]): Promise<string[] | null> {
  // Use a separator that won't appear in medical terms
  const SEP = " ||||| "
  const joined = titles.join(SEP)

  const result = await translate(joined, { from: "en", to: "bg" })
  const translated = result.text.split(SEP.trim()).map(s => s.replace(/\|+/g, "").trim())

  if (translated.length === titles.length) {
    return translated
  }

  // If separator was mangled, fall back to translating one by one
  console.warn(`  ⚠ separator split failed (${translated.length}/${titles.length}) — falling back to per-item`)
  const results: string[] = []
  for (const title of titles) {
    try {
      const r = await translate(title, { from: "en", to: "bg" })
      results.push(r.text)
      await new Promise(r => setTimeout(r, 200))
    } catch {
      results.push(title) // keep English on failure
    }
  }
  return results
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("Reading TSV…")
  const all = parseTsv()
  console.log(`Parsed ${all.length} codeable categories.`)

  const existing = await (prisma as any).icd11Code.findMany({
    where:  { labelBg: { not: null } },
    select: { code: true, labelBg: true, labelEn: true },
  }) as { code: string; labelBg: string; labelEn: string }[]

  const done = new Set(existing.filter(r => r.labelBg !== r.labelEn).map(r => r.code))
  console.log(`Properly translated: ${done.size}`)

  const badCodes = existing.filter(r => r.labelBg === r.labelEn).map(r => r.code)
  if (badCodes.length > 0) {
    console.log(`Resetting ${badCodes.length} fallback entries…`)
    await (prisma as any).icd11Code.updateMany({
      where: { code: { in: badCodes } },
      data:  { labelBg: null },
    })
  }

  const todo = all.filter(r => !done.has(r.code))
  console.log(`To translate: ${todo.length}`)
  if (todo.length === 0) { console.log("Nothing to do!"); return }

  const batches = Math.ceil(todo.length / BATCH)
  let translated = 0
  let skipped    = 0

  for (let b = 0; b < batches; b++) {
    const slice  = todo.slice(b * BATCH, (b + 1) * BATCH)
    const titles = slice.map(r => r.labelEn)

    process.stdout.write(`Batch ${b + 1}/${batches} (${translated}/${todo.length} done)… `)

    let bgTitles: string[] | null = null
    try {
      bgTitles = await translateBatch(titles)
    } catch (err: any) {
      const msg = String(err?.message ?? err)
      if (msg.includes("429") || msg.includes("Too Many")) {
        console.warn(`\n  Rate limited — waiting 60s…`)
        await new Promise(r => setTimeout(r, 60000))
        try { bgTitles = await translateBatch(titles) } catch { bgTitles = null }
      } else {
        console.error(`\n  Error: ${msg} — skipping batch`)
      }
    }

    if (bgTitles === null) {
      skipped += slice.length
      console.log(`⚠ skipped`)
    } else {
      for (let i = 0; i < slice.length; i++) {
        await (prisma as any).icd11Code.upsert({
          where:  { code: slice[i].code },
          create: { code: slice[i].code, labelEn: slice[i].labelEn, labelBg: bgTitles[i] },
          update: { labelEn: slice[i].labelEn, labelBg: bgTitles[i] },
        })
      }
      translated += slice.length
      console.log(`✓ (${translated}/${todo.length})`)
    }

    if (b < batches - 1) await new Promise(r => setTimeout(r, DELAY_MS))
  }

  console.log(`\nDone! ${translated} translated, ${skipped} skipped.`)
}

main()
  .catch(console.error)
  .finally(() => (prisma as any).$disconnect())
