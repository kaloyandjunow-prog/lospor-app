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
import { likelyNext, parseSuccessionLinks, successionContext, type LikelyEvent, type SuccessionLink } from "@lospor/core/event-succession"
import { readWebClinicalPreferences, syncWebClinicalPreferences } from "@/lib/clinical-preferences-web"

/**
 * Intraoperative automation (10.1.0) on the web: what the hospital switched
 * on in Status and the reading counts the vitals questions are measured
 * against -- the same response the PWA reads. Off, or before the first read,
 * nothing is asked; the public demo has no Status and stays off.
 */
type Automation = { settings: IntraopAutomationSettings; stats: VitalStatsTable | null; succession: SuccessionLink[] }

let cached: Automation | null = null

export function parseIntraopAutomationResponse(value: unknown): Automation {
  const body = typeof value === "object" && value !== null ? value as Record<string, unknown> : {}
  const settings = parseIntraopAutomation(body.settings)
  const stats = vitalQuestionsEnabled(settings) && typeof body.stats === "object" && body.stats !== null
    ? body.stats as VitalStatsTable
    : null
  // What usually comes next (10.2.0): the starting values and what the cases show, sent while the reminders are on.
  return { settings, stats, succession: parseSuccessionLinks(body.succession) }
}

export function useIntraopAutomation(): Automation {
  const [automation, setAutomation] = useState<Automation>(cached ?? { settings: DEFAULT_INTRAOP_AUTOMATION, stats: null, succession: [] })
  useEffect(() => {
    let active = true
    fetch("/api/intraop/automation", { cache: "no-store" })
      .then(response => (response.ok ? response.json() : null))
      .then(body => {
        if (!active || body == null) return
        cached = parseIntraopAutomationResponse(body)
        setAutomation(cached)
      })
      .catch(() => { /* keep what was last read */ })
    return () => { active = false }
  }, [])
  return automation
}

type PreopAge = { ageValue?: number | null; ageUnit?: string | null; ageYears?: number | null; ageApproxDays?: number | null } | null | undefined

/**
 * What the vitals questions need on this form, or null when they are not
 * asked here: switched off, the patient's age unknown, or the case being
 * edited on another screen (read-only) -- the screen that holds it asks.
 */
export function useVitalQuestionContext(preop: PreopAge, readOnly: boolean): VitalQuestionContext | null {
  const { settings, stats } = useIntraopAutomation()
  const { keepLogging, user } = useAutomationPreferences()
  const ageDays = preopAgeDays(preop ?? null)
  return useMemo(() => {
    if (readOnly || !vitalQuestionsEnabled(settings, user) || ageDays == null) return null
    return { settings, stats, ageDays, keepLogging }
  }, [readOnly, settings, stats, ageDays, keepLogging, user])
}

/** The clinician's own switches (Settings): keep logging, and the groups turned off (10.2.0). */
function useAutomationPreferences(): { keepLogging: boolean; user: UserAutomationSwitches } {
  const [preferences, setPreferences] = useState(() => readWebClinicalPreferences())
  useEffect(() => {
    void syncWebClinicalPreferences().then(setPreferences).catch(() => {})
  }, [])
  return useMemo(
    () => ({ keepLogging: preferences.vitalEpisodeAutoLog, user: preferences.automationGroups ?? {} }),
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
  techniques: readonly string[]
  child: boolean
  enabled: boolean
}): { likely: LikelyEvent[]; dismiss: (event: string) => void } {
  const { settings, succession } = useIntraopAutomation()
  const { user } = useAutomationPreferences()
  const [dismissed, setDismissed] = useState<string[]>([])
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  const { log, techniques, child, enabled } = args
  const likely = useMemo(() => {
    if (!enabled) return []
    return likelyNext({
      log: log.filter(event => event.type === "clinical_event").map(event => ({ label: event.label, ts: event.ts })),
      context: successionContext(techniques, child), links: succession, now, dismissed, settings, user,
    })
  }, [enabled, log, techniques, child, succession, now, dismissed, settings, user])
  return { likely, dismiss: (event: string) => setDismissed(current => (current.includes(event) ? current : [...current, event])) }
}

/** What the screen knows of the case beyond the preop record. */
export type SuggestionCaseFacts = {
  idealWeightKg?: number | null
  tofMonitor?: boolean | null
  labs?: readonly LabResult[] | null
  bloodLossMl?: number | null
  startedAt?: string | null
  endedAt?: string | null
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
  const { settings } = useIntraopAutomation()
  const { keepLogging, user } = useAutomationPreferences()
  const { idealWeightKg, tofMonitor, labs, bloodLossMl, startedAt, endedAt } = facts
  const base = useMemo(() => suggestionFactsFromPreop(preop, idealWeightKg), [preop, idealWeightKg])
  return useMemo(() => {
    if (readOnly || !AUTOMATION_GROUPS.some(group => automationGroupEnabled(settings, group, user))) return null
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
    }
  }, [readOnly, settings, user, base, tofMonitor, keepLogging, labs, bloodLossMl, startedAt, endedAt])
}
