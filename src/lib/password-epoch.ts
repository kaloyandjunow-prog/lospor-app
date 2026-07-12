// Password-change epoch check: any JWT (web session or mobile bearer) whose
// iat predates the user's passwordChangedAt is rejected, so a password reset
// actually terminates existing sessions and mobile tokens.
//
// Same DB-backed + 5-minute in-memory cache pattern as token-blocklist.ts —
// verification paths stay free of per-request DB reads, and revocation takes
// effect within the refresh interval (the same SLA as jti revocation).
import { prisma } from "@/lib/prisma"

const cache = new Map<string, number>() // userId -> passwordChangedAt epoch ms
let loaded = false
let loadPromise: Promise<void> | null = null
let lastRefreshAt = 0
const REFRESH_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

async function loadFromDB(): Promise<void> {
  try {
    // Users who have never reset their password aren't in the table result —
    // their epoch is implicitly 0 (every token acceptable).
    const rows = await prisma.user.findMany({
      where: { passwordChangedAt: { not: null } },
      select: { id: true, passwordChangedAt: true },
    })
    cache.clear()
    for (const r of rows) {
      if (r.passwordChangedAt) cache.set(r.id, r.passwordChangedAt.getTime())
    }
    lastRefreshAt = Date.now()
    loaded = true
  } catch {
    /* non-fatal — cache retains previous state */
    if (!loaded) loaded = true // don't block callers forever on a DB outage
  }
}

function scheduleLoad(): Promise<void> {
  if (!loadPromise) {
    loadPromise = loadFromDB().finally(() => { loadPromise = null })
  }
  return loadPromise
}

scheduleLoad()

if (typeof setInterval !== "undefined") {
  setInterval(() => { loadFromDB() }, REFRESH_INTERVAL_MS).unref?.()
}

/** Record a password change NOW — the caller persists the DB column; this primes the cache immediately for this instance. */
export function notePasswordChanged(userId: string, changedAt: Date): void {
  cache.set(userId, changedAt.getTime())
}

/**
 * Pure check, exported for tests: was the token (iat in SECONDS, as in JWT
 * claims) issued before the epoch (ms)?
 */
export function issuedBeforeEpoch(iatSeconds: number | undefined, epochMs: number | undefined): boolean {
  if (!epochMs) return false // user never reset — all tokens acceptable
  if (iatSeconds == null) return true // epoch set but token has no iat — treat as stale
  return iatSeconds * 1000 < epochMs
}

/** Async variant (mobile bearer path) — awaits the initial load so a fresh instance never false-negatives. */
export async function isIssuedBeforePasswordChangeAsync(userId: string, iatSeconds: number | undefined): Promise<boolean> {
  const now = Date.now()
  if (!loaded || now - lastRefreshAt > REFRESH_INTERVAL_MS) {
    await scheduleLoad()
  }
  return issuedBeforeEpoch(iatSeconds, cache.get(userId))
}

/** Sync variant — cache-only, safe for the NextAuth JWT callback (same caveat as isRevoked). */
export function isIssuedBeforePasswordChange(userId: string, iatSeconds: number | undefined): boolean {
  return issuedBeforeEpoch(iatSeconds, cache.get(userId))
}
