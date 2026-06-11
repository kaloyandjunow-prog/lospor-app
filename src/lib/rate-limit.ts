import { RATE_LIMIT_WINDOW_MS } from "@/lib/constants"

type Entry = { count: number; windowStart: number }
const store = new Map<string, Entry>()

function pruneExpired(windowMs: number = RATE_LIMIT_WINDOW_MS): void {
  const now = Date.now()
  for (const [key, entry] of store.entries()) {
    if (now - entry.windowStart > windowMs) store.delete(key)
  }
}

// Periodic cleanup so entries from one-time IPs don't accumulate indefinitely
if (typeof setInterval !== "undefined") {
  setInterval(() => pruneExpired(), RATE_LIMIT_WINDOW_MS * 2).unref?.()
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
