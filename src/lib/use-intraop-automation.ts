"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AUTOMATION_GROUPS,
  automationGroupEnabled,
  DEFAULT_INTRAOP_AUTOMATION,
  parseIntraopAutomation,
  vitalQuestionsEnabled,
  type IntraopAutomationSettings,
  type UserAutomationSwitches,
} from "@lospor/core/intraop-automation"
import { suggestionFactsFromPreop, type SuggestionContext, type SuggestionPreopRecord } from "@lospor/core/intraop-suggestions"
import type { LabResult } from "@lospor/core/labs"
import { preopAgeDays, type VitalQuestionContext, type VitalStatsTable } from "@lospor/core/vital-questions"
import { likelyNext, parseSuccessionLinks, successionContext, successionDismissedIds, SUCCESSION_ANSWER_KIND, SUCCESSION_DISMISS_ANSWER, type LikelyEvent, type SuccessionLink, type SuccessionStructuredRecords } from "@lospor/core/event-succession"
import type { IntraopEventOps } from "@lospor/core/intraop-timetable-edit"
import { randomId } from "@/lib/random-id"
import { serverNow } from "@/lib/intraop-clock"
import { readWebClinicalPreferences, syncWebClinicalPreferences } from "@/lib/clinical-preferences-web"

/**
 * Intraoperative automation (10.1.0) on the web: what the hospital switched
 * on in Status and the reading counts the vitals questions are measured
 * against -- the same response the PWA reads. Until that response is read,
 * automation remains off rather than silently using Core's shared defaults.
 */
type Automation = {
  settings: IntraopAutomationSettings
  stats: VitalStatsTable | null
  succession: SuccessionLink[]
  /** A policy has been read from the API for this session (or from a prior successful read). */
  ready: boolean
  /** The first policy read failed; do not silently run the shared defaults. */
  unavailable: boolean
}

let loading: Promise<Automation> | null = null

async function fetchIntraopAutomation(): Promise<Automation> {
  if (loading) return loading
  loading = fetch("/api/intraop/automation", { cache: "no-store" })
    .then(response => {
      if (!response.ok) throw new Error(`automation policy request failed: ${response.status}`)
      return response.json()
    })
    .then(body => {
      if (body == null) throw new Error("automation policy response was empty")
      return parseIntraopAutomationResponse(body)
    })
    .finally(() => { loading = null })
  return loading
}

export function parseIntraopAutomationResponse(value: unknown): Automation {
  const body = typeof value === "object" && value !== null ? value as Record<string, unknown> : {}
  const settings = parseIntraopAutomation(body.settings)
  const stats = vitalQuestionsEnabled(settings) && typeof body.stats === "object" && body.stats !== null
    ? body.stats as VitalStatsTable
    : null
  // What usually comes next (10.2.0): the starting values and what the cases show, sent while the reminders are on.
  return { settings, stats, succession: parseSuccessionLinks(body.succession), ready: true, unavailable: false }
}

export function useIntraopAutomation(): Automation & { reload: () => Promise<void> } {
  const [automation, setAutomation] = useState<Automation>({
    settings: DEFAULT_INTRAOP_AUTOMATION,
    stats: null,
    succession: [],
    ready: false,
    unavailable: false,
  })
  const reload = async () => {
    try {
      setAutomation(await fetchIntraopAutomation())
    } catch {
      setAutomation(current => ({ ...current, unavailable: true }))
    }
  }
  useEffect(() => {
    let active = true
    fetchIntraopAutomation()
      .then(next => {
        if (active) setAutomation(next)
      })
      .catch(() => {
        if (!active) return
        // A previously successful policy remains safe to use mid-case, but the
        // initial render must never silently fall back to Core's shared demo default.
        setAutomation(current => ({ ...current, unavailable: true }))
      })
    return () => { active = false }
  }, [])
  return { ...automation, reload }
}

type PreopAge = { ageValue?: number | null; ageUnit?: string | null; ageYears?: number | null; ageApproxDays?: number | null } | null | undefined

/**
 * What the vitals questions need on this form, or null when they are not
 * asked here: switched off, the patient's age unknown, or the case being
 * edited on another screen (read-only) -- the screen that holds it asks.
 */
export function useVitalQuestionContext(preop: PreopAge, readOnly: boolean): VitalQuestionContext | null {
  const { settings, stats, ready } = useIntraopAutomation()
  const { keepLogging, user } = useAutomationPreferences()
  const ageDays = preopAgeDays(preop ?? null)
  return useMemo(() => {
    if (ready === false || readOnly || !vitalQuestionsEnabled(settings, user) || ageDays == null) return null
    return { settings, user, stats, ageDays, keepLogging }
  }, [ready, readOnly, settings, stats, ageDays, keepLogging, user])
}

