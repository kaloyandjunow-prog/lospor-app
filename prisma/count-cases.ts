import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg }     from "@prisma/adapter-pg"

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) } as any)
  const total      = await (prisma as any).case.count()
  const demo       = await (prisma as any).case.count({ where: { notes: "__DEMO__" } })
  const complete   = await (prisma as any).case.count({ where: { status: "COMPLETE" } })
  const inProgress = await (prisma as any).case.count({ where: { status: "IN_PROGRESS" } })
  console.log(`Total: ${total} | Real: ${total - demo} | Demo: ${demo} | Complete: ${complete} | In progress: ${inProgress}`)
  await (prisma as any).$disconnect()
}
main().catch(console.error)
