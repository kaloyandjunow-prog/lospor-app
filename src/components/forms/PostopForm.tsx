"use client"

import { useForm, Controller, type Resolver } from "react-hook-form"
import { useEffect } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useTranslations, useLocale } from "next-intl"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ChevronLeft, Save } from "lucide-react"
import { NumberStepper } from "@/components/NumberStepper"
import { ConvertedStepper } from "@/components/ConvertedStepper"
import { useOptionLibrary, useRange } from "@/hooks/useOptionLibrary"

const schema = z.object({
  aldreteActivity:      z.coerce.number().min(0).max(2).optional(),
  aldreteRespiration:   z.coerce.number().min(0).max(2).optional(),
  aldreteCirculation:   z.coerce.number().min(0).max(2).optional(),
  aldreteConsciousness: z.coerce.number().min(0).max(2).optional(),
  aldreteSpO2:          z.coerce.number().min(0).max(2).optional(),
  recoveryBpSystolic:  z.coerce.number().optional(),
  recoveryBpDiastolic: z.coerce.number().optional(),
  recoveryHeartRate:   z.coerce.number().optional(),
  recoverySpO2:        z.coerce.number().optional(),
  painScoreNRS:       z.coerce.number().min(0).max(10).optional(),
  ponv:               z.boolean().default(false),
  temperatureCelsius: z.coerce.number().optional(),
  recoveryBpUnobtainable:          z.boolean().default(false),
  recoveryHeartRateUnobtainable:   z.boolean().default(false),
  recoverySpO2Unobtainable:        z.boolean().default(false),
  recoveryTemperatureUnobtainable: z.boolean().default(false),
  disposition:      z.enum(["WARD", "PACU", "ICU"]).optional(),
  dispositionNotes: z.string().optional(),
  handoverItems:    z.array(z.string()).default([]),
})

export type PostopData = z.infer<typeof schema>

function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min }

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base text-slate-700 dark:text-slate-200">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

type AldreteKey = "aldreteActivity" | "aldreteRespiration" | "aldreteCirculation" | "aldreteConsciousness" | "aldreteSpO2"

const SCORE_COLORS = [
  "bg-red-500 border-red-500 text-white dark:bg-red-700 dark:border-red-600",
  "bg-amber-500 border-amber-500 text-white dark:bg-amber-700 dark:border-amber-600",
  "bg-green-500 border-green-500 text-white dark:bg-green-700 dark:border-green-600",
]
const UNSELECTED = "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#555] hover:bg-slate-50 dark:hover:bg-[#1e1e1e]"

export type HandoverGroup = { group: string; items: { code: string; label: string }[] }

// Maps legacy codes (web-old or mobile-old) → canonical code
export const HANDOVER_CODE_ALIASES: Record<string, string> = {
  obs_q15: "obs_freq", obs_q30: "spo2_cont", obs_bp: "alert_bp", obs_temp: "temp_monitor",
  o2_therapy: "o2_supp", pain_regular: "analgesia_protocol", pain_pca: "pca",
  pain_threshold: "alert_pain", antiemetic: "antiemetic_prn", regular_meds: "resume_meds",
  dvt_chemical: "dvt_lmwh", pending_labs: "bloods", pending_imaging: "cxr",
  consult_request: "pain_team",
}
export function normaliseHandoverCodes(codes: string[]): string[] {
  return codes.map(c => HANDOVER_CODE_ALIASES[c] ?? c)
}

