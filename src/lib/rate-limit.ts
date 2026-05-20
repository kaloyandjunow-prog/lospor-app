type Entry = { count: number; windowStart: number }
const store = new Map<string, Entry>()

export function rateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfter: number } {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now - entry.windowStart >= windowMs) {
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
