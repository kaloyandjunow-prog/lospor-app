// The web app's offline save tray: section patches that could not reach the
// server (network down, server unreachable) are queued in IndexedDB and
// replayed by useOutboxFlusher. Same shared engine and defenses as mobile
// (@lospor/core/sync) — merge-on-queue, crash reconcile, 404/403 discard.
import {
  createCaseOutbox,
  SECTION_CONFLICT_HEADER,
  type CasePatchResponse,
  type CaseSection,
  type OutboxSummary,
  type PatchFailure,
} from "@lospor/core/sync"
import { idbKV } from "./kv-idb"

class OutboxHttpError extends Error {
  constructor(public status: number, public serverUpdatedAt?: string) {
    super(`Save failed (HTTP ${status})`)
    this.name = "OutboxHttpError"
  }
}

async function sendPatch(
  caseId: string,
  section: CaseSection,
  payload: unknown,
  baseUpdatedAt: string | null | undefined,
): Promise<CasePatchResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (baseUpdatedAt) headers[SECTION_CONFLICT_HEADER[section]] = baseUpdatedAt
  const res = await fetch(`/api/cases/${caseId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ [section]: payload }),
  })
  if (!res.ok) {
    // Parse the body so a 409 can carry serverVersion.updatedAt — the flush
    // self-heal needs it; discarding the body made conflicts unrecoverable.
    const body = await res.json().catch(() => ({})) as { serverVersion?: { updatedAt?: unknown } }
    const serverUpdatedAt = typeof body.serverVersion?.updatedAt === "string" ? body.serverVersion.updatedAt : undefined
    throw new OutboxHttpError(res.status, serverUpdatedAt)
  }
  return res.json().catch(() => ({}))
}

function classifyError(err: unknown): PatchFailure {
  // fetch rejects with TypeError when the network is down/unreachable.
  if (err instanceof TypeError) return { kind: "network" }
  if (err instanceof OutboxHttpError) return { kind: "http", status: err.status, serverUpdatedAt: err.serverUpdatedAt }
  return { kind: "other" }
}

// Live tray-count subscription: the header badge and the case page's save
// pill both listen here instead of polling IndexedDB.
type OutboxListener = (summary: OutboxSummary) => void
const listeners = new Set<OutboxListener>()

export function onOutboxChange(listener: OutboxListener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export const caseOutbox = createCaseOutbox({
  kv: idbKV,
  sendPatch,
  classifyError,
  onChange: (summary) => {
    for (const listener of listeners) {
      try { listener(summary) } catch { /* a bad listener never breaks the tray */ }
    }
  },
})

/** True when a thrown save error means "no connectivity — queue it". */
export function isNetworkSaveError(err: unknown): boolean {
  return err instanceof TypeError
}