export const HANDOVER_GROUPS_EN: HandoverGroup[] = [
  { group: "Vital Signs & Monitoring", items: [
    { code: "obs_freq",     label: "Observations q15 min × 1h, then q30 min × 1h" },
    { code: "spo2_cont",    label: "Continuous SpO₂ monitoring" },
    { code: "alert_bp",     label: "Blood pressure — target range communicated" },
    { code: "temp_monitor", label: "Temperature monitoring / active warming" },
    { code: "urine_output", label: "Urine output monitoring (IDC in situ)" },
    { code: "glucose",      label: "Serum/peripheral glucose monitoring" },
  ]},
  { group: "Airway & Oxygen", items: [
    { code: "o2_supp",        label: "Supplemental O₂ — rate and duration specified" },
    { code: "npo",            label: "Fasting status / nil by mouth until fully awake" },
    { code: "diet_advance",   label: "Advance diet when tolerating" },
    { code: "alert_resp",     label: "Alert if SpO₂ < 92% or RR < 8 or > 25/min" },
    { code: "airway_alert",   label: "Difficult airway — alert at bedside" },
    { code: "airway_position",label: "Position: head up / lateral / as specified" },
  ]},
  { group: "Cardiovascular", items: [
    { code: "piv",              label: "Peripheral IV in situ" },
    { code: "cvk",              label: "Central venous catheter in situ" },
    { code: "art_line",         label: "Arterial line in situ" },
    { code: "alert_hr",         label: "Alert if HR < 50 or > 120 bpm" },
    { code: "fluid_plan",       label: "IV fluid plan — type, rate, volume specified" },
    { code: "fluid_balance",    label: "Fluid balance monitoring and documentation" },
    { code: "antihypertensive", label: "Antihypertensive medications resumed / held" },
    { code: "anticoagulation",  label: "Anticoagulation plan documented" },
  ]},
  { group: "Pain", items: [
    { code: "analgesia_protocol", label: "Regular analgesic schedule prescribed" },
    { code: "pca",                label: "PCA / epidural — pump settings checked" },
    { code: "epidural_catheter",  label: "Epidural catheter — pain team to review" },
    { code: "nerve_catheter",     label: "Peripheral nerve catheter in situ" },
    { code: "pain_rescue",        label: "Rescue analgesia — drug, dose, frequency" },
    { code: "alert_pain",         label: "Alert if NRS pain score > 4 at rest" },
  ]},
  { group: "PONV & GI", items: [
    { code: "antiemetic_prn", label: "Antiemetics PRN / antiemetic regime prescribed" },
    { code: "ponv_protocol",  label: "PONV prophylaxis" },
    { code: "oral_intake",    label: "Resume oral intake when tolerating" },
    { code: "ngt",            label: "NGT in situ — position confirmed / output documented" },
  ]},
  { group: "Medications & Prophylaxis", items: [
    { code: "resume_meds",  label: "Regular medications resumed / held — list confirmed" },
    { code: "dvt_lmwh",     label: "Chemical DVT prophylaxis — LMWH dose and timing" },
    { code: "dvt_mechanical",label: "Mechanical DVT prophylaxis — compression stockings / IPC" },
    { code: "mobilisation",  label: "Early mobilisation plan documented" },
    { code: "stress_ulcer",  label: "Stress ulcer prophylaxis" },
    { code: "antibiotics",   label: "Antibiotics per surgical plan / course continued" },
    { code: "insulin",       label: "Insulin / diabetic management protocol active" },
    { code: "steroids",      label: "Steroid supplementation if applicable" },
  ]},
  { group: "Investigations", items: [
    { code: "bloods",   label: "Blood tests in ___ hours" },
    { code: "ecg",      label: "12-lead ECG" },
    { code: "cxr",      label: "Chest X-ray / pending imaging follow-up" },
  ]},
  { group: "Consultations & Follow-up", items: [
    { code: "pain_team",  label: "Pain management team review" },
    { code: "physio",     label: "Physiotherapy" },
    { code: "dietitian",  label: "Dietitian / nutritional support" },
    { code: "wound_care", label: "Wound / drain care instructions documented" },
    { code: "follow_up",  label: "Follow-up appointment / plan communicated" },
  ]},
]

