"use client"

import { useForm, Controller } from "react-hook-form"
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
import { Input } from "@/components/ui/input"
import { ChevronLeft, Save } from "lucide-react"
import { NumberStepper } from "@/components/NumberStepper"

const schema = z.object({
  aldreteActivity:      z.coerce.number().min(0).max(2).optional(),
  aldreteRespiration:   z.coerce.number().min(0).max(2).optional(),
  aldreteCirculation:   z.coerce.number().min(0).max(2).optional(),
  aldreteConsciousness: z.coerce.number().min(0).max(2).optional(),
  aldreteSpO2:          z.coerce.number().min(0).max(2).optional(),
  painScoreNRS:       z.coerce.number().min(0).max(10).optional(),
  ponv:               z.boolean().default(false),
  temperatureCelsius: z.coerce.number().optional(),
  timeInRecoveryMin:  z.coerce.number().optional(),
  disposition:      z.enum(["WARD", "PACU", "ICU"]).optional(),
  dispositionNotes: z.string().optional(),
  handoverItems:    z.array(z.string()).default([]),
})

export type PostopData = z.infer<typeof schema>

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

export const HANDOVER_GROUPS_EN: HandoverGroup[] = [
  { group: "Vital Signs", items: [
    { code: "obs_freq",     label: "Observations every 15 min × 1h, then every 30 min" },
    { code: "spo2_cont",    label: "Continuous SpO₂ monitoring" },
    { code: "temp_monitor", label: "Temperature monitoring" },
    { code: "urine_output", label: "Urine output monitoring (IDC in situ)" },
    { code: "glucose",      label: "Blood glucose monitoring" },
  ]},
  { group: "Airway & Oxygen", items: [
    { code: "o2_supp",      label: "Supplemental O₂" },
    { code: "npo",          label: "Nil by mouth until fully awake" },
    { code: "diet_advance", label: "Advance diet when tolerating" },
    { code: "alert_resp",   label: "Alert if SpO₂ < 92% or RR < 8 or > 25/min" },
  ]},
  { group: "Cardiovascular", items: [
    { code: "alert_hr", label: "Alert if HR < 50 or > 120 bpm" },
    { code: "alert_bp", label: "Alert if SBP < 90 or > 160 mmHg" },
    { code: "piv",      label: "Peripheral IV in situ" },
    { code: "cvk",      label: "Central venous catheter in situ" },
    { code: "art_line", label: "Arterial line in situ" },
  ]},
  { group: "Pain", items: [
    { code: "analgesia_protocol", label: "Regular analgesia per ward protocol" },
    { code: "pca",                label: "PCA pump in situ" },
    { code: "epidural_catheter",  label: "Epidural catheter — pain team to review" },
    { code: "nerve_catheter",     label: "Peripheral nerve catheter in situ" },
    { code: "alert_pain",         label: "Alert if NRS pain score > 4 at rest" },
  ]},
  { group: "PONV & GI", items: [
    { code: "antiemetic_prn", label: "Antiemetics PRN" },
    { code: "ponv_protocol",  label: "PONV prophylaxis" },
    { code: "oral_intake",    label: "Resume oral intake when tolerating" },
    { code: "ngt",            label: "NGT in situ" },
  ]},
  { group: "Medications & Prophylaxis", items: [
    { code: "resume_meds",  label: "Resume regular medications" },
    { code: "dvt_lmwh",     label: "DVT prophylaxis — LMWH" },
    { code: "stress_ulcer", label: "Stress ulcer prophylaxis" },
    { code: "antibiotics",  label: "Antibiotics per surgical plan" },
  ]},
  { group: "Investigations", items: [
    { code: "bloods", label: "Blood tests in ___ hours" },
    { code: "ecg",    label: "12-lead ECG" },
    { code: "cxr",    label: "Chest X-ray" },
  ]},
  { group: "Consultations", items: [
    { code: "pain_team", label: "Pain management team review" },
    { code: "physio",    label: "Physiotherapy" },
    { code: "dietitian", label: "Dietitian / nutritional support" },
  ]},
]

