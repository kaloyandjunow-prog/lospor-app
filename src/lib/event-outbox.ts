// Offline journal for intraop EVENTS on web (drugs, fluids, vitals, clinical
// events): single-event POSTs that fail on network are persisted in IndexedDB
// and replayed by the flusher — the same @lospor/core/sync engine and
// semantics the mobile app uses (idempotent server appends, dropped-log for
// permanent rejections). Full-log PUTs (deletes/edits of existing timeline
// items) are intentionally NOT queued: replaying a stale full log after
// reconnecting could resurrect deleted events, so those revert with a toast.
import {
  createPendingEventStore,
  eventIdempotencyKey,
  IDEMPOTENCY_HEADER,
  PENDING_EVENTS_INDEX_KEY,
  SOURCE_HEADER,
} from "@lospor/core/sync"
import { idbKV } from "./kv-idb"

type EventOutboxListener = (totalPending: number) => void
const listeners = new Set<EventOutboxListener>()

export function onEventOutboxChange(listener: EventOutboxListener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export const eventOutbox = createPendingEventStore({
  kv: idbKV,
  postEvent: async (caseId, event) => {
    const res = await fetch(`/api/cases/${caseId}/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(event.id ? { [IDEMPOTENCY_HEADER]: eventIdempotencyKey(caseId, String(event.id)) } : {}),
        [SOURCE_HEADER]: "web",
      },
      body: JSON.stringify(event),
    })
    return { ok: res.ok, status: res.status }
  },
  // fetch rejects with TypeError when the network is down/unreachable.
  isNetworkError: (err) => err instanceof TypeError,
  onChange: (totalPending) => {
    for (const listener of listeners) {
      try { listener(totalPending) } catch { /* a bad listener never breaks the journal */ }
    }
  },
})

/** Current total queued events (for badge seeding on mount). */
export async function eventOutboxCount(): Promise<number> {
  const raw = await idbKV.get(PENDING_EVENTS_INDEX_KEY).catch(() => null)
  if (!raw) return 0
  try {
    const ids = JSON.parse(raw) as string[]
    let total = 0
    for (const id of ids) {
      const events = await eventOutbox.loadPending(id).catch(() => [])
      total += events.length
    }
    return total
  } catch {
    return 0
  }
}
