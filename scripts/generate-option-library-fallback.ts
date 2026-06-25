// Generates the bundled offline-fallback snapshot of the option library and
// writes it into this app's own src/data/, and (when running locally next
// to a sibling lospor-mobile checkout) into lospor-mobile's src/data/ too.
//
// This is the last-resort tier useOptionLibrary falls back to when a device
// has never successfully synced (first install/load + no connectivity) and
// has no prior cache either. See docs/post-migration-seeds.md.
//
// Reads straight from the database (same rows GET /api/library/[category]
// would return) rather than calling the API, since this runs at build time
// with no authenticated session.
//
// Run on every web build (wired into `npm run build` — see package.json) so
// the snapshot can never silently go stale on a deploy. Deliberately fails
// the build (non-zero exit) if the DB is unreachable or any category comes
// back empty — shipping a stale/incomplete snapshot is worse than a failed
// build, since an empty category means "not seeded," not "nothing to show."
//
// Usage: npx tsx scripts/generate-option-library-fallback.ts

import "dotenv/config"
import fs from "fs"
import path from "path"
import crypto from "crypto"
import { PrismaClient, LibraryCategory, Prisma } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter } satisfies Prisma.PrismaClientOptions)

const SOURCE_DIR = path.join(__dirname, "../src/data/option-library")
const WEB_TARGET = path.join(__dirname, "../src/data/option-library-fallback.json")
const MOBILE_SIBLING_DATA_DIR = path.join(__dirname, "../../lospor-mobile/src/data")

// Content hash of the editable source files, not a file mtime — survives
// git checkouts, zip extraction, and Windows/CI timestamp quirks that make
// mtime comparisons unreliable. Used by scripts/check-option-library-fallback-fresh.ts
// to fail CI if someone edited a category file and forgot to regenerate.
export function hashOptionLibrarySource(): string {
  const files = fs.readdirSync(SOURCE_DIR).filter(f => f.endsWith(".ts")).sort()
  const hash = crypto.createHash("sha256")
  for (const f of files) hash.update(fs.readFileSync(path.join(SOURCE_DIR, f)))
  return hash.digest("hex")
}

async function main() {
  const out: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    sourceHash: hashOptionLibrarySource(),
  }

  for (const category of Object.values(LibraryCategory)) {
    const rows = await prisma.optionLibrary.findMany({
      where: { category, active: true },
      orderBy: [{ sortOrder: "asc" }],
      include: { drug: { select: { atcCode: true, inn: true } } },
    })
    if (rows.length === 0) {
      throw new Error(`Category ${category} returned 0 active rows — table exists but isn't seeded. Refusing to write a fallback snapshot with an empty required category.`)
    }
    out[category] = rows.map(r => ({
      id: r.id,
      value: r.value,
      label: r.labelEn,
      labelBg: r.labelBg,
      group: r.group,
      parentId: r.parentId,
      color: r.color,
      description: r.description,
      drugId: r.drugId,
      atcCode: r.drug?.atcCode ?? null,
      inn: r.drug?.inn ?? null,
      metadata: r.metadata,
    }))
    console.log(`  ${category}: ${rows.length} options`)
  }

  const json = JSON.stringify(out, null, 2) + "\n"

  fs.mkdirSync(path.dirname(WEB_TARGET), { recursive: true })
  fs.writeFileSync(WEB_TARGET, json)
  console.log(`Wrote ${WEB_TARGET}`)

  // Only present on a local machine with both repos checked out side by
  // side — not present in Vercel's build container, which only checks out
  // this repo. Mobile gets its copy via the snapshot-serving endpoint +
  // EAS prebuild hook instead (see src/app/api/admin/option-library-snapshot).
  if (fs.existsSync(path.join(__dirname, "../../lospor-mobile"))) {
    const mobileTarget = path.join(MOBILE_SIBLING_DATA_DIR, "option-library-fallback.json")
    fs.mkdirSync(MOBILE_SIBLING_DATA_DIR, { recursive: true })
    fs.writeFileSync(mobileTarget, json)
    console.log(`Wrote ${mobileTarget}`)
  } else {
    console.log("No sibling lospor-mobile checkout found — skipping mobile copy (expected on Vercel).")
  }
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1) }).finally(() => prisma.$disconnect())
}
