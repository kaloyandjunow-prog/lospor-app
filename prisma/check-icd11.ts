import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg }     from "@prisma/adapter-pg"

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma  = new PrismaClient({ adapter } as any)
  const total   = await (prisma as any).icd11Code.count()
  const done    = await (prisma as any).icd11Code.count({ where: { labelBg: { not: null } } })
  const sample  = await (prisma as any).icd11Code.findMany({ where: { labelBg: { not: null } }, select: { labelBg: true, labelEn: true }, take: 2000 })
  const bad     = sample.filter((r: any) => r.labelBg === r.labelEn).length
  console.log(`Total: ${total} | Translated: ${done} | Remaining: ${total - done} | Bad fallbacks in sample: ${bad}`)
  await (prisma as any).$disconnect()
}
main().catch(console.error)