/** The clinician's own switches (Settings): keep logging, and the groups turned off (10.2.0). */
function useAutomationPreferences(): { keepLogging: boolean; user: UserAutomationSwitches } {
  const [preferences, setPreferences] = useState(() => readWebClinicalPreferences())
  useEffect(() => {
    void syncWebClinicalPreferences().then(setPreferences).catch(() => {})
  }, [])
  return useMemo(
    () => ({
      keepLogging: preferences.vitalEpisodeAutoLog,
      user: { ...(preferences.automationGroups ?? {}), automationLines: preferences.automationLines ?? {} },
    }),
    [preferences],
  )
}

/**
 * The events likely to come next on this case (10.2.0): at most two, only ones not yet charted, once the usual gap has
 * passed after the event they follow. Nothing when the reminders are off in Status or for this clinician, or the case
 * is held on another screen. What is likely, and why, is Core's (event-succession); this only hands it the case.
 */
export function useLikelyEvents(args: {
  log: ReadonlyArray<{ type: string; label?: string | null; ts: string }>
  structured?: SuccessionStructuredRecords
  techniques: readonly string[]
  child: boolean
  enabled: boolean
  onEventOps?: (ops: IntraopEventOps) => void | Promise<void>
}): { likely: LikelyEvent[]; dismiss: (suggestionId: string) => void } {
  const { settings, succession, ready } = useIntraopAutomation()
  const { user } = useAutomationPreferences()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  const { log, techniques, child, enabled } = args
  const likely = useMemo(() => {
    if (ready === false || !enabled) return []
    return likelyNext({
      log: log.filter(event => event.type === "clinical_event").map(event => ({ label: event.label, ts: event.ts })),
      structured: args.structured,
      context: successionContext(techniques, child), links: succession, now, dismissed: successionDismissedIds(log), settings, user,
    })
  }, [ready, enabled, log, techniques, child, succession, now, settings, user, args.structured])
  return {
    likely,
    dismiss: suggestionId => {
      if (!args.onEventOps || !suggestionId.startsWith("succession:")) return
      const ts = serverNow().toISOString()
      void args.onEventOps({
        add: [{ id: randomId(), ts, type: "prompt_answer", answerKind: SUCCESSION_ANSWER_KIND, answerFor: suggestionId, answer: SUCCESSION_DISMISS_ANSWER, suggestion: suggestionId, recordedAt: ts }],
        update: [], remove: [],
      })
    },
  }
}

/** What the screen knows of the case beyond the preop record. */
export type SuggestionCaseFacts = {
  idealWeightKg?: number | null
  tofMonitor?: boolean | null
  labs?: readonly LabResult[] | null
  bloodLossMl?: number | null
  startedAt?: string | null
  endedAt?: string | null
  techniques?: readonly string[]
  techniqueSides?: Record<string, "LEFT" | "RIGHT" | "BOTH">
  airwayDevices?: readonly string[]
  airwayDeviceEntries?: readonly Record<string, unknown>[]
  timeZone?: string | null
}

/**
 * What the suggestions (10.2.0) need on this form, or null when none are
 * asked here: every group off (in Status, or by this clinician), or the case
 * held on another screen. "now" is left to the attention hook, which ticks.
 */
export function useSuggestionContext(
  preop: SuggestionPreopRecord | null | undefined,
  facts: SuggestionCaseFacts,
  readOnly: boolean,
): Omit<SuggestionContext, "now"> | null {
  const { settings, ready } = useIntraopAutomation()
  const { keepLogging, user } = useAutomationPreferences()
  const { idealWeightKg, tofMonitor, labs, bloodLossMl, startedAt, endedAt, techniques, techniqueSides, airwayDevices, airwayDeviceEntries, timeZone } = facts
  const base = useMemo(() => suggestionFactsFromPreop(preop, idealWeightKg), [preop, idealWeightKg])
  return useMemo(() => {
    if (ready === false || readOnly || !AUTOMATION_GROUPS.some(group => automationGroupEnabled(settings, group, user))) return null
    return {
      settings,
      user,
      patient: base.patient,
      preop: base.preop,
      tofMonitor: tofMonitor === true,
      keepLogging,
      labs: labs ?? [],
      bloodLossMl: bloodLossMl ?? null,
      startedAt: startedAt ?? null,
      endedAt: endedAt ?? null,
      techniques: techniques ?? [],
      techniqueSides,
      airwayDevices,
      airwayDeviceEntries,
      timeZone: timeZone ?? null,
    }
  }, [ready, readOnly, settings, user, base, tofMonitor, keepLogging, labs, bloodLossMl, startedAt, endedAt, techniques, techniqueSides, airwayDevices, airwayDeviceEntries, timeZone])
}
