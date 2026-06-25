// Seed OptionLibrary from the per-category data files in
// src/data/option-library/ — one small file per library (position,
// technique, vascular access, airway management, monitoring, premedication
// drugs, intraop drugs, intraop infusions, inhalational agents, intraop
// fluids, clinical events, plus preop/postop categorical pickers, numeric
// range specs, and the handover checklist). seedOptionLibrary() is the
// actual logic, used both by this CLI script and by the protected admin
// maintenance endpoint (src/app/api/admin/maintenance/seed-option-library/route.ts).
// To add or edit a category's content, edit that category's file in
// src/data/option-library/ — this shouldn't need to change.
//
// Usage: npx tsx scripts/seed-option-library.ts
// Idempotent: upserts on the (category, value) unique constraint.

import "dotenv/config"
import type { PrismaClient, Prisma } from "../src/generated/prisma/client"
import type { LibraryCategory } from "../src/generated/prisma/enums"

import { POSITIONS } from "../src/data/option-library/position"
import { AIRWAY_DEVICES, AIRWAY_TOOLS } from "../src/data/option-library/airway-management"
import { MONITORING } from "../src/data/option-library/monitoring"
import { PREMED_CATS, PREMED_DOSES } from "../src/data/option-library/premed-drugs"
import { DRUG_CATALOG } from "../src/data/option-library/intraop-drugs"
import { INFUSION_CATALOG } from "../src/data/option-library/intraop-infusions"
import { AGENT_CATALOG } from "../src/data/option-library/inhalational-agents"
import { FLUID_CATALOG } from "../src/data/option-library/intraop-fluids"
import { parseDoseProfile } from "../src/data/option-library/dose-profile"
import { CLINICAL_EVENT_CATS } from "../src/data/option-library/intraop-events"
import { TECHNIQUE_TREE } from "../src/data/option-library/technique"
import { VASCULAR_ACCESS_TREE } from "../src/data/option-library/vascular-access"
import { SEX, BLOOD_GROUP, NECK_MOBILITY, MALLAMPATI, UPPER_LIP_BITE, CORMACK_LEHANE, DISPOSITION } from "../src/data/option-library/preop-postop-categorical"
import { NUMERIC_RANGES } from "../src/data/option-library/numeric-ranges"
import { HANDOVER_ITEMS } from "../src/data/option-library/handover-items"
import type { TreeNode } from "../src/data/option-library/types"

function slug(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "")
}