export const HANDOVER_GROUPS_BG: HandoverGroup[] = [
  { group: "Витални показатели", items: [
    { code: "obs_freq",     label: "Мониториране на 15 мин × 1ч, след това на 30 мин" },
    { code: "spo2_cont",    label: "Непрекъснато мониториране на SpO₂" },
    { code: "temp_monitor", label: "Контрол на телесната температура" },
    { code: "urine_output", label: "Мониториране на диурезата (уринарен катетър)" },
    { code: "glucose",      label: "Мониториране на кръвна захар" },
  ]},
  { group: "Дихателни пътища и кислород", items: [
    { code: "o2_supp",      label: "Кислородотерапия" },
    { code: "npo",          label: "Гладуване до пълно събуждане" },
    { code: "diet_advance", label: "Захранване при поносимост" },
    { code: "alert_resp",   label: "Сигнализирай при SpO₂ < 92% или ДЧ < 8 или > 25/мин" },
  ]},
  { group: "Сърдечно-съдова система", items: [
    { code: "alert_hr", label: "Сигнализирай при СЧ < 50 или > 120 уд/мин" },
    { code: "alert_bp", label: "Сигнализирай при САН < 90 или > 160 mmHg" },
    { code: "piv",      label: "Периферен венозен катетър (ПВК)" },
    { code: "cvk",      label: "Централен венозен катетър (ЦВК)" },
    { code: "art_line", label: "Артериална линия" },
  ]},
  { group: "Обезболяване", items: [
    { code: "analgesia_protocol", label: "Редовна аналгезия по протокол на отделението" },
    { code: "pca",                label: "Помпа за пациент-контролирана аналгезия (ПКА)" },
    { code: "epidural_catheter",  label: "Епидурален катетър — за преглед от екип по болкова терапия" },
    { code: "nerve_catheter",     label: "Периферен нервен катетър" },
    { code: "alert_pain",         label: "Сигнализирай при болкова скала NRS > 4 в покой" },
  ]},
  { group: "ПОНВ и стомашно-чревна система", items: [
    { code: "antiemetic_prn", label: "Антиеметици при нужда" },
    { code: "ponv_protocol",  label: "Профилактика на ПОНВ" },
    { code: "oral_intake",    label: "Захранване при поносимост" },
    { code: "ngt",            label: "Назогастрална сонда" },
  ]},
  { group: "Медикаменти и профилактика", items: [
    { code: "resume_meds",  label: "Възобновяване на редовните медикаменти" },
    { code: "dvt_lmwh",     label: "Профилактика на ДВТ — нискомолекулен хепарин" },
    { code: "stress_ulcer", label: "Профилактика на стрес-язва" },
    { code: "antibiotics",  label: "Антибиотици по хирургичен план" },
  ]},
  { group: "Изследвания", items: [
    { code: "bloods", label: "Кръвни изследвания след ___ часа" },
    { code: "ecg",    label: "12-отвеждащ ЕКГ" },
    { code: "cxr",    label: "Рентгенография на гръден кош" },
  ]},
  { group: "Консултации", items: [
    { code: "pain_team", label: "Преглед от екип по болкова терапия" },
    { code: "physio",    label: "Физиотерапия" },
    { code: "dietitian", label: "Диетолог / нутритивна подкрепа" },
  ]},
]

