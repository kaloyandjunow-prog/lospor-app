"use client"

import { useEffect, useState } from "react"
import fallbackSnapshot from "@/data/option-library-fallback.json"
import { CLINICAL_RANGES, type ClinicalRangeKey } from "@lospor/core"
import {
  rangeSpecFromOption,
  type LibraryOption,
  type RangeSpec,
} from "@lospor/core/option-library"
import { parseLibraryOptions } from "@lospor/core/option-contracts"

export type { LibraryOption, RangeSpec }

export type LibrarySource = "live" | "cached" | "bundled"
type CategoryState = { data: LibraryOption[]; source: LibrarySource }

const state = new Map<string, CategoryState>()
const inflight = new Map<string, Promise<void>>()
const listeners = new Map<string, Set<() => void>>()
const retryTimers = new Map<string, ReturnType<typeof setInterval>>()
const globalListeners = new Set<() => void>()

const RETRY_INTERVAL_MS = 30_000
const FALLBACK_SNAPSHOT_DATE: string =
  (fallbackSnapshot as { generatedAt?: string }).generatedAt ?? "unknown"

function storeKey(category: string) {
  return `lospor_option_library_${category}`
}

function bundledOptions(category: string): LibraryOption[] {
  return parseLibraryOptions(
    (fallbackSnapshot as unknown as Record<string, unknown>)[category],
  )
}

function notify(category: string) {
  listeners.get(category)?.forEach(callback => callback())
  globalListeners.forEach(callback => callback())
}

function setState(category: string, next: CategoryState) {
  state.set(category, next)
  notify(category)
}

function stopRetry(category: string) {
  const timer = retryTimers.get(category)
  if (timer) {
    clearInterval(timer)
    retryTimers.delete(category)
  }
}

function scheduleRetry(category: string) {
  if (retryTimers.has(category)) return
  const timer = setInterval(
    () => { void attemptLiveFetch(category) },
    RETRY_INTERVAL_MS,
  )
  retryTimers.set(category, timer)
}

function readLocalCache(category: string): LibraryOption[] | null {
  try {
    const raw = window.localStorage.getItem(storeKey(category))
    if (!raw) return null
    const options = parseLibraryOptions(JSON.parse(raw))
    return options.length ? options : null
  } catch {
    return null
  }
}

function writeLocalCache(category: string, data: LibraryOption[]) {
  try {
    window.localStorage.setItem(storeKey(category), JSON.stringify(data))
  } catch {
    // Storage can be unavailable in private browsing.
  }
}

async function attemptLiveFetch(category: string): Promise<void> {
  const currentRequest = inflight.get(category)
  if (currentRequest) return currentRequest

  const request = (async () => {
    try {
      const response = await fetch(`/api/library/${category}`)
      if (!response.ok) {
        throw new Error(`library fetch failed: ${response.status}`)
      }
      const data = parseLibraryOptions(await response.json())
      if (data.length === 0) {
        throw new Error("empty or invalid option library response")
      }
      setState(category, { data, source: "live" })
      stopRetry(category)
      writeLocalCache(category, data)
    } catch {
      if (!state.has(category)) {
        const cached = readLocalCache(category)
        setState(
          category,
          cached
            ? { data: cached, source: "cached" }
            : { data: bundledOptions(category), source: "bundled" },
        )
      }
      scheduleRetry(category)
    } finally {
      inflight.delete(category)
    }
  })()

  inflight.set(category, request)
  return request
}

export function useOptionLibrary(category: string): {
  options: LibraryOption[]
  loading: boolean
  source: LibrarySource | null
} {
  const [, forceRender] = useState(0)
  const [loading, setLoading] = useState(!state.has(category))

  useEffect(() => {
    const callback = () => forceRender(value => value + 1)
    if (!listeners.has(category)) listeners.set(category, new Set())
    listeners.get(category)!.add(callback)

    if (!state.has(category)) {
      // This hook bridges the existing module cache into React state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(true)
      void attemptLiveFetch(category).finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
    return () => {
      listeners.get(category)?.delete(callback)
    }
  }, [category])

  const latest = state.get(category)
  return {
    options: latest?.data ?? [],
    loading,
    source: latest?.source ?? null,
  }
}

export function useRangeSpec(category: string): RangeSpec | undefined {
  const { options } = useOptionLibrary(category)
  return rangeSpecFromOption(options[0])
}

export function useRange(key: ClinicalRangeKey): RangeSpec {
  const spec = useRangeSpec(key)
  const canonical = CLINICAL_RANGES[key]
  return spec ?? { ...canonical, unit: canonical.unit }
}

export function useAnyLibraryFallback(): {
  active: boolean
  snapshotDate: string
} {
  const [, forceRender] = useState(0)
  useEffect(() => {
    const callback = () => forceRender(value => value + 1)
    globalListeners.add(callback)
    return () => {
      globalListeners.delete(callback)
    }
  }, [])
  return {
    active: [...state.values()].some(entry => entry.source !== "live"),
    snapshotDate: FALLBACK_SNAPSHOT_DATE,
  }
}
