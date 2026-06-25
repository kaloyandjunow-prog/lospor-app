"use client"
import { useEffect, useState } from "react"
import fallbackSnapshot from "@/data/option-library-fallback.json"

export type LibraryOption = {
  id: string
  value: string
  label: string
  labelBg: string | null
  group: string | null
  parentId: string | null
  color: string | null
  description: string | null
  drugId: string | null
  atcCode: string | null
  inn: string | null
  // Per-category shape (DoseProfile for drugs/infusions/fluids/agents,
  // categoryColor/isComplication for events, allowedUnits for numeric
  // ranges, etc.) — genuinely varies by category, read defensively via
  // optional chaining everywhere it's consumed.
  metadata: Record<string, unknown> | null
}

export type LibrarySource = "live" | "cached" | "bundled"
type CategoryState = { data: LibraryOption[]; source: LibrarySource }

const state = new Map<string, CategoryState>()
const inflight = new Map<string, Promise<void>>()
const listeners = new Map<string, Set<() => void>>()
const retryTimers = new Map<string, ReturnType<typeof setInterval>>()
const globalListeners = new Set<() => void>()

const RETRY_INTERVAL_MS = 30_000
const FALLBACK_SNAPSHOT_DATE: string = (fallbackSnapshot as { generatedAt?: string }).generatedAt ?? "unknown"

function storeKey(category: string) {
  return `lospor_option_library_${category}`
}

function notify(category: string) {
  listeners.get(category)?.forEach(cb => cb())
  globalListeners.forEach(cb => cb())
}

function setState(category: string, next: CategoryState) {
  state.set(category, next)
  notify(category)
}

function stopRetry(category: string) {
  const t = retryTimers.get(category)
  if (t) { clearInterval(t); retryTimers.delete(category) }
}

function scheduleRetry(category: string) {
  if (retryTimers.has(category)) return
  const t = setInterval(() => { attemptLiveFetch(category) }, RETRY_INTERVAL_MS)
  retryTimers.set(category, t)
}

function readLocalCache(category: string): LibraryOption[] | null {
  try {
    const raw = window.localStorage.getItem(storeKey(category))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function writeLocalCache(category: string, data: LibraryOption[]) {
  try { window.localStorage.setItem(storeKey(category), JSON.stringify(data)) } catch {}
}

// Tries the live API. On success, replaces whatever fallback was showing and
// stops the background retry. On failure, leaves the current
// cached/bundled data in place (it was already shown) and keeps retrying.
async function attemptLiveFetch(category: string): Promise<void> {
  if (inflight.has(category)) return inflight.get(category)!
  const p = (async () => {
    try {
      const res = await fetch(`/api/library/${category}`)
      if (!res.ok) throw new Error(`library fetch failed: ${res.status}`)
      const data: LibraryOption[] = await res.json()
      // A 200 with an empty array is never legitimately correct for these
      // categories — it means the table exists but hasn't been seeded yet,
      // not "nothing to show." Treat it the same as a fetch failure rather
      // than trusting it as live, so it can't silently blank out a picker
      // with no banner and no retry.
      if (data.length === 0) throw new Error("empty option library response")
      setState(category, { data, source: "live" })
      stopRetry(category)
      writeLocalCache(category, data)
    } catch {
      // Still offline/unreachable — if we don't have anything showing yet,
      // fall through to cached/bundled data so pickers aren't empty.
      if (!state.has(category)) {
        const cached = readLocalCache(category)
        if (cached) {
          setState(category, { data: cached, source: "cached" })
        } else {
          setState(category, { data: (fallbackSnapshot as unknown as Record<string, LibraryOption[]>)[category] ?? [], source: "bundled" })
        }
      }
      scheduleRetry(category)
    } finally {
      inflight.delete(category)
    }
  })()
  inflight.set(category, p)
  return p
}

// Fetches a selectable option library (position, technique, vascular access,
// airway management, monitoring, premedication/intraop drugs, infusions,
// inhalational agents, fluids, clinical events) once per category and caches
// it for the rest of the session, in localStorage for reuse across reloads,
// and falls back to a snapshot bundled into the app build itself if the live
// fetch fails and there's no prior cache either (first load + no
// connectivity) — see scripts/generate-option-library-fallback.ts in the
// repo root. While running on cached/bundled data, retries the live fetch
// every 30s in the background and swaps in live data the moment it succeeds.
export function useOptionLibrary(category: string): { options: LibraryOption[]; loading: boolean; source: LibrarySource | null } {
  const [, forceRender] = useState(0)
  const [loading, setLoading] = useState(!state.has(category))

  useEffect(() => {
    const cb = () => forceRender(n => n + 1)
    if (!listeners.has(category)) listeners.set(category, new Set())
    listeners.get(category)!.add(cb)
    if (!state.has(category)) {
      // Async fetch-on-mount with a loading flag — the standard data-fetching
      // pattern this rule flags, but a full rewrite onto useSyncExternalStore
      // would mean reshaping the existing module-level cache/listener/retry
      // system above (already a deliberate, working design — see the comment
      // block above this hook), not a lint-pass-sized change.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(true)
      attemptLiveFetch(category).finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
    return () => { listeners.get(category)?.delete(cb) }
  }, [category])

  const latest = state.get(category)
  return { options: latest?.data ?? [], loading, source: latest?.source ?? null }
}

export type RangeSpec = { min: number; max: number; step: number; unit: string }

// Numeric range pickers (age, height, weight, vitals, etc.) are seeded as a
// single OptionLibrary row per category with the actual min/max/step/unit in
// metadata — same fetch/cache/fallback machinery as the categorical lists.
export function useRangeSpec(category: string): RangeSpec | undefined {
  const { options } = useOptionLibrary(category)
  return options[0]?.metadata as RangeSpec | undefined
}

// Used by the offline-library banner to know if anything is currently
// showing non-live data, without needing to know which categories a given
// screen uses.
export function useAnyLibraryFallback(): { active: boolean; snapshotDate: string } {
  const [, forceRender] = useState(0)
  useEffect(() => {
    const cb = () => forceRender(n => n + 1)
    globalListeners.add(cb)
    return () => { globalListeners.delete(cb) }
  }, [])
  const active = [...state.values()].some(s => s.source !== "live")
  return { active, snapshotDate: FALLBACK_SNAPSHOT_DATE }
}
