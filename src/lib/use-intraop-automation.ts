"use client"

import { useEffect, useMemo, useState } from "react"
import { DEFAULT_INTRAOP_AUTOMATION, parseIntraopAutomation, vitalQuestionsEnabled, type IntraopAutomationSettings } from "@lospor/core/intraop-automation"
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
  const [keepLogging, setKeepLogging] = useState(() => readWebClinicalPreferences().vitalEpisodeAutoLog)
  useEffect(() => {
    void syncWebClinicalPreferences().then(preferences => setKeepLogging(preferences.vitalEpisodeAutoLog)).catch(() => {})
  }, [])
  const ageDays = preopAgeDays(preop ?? null)
  return useMemo(() => {
    if (readOnly || !vitalQuestionsEnabled(settings) || ageDays == null) return null
    return { settings, stats, ageDays, keepLogging }
  }, [readOnly, settings, stats, ageDays, keepLogging])
}
