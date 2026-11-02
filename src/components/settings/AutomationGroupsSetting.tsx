"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { AUTOMATION_GROUPS, vitalQuestionsEnabled, type UserAutomationSwitch, type UserAutomationSwitches } from "@lospor/core/intraop-automation"
import { patchWebClinicalPreferences, readWebClinicalPreferences, syncWebClinicalPreferences } from "@/lib/clinical-preferences-web"
import { useIntraopAutomation } from "@/lib/use-intraop-automation"
import { SettingRow, Toggle } from "./SettingControls"

/**
 * The intraoperative suggestions a clinician keeps (10.2.0). Only what the
 * hospital switched on in Status is listed: off there is off for everyone.
 * Each is on until turned off here; the same account setting the PWA shows.
 * The whole set is sent each time, so one switch never clears another.
 */
export function AutomationGroupsSetting() {
  const t = useTranslations("settings.automationGroups")
  const { settings } = useIntraopAutomation()
  const [mine, setMine] = useState<UserAutomationSwitches>(() => readWebClinicalPreferences().automationGroups ?? {})
  useEffect(() => {
    void syncWebClinicalPreferences().then(preferences => setMine(preferences.automationGroups ?? {})).catch(() => {})
  }, [])
  if (!settings.enabled) return null
  const offered: UserAutomationSwitch[] = [
    ...(vitalQuestionsEnabled(settings) ? ["vitalQuestions" as const] : []),
    ...AUTOMATION_GROUPS.filter(group => settings.groups[group]),
  ]
  if (offered.length === 0) return null
  function set(key: UserAutomationSwitch, on: boolean) {
    const next = { ...mine, [key]: on }
    setMine(next)
    void patchWebClinicalPreferences({ automationGroups: next })
  }
  return (
    <div data-testid="automation-groups-setting">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mt-4 mb-1">{t("title")}</p>
      {offered.map(key => (
        <SettingRow key={key} label={t(`${key}.label`)} description={t(`${key}.desc`)}>
          <Toggle value={mine[key] !== false} onChange={value => set(key, value)} />
        </SettingRow>
      ))}
    </div>
  )
}
