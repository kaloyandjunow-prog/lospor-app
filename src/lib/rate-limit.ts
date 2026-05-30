import { RATE_LIMIT_WINDOW_MS } from "@/lib/constants"

type Entry = { count: number; windowStart: number }
const store = new Map<string, Entry>()

// Purge windows that have already expired.  Called only when a new entry is
// being created so we don't pay the scan cost on every request.
function pruneExpired(windowMs: number): void {
  const now = Date.now()
  for (const [key, entry] of store.entries()) {
    if (now - entry.windowStart > windowMs) store.delete(key)
  }
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number = RATE_LIMIT_WINDOW_MS,
): { allowed: boolean; retryAfter: number } {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now - entry.windowStart >= windowMs) {
    // Starting a new window — clean up stale entries first.
    pruneExpired(windowMs)
    store.set(key, { count: 1, windowStart: now })
    return { allowed: true, retryAfter: 0 }
  }

  if (entry.count >= limit) {
    const retryAfter = Math.ceil((windowMs - (now - entry.windowStart)) / 1000)
    return { allowed: false, retryAfter }
  }

  entry.count++
  return { allowed: true, retryAfter: 0 }
}
