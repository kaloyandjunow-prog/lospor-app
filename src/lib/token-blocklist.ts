// DB-backed JWT revocation with an in-memory cache for fast sync reads.
// The JWT callback must remain synchronous in NextAuth v5 beta, so we use
// a module-level Set that is populated lazily and kept in sync on revoke.
import { prisma } from "@/lib/prisma"

const cache = new Set<string>()
let loaded = false

async function ensureLoaded() {
  if (loaded) return
  loaded = true
  try {
    const rows = await prisma.revokedToken.findMany({
      where: { expiresAt: { gt: new Date() } },
      select: { jti: true },
    })
    for (const r of rows) cache.add(r.jti)
  } catch { /* non-fatal — cache stays empty, tokens fail open */ }
}

// Call once at app startup (fire-and-forget)
ensureLoaded()

export async function revokeToken(jti: string, expiresAt: Date): Promise<void> {
  cache.add(jti)
  try {
    await prisma.revokedToken.upsert({
      where:  { jti },
      update: {},
      create: { jti, expiresAt },
    })
    // Lazy prune expired entries
    await prisma.revokedToken.deleteMany({ where: { expiresAt: { lt: new Date() } } })
  } catch { /* non-fatal — cache still protects this session */ }
}

// Synchronous — safe to call inside the JWT callback
export function isRevoked(jti: string): boolean {
  return cache.has(jti)
}
