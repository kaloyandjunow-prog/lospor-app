import "server-only"
import { PrismaClient, Prisma } from "@/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

function createPrismaClient() {
  // `max` deliberately small: node-postgres's own default (10) is sized for a
  // single long-running server process, not one pool per serverless
  // container. The intraop live-refresh SSE route (/api/cases/[id]/stream)
  // keeps a container alive for its whole connection — with enough
  // concurrent long-lived streams, N containers x a 10-connection pool each
  // blows past Postgres's absolute connection ceiling even though any one
  // container is nearly idle. A small per-container pool keeps the
  // aggregate footprint bounded regardless of how many containers Vercel
  // scales out.
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 3 })
  return new PrismaClient({ adapter } satisfies Prisma.PrismaClientOptions)
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