export function PostopForm({ onSubmit, onBack, submitting, onAutoSave, initialComplicationsText, defaultValues }: {
  onSubmit: (data: PostopData) => void
  onBack: () => void
  submitting?: boolean
  onAutoSave?: (data: PostopData) => void
  initialComplicationsText?: string
  defaultValues?: Partial<PostopData>
}) {
  const t      = useTranslations()
  const locale = useLocale()
  const HANDOVER_GROUPS = locale === "bg" ? HANDOVER_GROUPS_BG : HANDOVER_GROUPS_EN
  const { register, handleSubmit, control, watch, setValue, getValues } = useForm<PostopData>({
    resolver: zodResolver(schema) as any,
    defaultValues: { ponv: false, handoverItems: [], ...defaultValues },
  })

  const allValues = watch()
  useEffect(() => {
    if (!onAutoSave) return
    const timer = setTimeout(() => onAutoSave(getValues()), 1500)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(allValues)])

  const aldreteVals = watch(["aldreteActivity","aldreteRespiration","aldreteCirculation","aldreteConsciousness","aldreteSpO2"])
  const aldreteTotal = aldreteVals.reduce<number>((sum, v) => sum + (v != null ? parseInt(String(v), 10) || 0 : 0), 0)
  const aldreteColor = aldreteTotal >= 9 ? "default" : aldreteTotal >= 7 ? "secondary" : "destructive"
  const disposition   = watch("disposition")
  const handoverItems = watch("handoverItems") ?? []

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
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">{t(labelKey as any)}</p>
                <div className="grid grid-cols-3 gap-2">
                  {scoreKeys.map((sk, i) => {
                    const selected = Number(field.value) === i
                    return (
                      <button key={i} type="button"
                        onClick={() => field.onChange(selected ? undefined : i)}
                        className={`rounded-xl border-2 p-2.5 text-center transition-all ${selected ? SCORE_COLORS[i] + " scale-105 shadow-sm" : UNSELECTED}`}>
                        <div className="text-xl font-bold leading-none">{i}</div>
                        <div className="text-[10px] mt-1 leading-tight opacity-90">{String(t(sk as any)).replace(/^\d+\s*[—–-]\s*/, '')}</div>
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {/* Pain NRS */}
          <div className="space-y-2 sm:col-span-1">
            <Label>{t("postop.painNRS")}</Label>
            <div className="flex items-center gap-2">
              <input type="range" min={0} max={10} step={1}
                {...register("painScoreNRS")}
                className="flex-1 h-2 rounded-lg appearance-none bg-slate-200 dark:bg-[#333] accent-blue-600 cursor-pointer" />
              <span className="text-sm font-bold w-6 text-center text-slate-700 dark:text-slate-200">{watch("painScoreNRS") ?? 0}</span>
            </div>
          </div>

          {/* Temperature slider */}
          <div className="space-y-2">
            <Label>{t("postop.temperatureC")}</Label>
            <Controller name="temperatureCelsius" control={control} render={({ field }) => (
              <NumberStepper
                value={field.value}
                onChange={field.onChange}
                min={0} max={42} step={0.1} unit="°C"
                showSlider={true}
              />
            )} />
          </div>

          {/* Time in recovery */}
          <div className="space-y-2">
            <Label>{t("postop.timeInRecovery")}</Label>
            <Input type="number" placeholder="min" {...register("timeInRecoveryMin")} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox id="ponv" {...register("ponv")} />
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
              {[
                { value: "WARD", labelKey: "postop.ward", color: "bg-green-100 border-green-400 text-green-800 dark:bg-green-900/30 dark:border-green-600 dark:text-green-300" },
                { value: "PACU", labelKey: "postop.pacu", color: "bg-amber-100 border-amber-400 text-amber-800 dark:bg-amber-900/30 dark:border-amber-600 dark:text-amber-300" },
                { value: "ICU",  labelKey: "postop.icu",  color: "bg-red-100 border-red-400 text-red-800 dark:bg-red-900/30 dark:border-red-600 dark:text-red-300" },
              ].map(({ value, labelKey, color }) => (
                <button key={value} type="button"
                  onClick={() => field.onChange(field.value === value ? undefined : value)}
                  className={`flex-1 rounded-lg border-2 py-3 font-semibold text-sm transition-all ${
                    field.value === value
                      ? color + " scale-105 shadow-sm"
                      : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#555] hover:bg-slate-50 dark:hover:bg-[#1e1e1e]"
                  }`}>
                  {t(labelKey as any)}
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

        <div className="space-y-1">
          <Label>{t("postop.handoverNotes")}</Label>
          <Textarea
            placeholder="No patient-identifying information — additional handover notes…"
            rows={3}
            {...register("dispositionNotes")}
          />
        </div>
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