export const HANDOVER_GROUPS_BG: HandoverGroup[] = [
  { group: "Витални показатели и мониториране", items: [
    { code: "obs_freq",     label: "Мониториране на 15 мин × 1ч, след това на 30 мин" },
    { code: "spo2_cont",    label: "Непрекъснато мониториране на SpO₂" },
    { code: "alert_bp",     label: "АН — целеви диапазон е съобщен" },
    { code: "temp_monitor", label: "Контрол на температурата / активно затопляне" },
    { code: "urine_output", label: "Мониториране на диурезата (уринарен катетър)" },
    { code: "glucose",      label: "Мониториране на кръвна захар" },
  ]},
  { group: "Дихателни пътища и кислород", items: [
    { code: "o2_supp",         label: "Кислородотерапия — скорост и продължителност са уточнени" },
    { code: "npo",             label: "Режим на гладуване / хранене е уточнен" },
    { code: "diet_advance",    label: "Захранване при поносимост" },
    { code: "alert_resp",      label: "Сигнализирай при SpO₂ < 92% или ДЧ < 8 или > 25/мин" },
    { code: "airway_alert",    label: "Труден дихателен път — сигнализирай при нужда" },
    { code: "airway_position", label: "Позиция: повдигнат горен край / странично / по предписание" },
  ]},
  { group: "Сърдечно-съдова система", items: [
    { code: "piv",              label: "Периферен венозен катетър (ПВК)" },
    { code: "cvk",              label: "Централен венозен катетър (ЦВК)" },
    { code: "art_line",         label: "Артериална линия" },
    { code: "alert_hr",         label: "Сигнализирай при СЧ < 50 или > 120 уд/мин" },
    { code: "fluid_plan",       label: "План за венозни течности — вид, скорост, обем е уточнен" },
    { code: "fluid_balance",    label: "Мониториране и документиране на воден баланс" },
    { code: "antihypertensive", label: "Антихипертензивни медикаменти — подновени / задържани" },
    { code: "anticoagulation",  label: "План за антикоагулация е документиран" },
  ]},
  { group: "Обезболяване", items: [
    { code: "analgesia_protocol", label: "Редовна аналгезия по протокол" },
    { code: "pca",                label: "ПКА / епидурал — настройките на помпата са проверени" },
    { code: "epidural_catheter",  label: "Епидурален катетър — за преглед от екип по болкова терапия" },
    { code: "nerve_catheter",     label: "Периферен нервен катетър" },
    { code: "pain_rescue",        label: "Резервна аналгезия — медикамент, доза, честота" },
    { code: "alert_pain",         label: "Сигнализирай при NRS > 4 в покой" },
  ]},
  { group: "ПОНВ и стомашно-чревна система", items: [
    { code: "antiemetic_prn", label: "Антиеметици при нужда / схема е предписана" },
    { code: "ponv_protocol",  label: "Профилактика на ПОНВ" },
    { code: "oral_intake",    label: "Захранване при поносимост" },
    { code: "ngt",            label: "НГС — позицията е потвърдена / отделянето е документирано" },
  ]},
  { group: "Медикаменти и профилактика", items: [
    { code: "resume_meds",   label: "Редовните медикаменти са подновени / задържани — списъкът е потвърден" },
    { code: "dvt_lmwh",      label: "Медикаментозна ДВТ профилактика — НМХ доза и час" },
    { code: "dvt_mechanical", label: "Механична ДВТ профилактика — чорапи / пневматична компресия" },
    { code: "mobilisation",   label: "Ранна мобилизация е планирана" },
    { code: "stress_ulcer",   label: "Профилактика на стрес-язва" },
    { code: "antibiotics",    label: "Антибиотичен курс е продължен / завършен" },
    { code: "insulin",        label: "Инсулин / диабетен протокол е активен" },
    { code: "steroids",       label: "Кортикостероидна суплементация при необходимост" },
  ]},
  { group: "Изследвания", items: [
    { code: "bloods",   label: "Кръвни изследвания след ___ часа" },
    { code: "ecg",      label: "12-отвеждащ ЕКГ" },
    { code: "cxr",      label: "Образни изследвания — проследяването е организирано" },
  ]},
  { group: "Консултации и проследяване", items: [
    { code: "pain_team",  label: "Преглед от екип по болкова терапия" },
    { code: "physio",     label: "Физиотерапия" },
    { code: "dietitian",  label: "Диетолог / нутритивна подкрепа" },
    { code: "wound_care", label: "Инструкции за грижа за раната / дренажа са документирани" },
    { code: "follow_up",  label: "Контролен преглед / план е съобщен" },
  ]},
]

