/**
 * One-off backfill for v1.2 relational normalisation. Idempotent; safe to re-run.
 *   npx tsx scripts/backfill-relational.ts
 * 1) Rebuilds the normalised child rows from each case's JSON (via syncCaseRelational).
 * 2) Populates CaseEvent typed vital columns from metadataJson.
 */
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { syncCaseRelational } from "../src/lib/relational-sync"

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) } as any)

async function backfillCaseRows() {
  const cases = await prisma.case.findMany({ select: { id: true } })
  let done = 0, failed = 0
  for (const c of cases) {
    try { await syncCaseRelational(prisma as any, c.id) }
    catch (e) { failed++; console.error("  case", c.id, e) }
    if (++done % 50 === 0) console.log(`  ...${done}/${cases.length} cases`)
  }
  console.log(`Relational rows synced for ${done} cases (${failed} failed).`)
}

async function backfillVitalColumns() {
  const numI = (v: any) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Math.round(Number(v)))
  const numF = (v: any) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v))
  let cursor: string | null = null
  let total = 0
  for (;;) {
    const args: any = {
      where: { type: "vital" },
      take: 500,
      orderBy: { id: "asc" },
      select: { id: true, metadataJson: true },
    }
    if (cursor) { args.skip = 1; args.cursor = { id: cursor } }
    const batch: Array<{ id: string; metadataJson: any }> = await prisma.caseEvent.findMany(args)
    if (batch.length === 0) break
    for (const ev of batch) {
      const m = (ev.metadataJson as any) ?? {}
      await prisma.caseEvent.update({
        where: { id: ev.id },
        data: {
          systolic: numI(m.systolic), diastolic: numI(m.diastolic), heartRate: numI(m.heartRate),
          spO2: numF(m.spO2), etco2: numF(m.etco2), temp: numF(m.temp),
        },
      })
    }
    total += batch.length
    cursor = batch[batch.length - 1].id
    console.log(`  ...vitals ${total}`)
  }
  console.log(`Vital columns backfilled on ${total} events.`)
}

async function main() {
  console.log("1/2 — case relational rows…")
  await backfillCaseRows()
  console.log("2/2 — CaseEvent vital columns…")
  await backfillVitalColumns()
  // Summary counts
  const [diag, proc, com, lab, vasc, sel] = await Promise.all([
    prisma.preopDiagnosis.count(), prisma.preopProcedure.count(), prisma.comorbidity.count(),
    prisma.labResult.count(), prisma.vascularAccess.count(), prisma.caseSelection.count(),
  ])
  console.log(`Rows: diagnoses=${diag} procedures=${proc} comorbidities=${com} labs=${lab} vascular=${vasc} selections=${sel}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
