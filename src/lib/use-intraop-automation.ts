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
import { readWebClinicalPreferences, syncWebClinicalPreferences } from "@/lib/clinical-preferences-web"

/**
 * Intraoperative automation (10.1.0) on the web: what the hospital switched
 * on in Status and the reading counts the vitals questions are measured
 * against -- the same response the PWA reads. Off, or before the first read,
 * nothing is asked; the public demo has no Status and stays off.
 */
type Automation = { settings: IntraopAutomationSettings; stats: VitalStatsTable | null }

let cached: Automation | null = null

export function parseIntraopAutomationResponse(value: unknown): Automation {
  const body = typeof value === "object" && value !== null ? value as Record<string, unknown> : {}
  const settings = parseIntraopAutomation(body.settings)
  const stats = vitalQuestionsEnabled(settings) && typeof body.stats === "object" && body.stats !== null
    ? body.stats as VitalStatsTable
    : null
  return { settings, stats }
}

export function useIntraopAutomation(): Automation {
  const [automation, setAutomation] = useState<Automation>(cached ?? { settings: DEFAULT_INTRAOP_AUTOMATION, stats: null })
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