export function PostopForm({ onSubmit, onBack, submitting, onAutoSave, defaultValues, rejectedFields }: {
  onSubmit: (data: PostopData) => void
  onBack: () => void
  submitting?: boolean
  onAutoSave?: (data: PostopData) => void
  initialComplicationsText?: string
  defaultValues?: Partial<PostopData>
  /** Values the server refused, keyed by field, shown beside the field itself. */
  rejectedFields?: Map<string, string>
}) {
  const t      = useTranslations()
  const locale = useLocale()
  const lbl = (opt: { label: string; labelBg: string | null }) => (locale === "bg" && opt.labelBg) ? opt.labelBg : opt.label
  const { options: dispositionOptions } = useOptionLibrary("DISPOSITION")
  const { options: handoverOptions }    = useOptionLibrary("HANDOVER_ITEM")
  const HANDOVER_GROUPS: HandoverGroup[] = handoverOptions
    .filter(o => !o.parentId)
    .map(group => ({
      group: lbl(group),
      items: handoverOptions.filter(o => o.parentId === group.id).map(item => ({ code: item.value, label: lbl(item) })),
    }))
  const recoveryBpSystolicRange  = useRange("BP_SYSTOLIC_RANGE")
  const recoveryBpDiastolicRange = useRange("BP_DIASTOLIC_RANGE")
  const recoveryHeartRateRange   = useRange("HEART_RATE_RANGE")
  const recoverySpo2Range        = useRange("SPO2_RANGE")
  const recoveryTemperatureRange = useRange("TEMPERATURE_RANGE")
  const painNrsRange             = useRange("PAIN_NRS_RANGE")
  const { register, handleSubmit, control, watch, setValue, getValues } = useForm<PostopData>({
    // Same zod-v4/react-hook-form resolver-typing friction as IntraopForm.tsx/PreopForm.tsx
    resolver: zodResolver(schema) as Resolver<PostopData>,
    defaultValues: {
      ponv: false,
      handoverItems: [],
      // Recovery vitals — same ranges + random pre-fill as the preop exam form
      recoveryBpSystolic:  randInt(120, 130),
      recoveryBpDiastolic: randInt(70, 85),
      recoveryHeartRate:   randInt(60, 90),
      recoverySpO2:        randInt(95, 99),
      temperatureCelsius:  parseFloat((36 + Math.random()).toFixed(1)),
      ...Object.fromEntries(Object.entries(defaultValues ?? {}).filter(([, v]) => v !== undefined && v !== null)),
      ...(defaultValues?.handoverItems ? { handoverItems: normaliseHandoverCodes(defaultValues.handoverItems) } : {}),
    },
  })

  // eslint-disable-next-line react-hooks/incompatible-library
  const allValues = watch()
  const allValuesKey = JSON.stringify(allValues)
  useEffect(() => {
    if (!onAutoSave) return
    const timer = setTimeout(() => onAutoSave(getValues()), 1500)
    return () => clearTimeout(timer)
  }, [allValuesKey, getValues, onAutoSave])

  const aldreteVals = watch(["aldreteActivity","aldreteRespiration","aldreteCirculation","aldreteConsciousness","aldreteSpO2"])
  const aldreteTotal = aldreteVals.reduce<number>((sum, v) => sum + (v != null ? parseInt(String(v), 10) || 0 : 0), 0)
  const aldreteColor = aldreteTotal >= 9 ? "default" : aldreteTotal >= 7 ? "secondary" : "destructive"
  const disposition   = watch("disposition")
  const handoverItems = watch("handoverItems") ?? []
  const [recoveryBpUTO, recoveryHeartRateUTO, recoverySpo2UTO, recoveryTemperatureUTO] =
    watch(["recoveryBpUnobtainable", "recoveryHeartRateUnobtainable", "recoverySpO2Unobtainable", "recoveryTemperatureUnobtainable"])

  useEffect(() => {
    if (disposition === "WARD" || disposition === "PACU") return
    if (handoverItems.length) setValue("handoverItems", [], { shouldDirty: true })
    if (getValues("dispositionNotes")) setValue("dispositionNotes", "", { shouldDirty: true })
  }, [disposition, getValues, handoverItems.length, setValue])

  const ALDRETE_CRITERIA: { key: AldreteKey; labelKey: string; scoreKeys: string[] }[] = [
    { key: "aldreteActivity",      labelKey: "postop.activity",      scoreKeys: ["postop.aldrete.activity0",      "postop.aldrete.activity1",      "postop.aldrete.activity2"] },
    { key: "aldreteRespiration",   labelKey: "postop.respiration",   scoreKeys: ["postop.aldrete.respiration0",   "postop.aldrete.respiration1",   "postop.aldrete.respiration2"] },
    { key: "aldreteCirculation",   labelKey: "postop.circulation",   scoreKeys: ["postop.aldrete.circulation0",   "postop.aldrete.circulation1",   "postop.aldrete.circulation2"] },
    { key: "aldreteConsciousness", labelKey: "postop.consciousness", scoreKeys: ["postop.aldrete.consciousness0", "postop.aldrete.consciousness1", "postop.aldrete.consciousness2"] },
    { key: "aldreteSpO2",          labelKey: "postop.spO2",          scoreKeys: ["postop.aldrete.spO20",          "postop.aldrete.spO21",          "postop.aldrete.spO22"] },
  ]

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

      {/* Modified Aldrete Score */}
      <div data-tour="postop-aldrete">
      <SectionCard title={t("postop.aldreteSection")}>
        <div className="space-y-5">
          {ALDRETE_CRITERIA.map(({ key, labelKey, scoreKeys }) => (
            <Controller key={key} name={key} control={control} render={({ field }) => (
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">{t(labelKey)}</p>
                <div className="grid grid-cols-3 gap-2">
                  {scoreKeys.map((sk, i) => {
                    const selected = Number(field.value) === i
                    return (
                      <button key={i} type="button"
                        onClick={() => field.onChange(selected ? undefined : i)}
                        className={`rounded-xl border-2 p-2.5 text-center transition-all ${selected ? SCORE_COLORS[i] + " scale-105 shadow-sm" : UNSELECTED}`}>
                        <div className="text-xl font-bold leading-none">{i}</div>
                        <div className="text-[10px] mt-1 leading-tight opacity-90">{String(t(sk)).replace(/^\d+\s*[—–-]\s*/, '')}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )} />
          ))}

          <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-[#2a2a2a]">
            <span className="font-semibold text-slate-700 dark:text-slate-200">{t("postop.aldreteTotal")}:</span>
            <Badge variant={aldreteColor} className="text-base px-3 py-1">{aldreteTotal} / 10</Badge>
            {aldreteTotal >= 9 && <span className="text-sm text-green-600 dark:text-green-400">{t("postop.aldreteReady")}</span>}
            {aldreteTotal < 9  && <span className="text-sm text-amber-600 dark:text-amber-400">{t("postop.aldreteMonitor")}</span>}
          </div>
        </div>
      </SectionCard>
      </div>{/* /postop-aldrete */}

      {/* Recovery */}
      <div data-tour="postop-recovery">
      <SectionCard title={t("postop.recoverySection")}>
        {/* Recovery vitals — SBP / DBP / HR / SpO₂ / Temperature (mirrors preop) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* BP */}
          <div className="space-y-2 sm:col-span-2">
            {/* Recovery observations are all numeric, so one summary above them
                reaches every field the server can refuse without threading a
                note through each control. */}
            {rejectedFields && rejectedFields.size > 0 && (
              <p className="text-red-500 text-xs mb-2" role="status">
                {[...rejectedFields.values()].join(" · ")}
              </p>
            )}
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("preop.bloodPressure")}</Label>
              <button type="button"
                onClick={() => { const next = !recoveryBpUTO; setValue("recoveryBpUnobtainable", next); if (next) { setValue("recoveryBpSystolic", undefined); setValue("recoveryBpDiastolic", undefined) } }}
                className={`text-xs px-2.5 py-1 rounded-full border transition-all ${recoveryBpUTO ? "bg-slate-200 border-slate-400 text-slate-700 font-semibold" : "border-slate-200 text-slate-400 hover:border-slate-300"}`}>
                {t("preop.unableToObtain")}
              </button>
            </div>
            {recoveryBpUTO ? (
              <p className="text-sm text-slate-400 italic py-2">{t("preop.unableToObtain")}</p>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-xs text-slate-400 text-center mb-1">{t("preop.systolic")}</p>
                  <Controller name="recoveryBpSystolic" control={control} render={({ field }) => (
                    <NumberStepper value={field.value} onChange={field.onChange} min={recoveryBpSystolicRange.min} max={recoveryBpSystolicRange.max} step={recoveryBpSystolicRange.step} showSlider />
                  )} />
                </div>
                <span className="text-2xl font-light text-slate-300 mt-4">/</span>
                <div className="flex-1">
                  <p className="text-xs text-slate-400 text-center mb-1">{t("preop.diastolic")}</p>
                  <Controller name="recoveryBpDiastolic" control={control} render={({ field }) => (
                    <NumberStepper value={field.value} onChange={field.onChange} min={recoveryBpDiastolicRange.min} max={recoveryBpDiastolicRange.max} step={recoveryBpDiastolicRange.step} showSlider />
                  )} />
                </div>
              </div>
            )}
          </div>

          {/* Heart rate */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("preop.heartRate")}</Label>
              <button type="button"
                onClick={() => { const next = !recoveryHeartRateUTO; setValue("recoveryHeartRateUnobtainable", next); if (next) setValue("recoveryHeartRate", undefined) }}
                className={`text-xs px-2.5 py-1 rounded-full border transition-all ${recoveryHeartRateUTO ? "bg-slate-200 border-slate-400 text-slate-700 font-semibold" : "border-slate-200 text-slate-400 hover:border-slate-300"}`}>
                {t("preop.unableToObtain")}
              </button>
            </div>
            {recoveryHeartRateUTO ? (
              <p className="text-sm text-slate-400 italic py-2">{t("preop.unableToObtain")}</p>
            ) : (
              <Controller name="recoveryHeartRate" control={control} render={({ field }) => (
                <NumberStepper value={field.value} onChange={field.onChange} min={recoveryHeartRateRange.min} max={recoveryHeartRateRange.max} step={recoveryHeartRateRange.step} unit="bpm" showSlider />
              )} />
            )}
          </div>

          {/* SpO₂ */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("preop.spO2")}</Label>
              <button type="button"
                onClick={() => { const next = !recoverySpo2UTO; setValue("recoverySpO2Unobtainable", next); if (next) setValue("recoverySpO2", undefined) }}
                className={`text-xs px-2.5 py-1 rounded-full border transition-all ${recoverySpo2UTO ? "bg-slate-200 border-slate-400 text-slate-700 font-semibold" : "border-slate-200 text-slate-400 hover:border-slate-300"}`}>
                {t("preop.unableToObtain")}
              </button>
            </div>
            {recoverySpo2UTO ? (
              <p className="text-sm text-slate-400 italic py-2">{t("preop.unableToObtain")}</p>
            ) : (
              <Controller name="recoverySpO2" control={control} render={({ field }) => (
                <NumberStepper value={field.value} onChange={field.onChange} min={recoverySpo2Range.min} max={recoverySpo2Range.max} step={recoverySpo2Range.step} unit="%" showSlider />
              )} />
            )}
          </div>

          {/* Temperature */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("postop.temperatureC")}</Label>
              <button type="button"
                onClick={() => { const next = !recoveryTemperatureUTO; setValue("recoveryTemperatureUnobtainable", next); if (next) setValue("temperatureCelsius", undefined) }}
                className={`text-xs px-2.5 py-1 rounded-full border transition-all ${recoveryTemperatureUTO ? "bg-slate-200 border-slate-400 text-slate-700 font-semibold" : "border-slate-200 text-slate-400 hover:border-slate-300"}`}>
                {t("preop.unableToObtain")}
              </button>
            </div>
            {recoveryTemperatureUTO ? (
              <p className="text-sm text-slate-400 italic py-2">{t("preop.unableToObtain")}</p>
            ) : (
              <Controller name="temperatureCelsius" control={control} render={({ field }) => (
                <ConvertedStepper measurement="temperature" canonicalValue={field.value} onCanonicalChange={field.onChange} canonicalMin={recoveryTemperatureRange.min} canonicalMax={recoveryTemperatureRange.max} canonicalStep={recoveryTemperatureRange.step} showSlider />
              )} />
            )}
          </div>

          {/* Pain NRS */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("postop.painNRS")}</Label>
            <div className="flex items-center gap-2">
              <input type="range" min={painNrsRange.min} max={painNrsRange.max} step={painNrsRange.step}
                {...register("painScoreNRS")}
                className="flex-1 h-2 rounded-lg appearance-none bg-slate-200 dark:bg-[#333] accent-blue-600 cursor-pointer" />
              <span className="text-sm font-bold w-6 text-center text-slate-700 dark:text-slate-200">{watch("painScoreNRS") ?? 0}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Controller name="ponv" control={control} render={({ field }) => (
            <Checkbox id="ponv" checked={!!field.value} onCheckedChange={v => field.onChange(v === true)} />
          )} />
          <Label htmlFor="ponv" className="font-normal cursor-pointer">{t("postop.ponv")}</Label>
        </div>
      </SectionCard>
      </div>{/* /postop-recovery */}

      {/* Disposition */}
      <div data-tour="postop-disposition">
      <SectionCard title={t("postop.dispositionSection")}>
        <div className="space-y-1">
          <Label>{t("postop.dispatchTo")}</Label>
          <Controller name="disposition" control={control} render={({ field }) => (
            <div className="flex gap-3">
              {dispositionOptions.map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => {
                    const next = field.value === opt.value ? undefined : opt.value
                    field.onChange(next)
                    if (next !== "WARD" && next !== "PACU") {
                      setValue("handoverItems", [], { shouldDirty: true })
                      setValue("dispositionNotes", "", { shouldDirty: true })
                    }
                  }}
                  className={`flex-1 rounded-lg border-2 py-3 font-semibold text-sm transition-all ${
                    field.value === opt.value
                      ? opt.color + " scale-105 shadow-sm"
                      : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#555] hover:bg-slate-50 dark:hover:bg-[#1e1e1e]"
                  }`}>
                  {lbl(opt)}
                </button>
              ))}
            </div>
          )} />
        </div>

        {/* Handover checklist — WARD or PACU only */}
        {(disposition === "WARD" || disposition === "PACU") && (
          <div data-tour="postop-handover" className="space-y-4 pt-2 border-t border-slate-100 dark:border-[#2a2a2a]">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{locale === "bg" ? "Указания при предаване" : "Handover instructions"}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              {HANDOVER_GROUPS.map(({ group, items }) => (
                <div key={group}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">{group}</p>
                  <div className="space-y-1.5">
                    {items.map(({ code, label }) => {
                      const checked = handoverItems.includes(code)
                      return (
                        <label key={code} className="flex items-start gap-2 cursor-pointer group">
                          <Checkbox
                            id={code}
                            checked={checked}
                            onCheckedChange={v => {
                              setValue("handoverItems", v
                                ? [...handoverItems, code]
                                : handoverItems.filter(c => c !== code)
                              )
                            }}
                            className="mt-0.5 shrink-0"
                          />
                          <span className="text-xs text-slate-600 dark:text-slate-300 leading-snug group-hover:text-slate-800 dark:group-hover:text-slate-100 transition-colors">
                            {label}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(disposition === "WARD" || disposition === "PACU") && (
        <div className="space-y-1">
          <Label>{t("postop.handoverNotes")}</Label>
          <Textarea
              placeholder={t("postop.handoverNotesPlaceholder")}
            rows={3}
            {...register("dispositionNotes")}
          />
        </div>
        )}
      </SectionCard>
      </div>{/* /postop-disposition */}

      <div className="flex justify-between">
        <Button type="button" variant="outline" size="lg" className="gap-2" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" /> {t("common.back")}
        </Button>
        <Button type="submit" size="lg" className="gap-2 bg-green-600 hover:bg-green-700" disabled={submitting} data-tour="postop-submit">
          <Save className="h-4 w-4" />
          {submitting ? t("common.saving") : t("postop.saveCase")}
        </Button>
      </div>
    </form>
  )
}
