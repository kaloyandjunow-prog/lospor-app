"use client"

import { createContext, useContext, useEffect, useState } from "react"
import type { IntraopSaveInput } from "@lospor/core/intraop-save-state"
import type { CaseSection, RefusedChange } from "@lospor/core/sync"

import { autosaveManager } from "@/lib/autosave-manager"

/**
 * Whether a case's changes have reached the server, per event (9.13.0), from
 * the autosave manager's queue -- the same source and the same rule
 * (@lospor/core/intraop-save-state) as the PWA.
 */
export type CaseSaveState = Omit<IntraopSaveInput, "refused"> & {
  queuedSections: CaseSection[]
  refused: RefusedChange[]
  dismissRefused: () => void
}

export const NO_SAVE_STATE: CaseSaveState = {
  queuedEventIds: [],
  sendingEventId: null,
  refused: [],
  queuedSections: [],
  dismissRefused: () => {},
}

export function useCaseSaveState(caseId: string | null | undefined): CaseSaveState {
  // Held with the case it belongs to, so opening another case shows that
  // case at once rather than the previous one until its first update.
  const [held, setHeld] = useState(() => ({ caseId, state: pick(caseId) }))
  useEffect(() => {
    if (!caseId) return
    void autosaveManager.refreshPending(caseId).catch(() => {})
    const unsubscribe = autosaveManager.subscribe(next => {
      if (next.caseId === caseId) setHeld({ caseId, state: pick(caseId) })
    })
    return () => { unsubscribe() }
  }, [caseId])
  return held.caseId === caseId ? held.state : pick(caseId)
}

function pick(caseId: string | null | undefined): CaseSaveState {
  if (!caseId) return NO_SAVE_STATE
  const current = autosaveManager.getState(caseId)
  return {
    queuedEventIds: current.queuedEventIds,
    sendingEventId: current.sendingEventId,
    refused: current.refused,
    queuedSections: current.queuedSections,
    dismissRefused: () => { void autosaveManager.dismissRefused(caseId).catch(() => {}) },
  }
}

/** The case's save state for the chart lanes, without passing it through every lane. */
export const CaseSaveStateContext = createContext<CaseSaveState>(NO_SAVE_STATE)

export function useChartSaveState(): CaseSaveState {
  return useContext(CaseSaveStateContext)
}
