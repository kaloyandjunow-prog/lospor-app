"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import type { EquipmentScreen } from "@lospor/core/clinical-preferences"
import { patchWebClinicalPreferences, readWebClinicalPreferences, syncWebClinicalPreferences } from "@/lib/clinical-preferences-web"

/**
 * Which Equipment tab this clinician sees (10.2.0): Smart selection, the default, or the
 * legacy tab as it was. The same account setting the phone shows.
 */
const SCREENS: readonly EquipmentScreen[] = ["smart", "legacy"]

export function EquipmentScreenSetting() {
  const t = useTranslations("settings.equipmentScreen")
  const [screen, setScreen] = useState<EquipmentScreen>(() => readWebClinicalPreferences().equipmentScreen ?? "smart")
  useEffect(() => {
    void syncWebClinicalPreferences().then(preferences => setScreen(preferences.equipmentScreen ?? "smart")).catch(() => {})
  }, [])
  function pick(next: EquipmentScreen) {
    setScreen(next)
    void patchWebClinicalPreferences({ equipmentScreen: next })
  }
  return (
    <div className="py-3" data-testid="equipment-screen-setting">
      <p className="text-sm font-medium">{t("title")}</p>
      <p className="text-xs text-slate-500 mb-2">{t("desc")}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {SCREENS.map(option => (
          <button key={option} type="button" aria-pressed={screen === option} data-testid={`equipment-screen-${option}`} onClick={() => pick(option)}
            className={`text-left rounded-xl border-2 p-3 ${screen === option ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30" : "border-slate-200 dark:border-[#333] hover:border-violet-400"}`}>
            <span className="block text-sm font-semibold">{t(option)}</span>
            <span className="block text-xs text-slate-500">{t(`${option}Hint`)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
