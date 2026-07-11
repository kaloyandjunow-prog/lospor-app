// The web app's offline save tray: section patches that could not reach the
// server (network down, server unreachable) are queued in IndexedDB and
// replayed by useOutboxFlusher. Same shared engine and defenses as mobile
// (@lospor/core/sync) — merge-on-queue, crash reconcile, 404/403 discard.
import {
  createCaseOutbox,
  SECTION_CONFLICT_HEADER,
  type CasePatchResponse,
  type CaseSection,
  type PatchFailure,
} from "@lospor/core/sync"
import { idbKV } from "./kv-idb"

class OutboxHttpError extends Error {
  constructor(public status: number) {
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
  if (!res.ok) throw new OutboxHttpError(res.status)
  return res.json().catch(() => ({}))
}

function classifyError(err: unknown): PatchFailure {
  // fetch rejects with TypeError when the network is down/unreachable.
  if (err instanceof TypeError) return { kind: "network" }
  if (err instanceof OutboxHttpError) return { kind: "http", status: err.status }
  return { kind: "other" }
}

export const caseOutbox = createCaseOutbox({ kv: idbKV, sendPatch, classifyError })

/** True when a thrown save error means "no connectivity — queue it". */
export function isNetworkSaveError(err: unknown): boolean {
  return err instanceof TypeError
}