export async function seedOptionLibrary(prisma: PrismaClient): Promise<{ totalRows: number }> {
  // Tracks every (category, value) touched this run, so categories this
  // script owns end-to-end can have stale rows deactivated below — upsert
  // alone never removes a row whose source entry was renamed/deleted, which
  // would otherwise leave it permanently active and selectable.
  const touchedKeys = new Set<string>()
  const touchedCategories = new Set<LibraryCategory>()

  async function upsert(row: {
    category: LibraryCategory; value: string; labelEn: string; labelBg?: string | null
    group?: string | null; parentId?: string | null; drugId?: string | null
    color?: string | null; description?: string | null; sortOrder: number
    metadata?: Prisma.InputJsonValue
  }) {
    touchedKeys.add(`${row.category}::${row.value}`)
    touchedCategories.add(row.category)
    return prisma.optionLibrary.upsert({
      where: { category_value: { category: row.category, value: row.value } },
      update: {
        labelEn: row.labelEn, labelBg: row.labelBg ?? null, group: row.group ?? null,
        parentId: row.parentId ?? null, drugId: row.drugId ?? null, color: row.color ?? null,
        description: row.description ?? null, sortOrder: row.sortOrder, metadata: row.metadata ?? undefined,
        active: true,
      },
      create: {
        category: row.category, value: row.value, labelEn: row.labelEn, labelBg: row.labelBg ?? null,
        group: row.group ?? null, parentId: row.parentId ?? null, drugId: row.drugId ?? null,
        color: row.color ?? null, description: row.description ?? null, sortOrder: row.sortOrder,
        metadata: row.metadata ?? undefined,
      },
    })
  }

  // Best-effort backfill of ATC/INN onto curated drug-shaped library rows by
  // matching against the existing (much larger) Drug table. Anesthesia drug
  // names here are generic (INN), so try INN first, then name.
  const drugIdCache = new Map<string, string | null>()
  async function findDrugId(name: string): Promise<string | null> {
    if (drugIdCache.has(name)) return drugIdCache.get(name)!
    const byInn = await prisma.drug.findFirst({ where: { inn: { equals: name, mode: "insensitive" } }, select: { id: true } })
    const found = byInn ?? await prisma.drug.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: { id: true } })
    drugIdCache.set(name, found?.id ?? null)
    return found?.id ?? null
  }

  async function seedTree(category: LibraryCategory, nodes: TreeNode[], parentId: string | null, sortStart: number): Promise<number> {
    let sort = sortStart
    for (const node of nodes) {
      const row = await upsert({ category, value: node.v, labelEn: node.label, labelBg: node.labelBg, parentId, sortOrder: sort++ })
      if (node.children?.length) sort = await seedTree(category, node.children, row.id, sort)
    }
    return sort
  }

  let sort = 0
  for (const p of POSITIONS) {
    await upsert({ category: "POSITION", value: p.v, labelEn: p.label, description: p.desc, color: p.sel, sortOrder: sort++ })
  }

  sort = 0
  for (const [v, label] of AIRWAY_DEVICES) {
    await upsert({ category: "AIRWAY_MANAGEMENT", value: v, labelEn: label, group: "Device", sortOrder: sort++ })
  }
  for (const [v, label] of AIRWAY_TOOLS) {
    await upsert({ category: "AIRWAY_MANAGEMENT", value: v, labelEn: label, group: "Instrument", sortOrder: sort++ })
  }

  sort = 0
  for (const m of MONITORING) {
    await upsert({ category: "MONITORING", value: m.field, labelEn: m.label, group: m.cat, sortOrder: sort++ })
  }

  sort = 0
  for (const { cat, drugs } of PREMED_CATS) {
    for (const name of drugs) {
      const drugId = await findDrugId(name)
      await upsert({ category: "PREMED_DRUG", value: slug(name), labelEn: name, group: cat, drugId, sortOrder: sort++, metadata: PREMED_DOSES[name] ?? null })
    }
  }

  // Drugs/infusions/fluids/agents each validate their DoseProfile against
  // DoseProfileSchema before writing — a malformed entry throws here at seed
  // time rather than silently landing in the database wrong.
  sort = 0
  for (const entry of DRUG_CATALOG) {
    const drugId = await findDrugId(entry.name)
    const profile = parseDoseProfile(entry.name, "bolus", entry.profile)
    await upsert({
      category: "INTRAOP_DRUG", value: slug(entry.name), labelEn: entry.name, group: entry.category, color: entry.color, drugId, sortOrder: sort++,
      metadata: profile,
    })
  }

  sort = 0
  for (const entry of INFUSION_CATALOG) {
    const drugId = await findDrugId(entry.name)
    const profile = parseDoseProfile(entry.name, "infusion", entry.profile)
    await upsert({
      category: "INTRAOP_INFUSION", value: slug(entry.name), labelEn: entry.name, color: entry.color, drugId, sortOrder: sort++,
      metadata: profile,
    })
  }

  sort = 0
  for (const entry of AGENT_CATALOG) {
    const profile = parseDoseProfile(entry.label, "agent", entry.profile)
    await upsert({
      category: "INHALATIONAL_AGENT", value: entry.value, labelEn: entry.label, sortOrder: sort++,
      metadata: { ...profile, bar: entry.bar, text: entry.text, grip: entry.grip },
    })
  }

  sort = 0
  for (const entry of FLUID_CATALOG) {
    const profile = parseDoseProfile(entry.name, "fluid", entry.profile)
    await upsert({
      category: "INTRAOP_FLUID", value: slug(entry.name), labelEn: entry.name, group: entry.category, color: entry.color, sortOrder: sort++,
      metadata: profile,
    })
  }

  sort = 0
  for (const { cat, color, isComplication, events } of CLINICAL_EVENT_CATS) {
    for (const e of events) {
      await upsert({ category: "INTRAOP_EVENT", value: slug(`${cat}_${e.label}`), labelEn: e.label, group: cat, color: e.color, sortOrder: sort++, metadata: isComplication ? { isComplication: true, categoryColor: color } : { categoryColor: color } })
    }
  }

  await seedTree("TECHNIQUE", TECHNIQUE_TREE, null, 0)
  await seedTree("VASCULAR_ACCESS", VASCULAR_ACCESS_TREE, null, 0)
  await seedTree("HANDOVER_ITEM", HANDOVER_ITEMS, null, 0)

  sort = 0
  for (const s of SEX) await upsert({ category: "SEX", value: s.v, labelEn: s.label, sortOrder: sort++ })

  sort = 0
  for (const b of BLOOD_GROUP) {
    await upsert({ category: "BLOOD_GROUP", value: b.v, labelEn: b.label, sortOrder: sort++, metadata: { bloodType: b.bloodType, rhFactor: b.rhFactor } })
  }

  sort = 0
  for (const n of NECK_MOBILITY) await upsert({ category: "NECK_MOBILITY", value: n.v, labelEn: n.label, labelBg: n.labelBg, color: n.color, sortOrder: sort++ })

  sort = 0
  for (const m of MALLAMPATI) await upsert({ category: "MALLAMPATI", value: m.v, labelEn: m.label, description: m.desc, color: m.color, sortOrder: sort++ })

  sort = 0
  for (const u of UPPER_LIP_BITE) await upsert({ category: "UPPER_LIP_BITE", value: u.v, labelEn: u.label, labelBg: u.labelBg, description: u.desc, color: u.color, sortOrder: sort++ })

  sort = 0
  for (const c of CORMACK_LEHANE) await upsert({ category: "CORMACK_LEHANE", value: c.v, labelEn: c.label, description: c.desc, color: c.color, sortOrder: sort++ })

  sort = 0
  for (const d of DISPOSITION) await upsert({ category: "DISPOSITION", value: d.v, labelEn: d.label, labelBg: d.labelBg, color: d.color, sortOrder: sort++ })

  for (const [category, range] of Object.entries(NUMERIC_RANGES)) {
    await upsert({ category: category as LibraryCategory, value: "default", labelEn: "default", sortOrder: 0, metadata: range })
  }

  // Deactivate stale rows: anything in a category this run touched, that
  // wasn't itself touched (renamed/removed from the source data files).
  // Soft-deactivate rather than delete — existing CaseEvent/CaseSelection
  // rows reference the `value` string directly, not a live FK, so old cases
  // keep displaying correctly; the row just stops being selectable for new
  // entries.
  let deactivated = 0
  for (const category of touchedCategories) {
    const existing = await prisma.optionLibrary.findMany({
      where: { category, active: true },
      select: { id: true, value: true },
    })
    const stale = existing.filter(o => !touchedKeys.has(`${category}::${o.value}`))
    if (stale.length) {
      await prisma.optionLibrary.updateMany({ where: { id: { in: stale.map(o => o.id) } }, data: { active: false } })
      deactivated += stale.length
    }
  }
  if (deactivated) console.log(`Deactivated ${deactivated} stale OptionLibrary row(s) no longer present in source data.`)

  const totalRows = await prisma.optionLibrary.count()
  return { totalRows }
}

async function main() {
  const { PrismaClient } = await import("../src/generated/prisma/client")
  const { PrismaPg } = await import("@prisma/adapter-pg")
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter } satisfies import("../src/generated/prisma/client").Prisma.PrismaClientOptions)
  try {
    const { totalRows } = await seedOptionLibrary(prisma)
    console.log(`OptionLibrary seeded. Total rows: ${totalRows}`)
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1) })
}
