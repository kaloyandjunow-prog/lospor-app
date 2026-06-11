"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useTranslations, useLocale } from "next-intl"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { calcBMI, calcIBW, calcABW, calcApfel, calcRCRI, calcStopBang, apfelRiskLabel, rcriRiskLabel, stopBangRiskLabel } from "@/lib/scores"
import { getBodySystem, suggestASAFromTags, SYSTEM_COLORS, SYSTEM_ORDER, type BodySystem } from "@/lib/icd11-categories"
import { ChevronRight, AlertCircle, Lightbulb, X } from "lucide-react"
import { TagInput, type Tag } from "@/components/TagInput"
import { NumberStepper } from "@/components/NumberStepper"
import { AIAdvisor } from "@/components/AIAdvisor"
import { LabResults, type LabResult } from "@/components/LabResults"
import GuardedTextarea from "@/components/GuardedTextarea"

// ── Numeric range select (kept for any remaining uses) ────────────────────────
function RangeSelect({ name, control, min, max, step = 1, placeholder = "—" }: {
  name: string; control: any; min: number; max: number; step?: number; placeholder?: string
}) {
  const options: React.ReactNode[] = []
  for (let v = min; v <= max; v = Math.round((v + step) * 1000) / 1000) {
    options.push(<option key={v} value={v}>{v}</option>)
  }
  return (
    <Controller name={name} control={control} render={({ field }) => (
      <select
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        value={field.value ?? ""}
        onChange={e => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      >
        <option value="">{placeholder}</option>
        {options}
      </select>
    )} />
  )
}

// ── Schema ────────────────────────────────────────────────────────────────────
const tagSchema = z.object({ label: z.string(), sub: z.string().optional() })

const schema = z.object({
  // For printed protocol only
  patientFirstName: z.string().optional(),
  patientLastName:  z.string().optional(),
  patientId:        z.string().optional(),

  // Demographics
  ageYears:  z.coerce.number().min(0).max(120).optional(),
  sex:       z.enum(["MALE","FEMALE","OTHER"]).optional(),
  heightCm:  z.coerce.number().optional(),
  weightKg:  z.coerce.number().optional(),
  bloodType: z.enum(["A","B","AB","O"]).optional(),
  rhFactor:  z.enum(["POSITIVE","NEGATIVE"]).optional(),

  // Case
  diagnoses:    z.array(tagSchema).default([]),
  procedures:   z.array(tagSchema).default([]),
  teamNotes:            z.string().max(500).optional(),
  highRiskSurgery:      z.boolean().default(false),
  emergencySurgery:     z.boolean().default(false),
  aiOptIn:              z.boolean().default(false),

  // Medical history — ICD-10 tags
  comorbidities: z.array(tagSchema).default([]),

  // Safety-critical fields
  allergies:               z.boolean().default(false),
  allergyDetails:          z.array(z.object({ label: z.string(), sub: z.string().optional() })).default([]),
  latexAllergy:            z.boolean().default(false),
  currentMedications:      z.array(z.object({ label: z.string(), sub: z.string().optional() })).default([]),
  familyAnesthesiaProblems: z.boolean().default(false),
  familyAnesthesiaDetails:  z.string().optional(),
  dentalProsthetics:       z.boolean().default(false),
  looseTeeth:              z.boolean().default(false),
  smoking:                 z.boolean().default(false),
  substanceAbuse:          z.boolean().default(false),

  // APFEL — PONV risk
  apfelPONVHistory:        z.boolean().default(false),
  apfelPostopOpioids:      z.boolean().default(false),

  // STOP-BANG — OSA screening
  stopbangSnoring:         z.boolean().default(false),
  stopbangTired:           z.boolean().default(false),
  stopbangObserved:        z.boolean().default(false),
  stopbangBP:              z.boolean().default(false),
  stopbangNeck:            z.boolean().default(false),

  // RCRI — cardiac risk (high-risk surgery reused from case section)
  rcriIschemicHeart:       z.boolean().default(false),
  rcriCHF:                 z.boolean().default(false),
  rcriCVD:                 z.boolean().default(false),
  rcriInsulinDM:           z.boolean().default(false),
  rcriCreatinine:          z.boolean().default(false),

  // Computed scores injected before submit
  rcriScore:               z.number().optional(),
  apfelScore:              z.number().optional(),
  stopBangScore:           z.number().optional(),

  // Vitals
  bpSystolic: z.coerce.number().optional(), bpDiastolic: z.coerce.number().optional(),
  heartRate:  z.coerce.number().optional(), spO2: z.coerce.number().optional(),
  temperature: z.coerce.number().optional(), respiratoryRate: z.coerce.number().optional(),
  heartArrhythmia: z.boolean().default(false),

  // Airway
  mallampati:             z.enum(["I","II","III","IV"]).optional(),
  mouthOpeningCm:         z.coerce.number().optional(),
  thyromental:            z.coerce.number().optional(),
  neckMobility:           z.enum(["FULL","LIMITED","FIXED"]).optional(),
  upperLipBiteTest:       z.enum(["CLASS_I","CLASS_II","CLASS_III"]).optional(),
  retrognathia:           z.boolean().default(false),
  prominentIncisors:      z.boolean().default(false),
  facialHair:             z.boolean().default(false),
  difficultAirwayHistory: z.boolean().default(false),
  difficultAirwayNotes:   z.string().optional(),
  cormackLehane:          z.enum(["I","IIa","IIb","III","IV"]).optional(),

  // Scores
  asaScore: z.enum(["I","II","III","IV","V","VI"]).optional(),

  // Free-text
  physicalExamReport: z.string().optional(),
  notes:              z.string().optional(),

  labResults: z.array(z.object({ test: z.string(), value: z.string(), unit: z.string() })).default([]),
})

export type PreopData = z.infer<typeof schema>

// ── Comorbidity list grouped by system ────────────────────────────────────────
function ComorbiditiesBySystem({
  tags,
  onRemove,
  noItemsLabel = "No comorbidities recorded",
}: {
  tags: Tag[]
  onRemove: (label: string) => void
  noItemsLabel?: string
}) {
  if (tags.length === 0) return null

  const grouped: Partial<Record<BodySystem, Tag[]>> = {}
  for (const tag of tags) {
    const code   = tag.sub ?? ""
    const system = getBodySystem(code)
    if (!grouped[system]) grouped[system] = []
    grouped[system]!.push(tag)
  }

  return (
    <div className="space-y-3 pt-3 border-t border-slate-100">
      {SYSTEM_ORDER.filter(s => grouped[s]).map(system => (
        <div key={system}>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{system}</p>
          <div className="flex flex-wrap gap-1.5">
            {grouped[system]!.map(tag => (
              <span
                key={tag.label}
                className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${SYSTEM_COLORS[system]}`}
              >
                <span>{tag.label}</span>
                <button type="button" onClick={() => onRemove(tag.label)} className="ml-0.5 opacity-60 hover:opacity-100">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function SectionCard({ title, children, action, error }: { title: string; children: React.ReactNode; action?: React.ReactNode; error?: boolean }) {
  return (
    <Card className={error ? "border-red-500 dark:border-red-500" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base text-slate-700">{title}</CardTitle>
          {action}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

function CheckField({ id, label, control }: { id: string; label: string; control: any }) {
  return (
    <div className="flex items-center gap-2">
      <Controller name={id} control={control} render={({ field }) => (
        <Checkbox id={id} checked={!!field.value} onCheckedChange={field.onChange} />
      )} />
      <Label htmlFor={id} className="font-normal cursor-pointer">{label}</Label>
    </div>
  )
}

function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min }

// ── Component ─────────────────────────────────────────────────────────────────
export function PreopForm({ defaultValues, onSubmit, onNameChange, onIdChange, onAutoSave, layoutMode = "scroll" }: {
  defaultValues?: Partial<PreopData>
  onSubmit: (data: PreopData) => void
  onNameChange?: (name: string) => void
  onIdChange?: (id: string) => void
  onAutoSave?: (data: PreopData) => void
  layoutMode?: "tabs" | "scroll"
}) {
  const t      = useTranslations()
  const locale = useLocale()
  const { register, handleSubmit, control, watch, setValue, getValues, formState: { errors } } = useForm<PreopData>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      bpSystolic:  randInt(120, 130),
      bpDiastolic: randInt(70, 85),
      heartRate:   randInt(60, 90),
      spO2:        randInt(95, 99),
      temperature: parseFloat((36 + Math.random()).toFixed(1)),
      comorbidities: [], diagnoses: [], procedures: [], currentMedications: [], allergyDetails: [],
      ...Object.fromEntries(Object.entries(defaultValues ?? {}).filter(([, v]) => v !== undefined && v !== null)),
    },
  })

  // ── Batched watch subscriptions (5 groups instead of 19 individual) ──────────
  const [height, weight, sex, ageYearsVal, smoking, highRiskSurgery, emergencySurgery,
         allergies, familyAnesthesiaProblems, difficultAirwayHistory, comorbidities] =
    watch(["heightCm", "weightKg", "sex", "ageYears", "smoking", "highRiskSurgery", "emergencySurgery",
           "allergies", "familyAnesthesiaProblems", "difficultAirwayHistory", "comorbidities"])

  const [rcriIschemicHeart, rcriCHF, rcriCVD, rcriInsulinDM, rcriCreatinine] =
    watch(["rcriIschemicHeart", "rcriCHF", "rcriCVD", "rcriInsulinDM", "rcriCreatinine"])

  const [apfelPONVHistory, apfelPostopOpioids, stopbangSnoring, stopbangTired, stopbangObserved, stopbangBP, stopbangNeck] =
    watch(["apfelPONVHistory", "apfelPostopOpioids", "stopbangSnoring", "stopbangTired", "stopbangObserved", "stopbangBP", "stopbangNeck"])

  // ── Memoised score + BMI calculations ────────────────────────────────────────
  const bmi  = useMemo(() => height && weight ? calcBMI(Number(height), Number(weight)) : null,
    [height, weight])
  const ibw  = useMemo(() => height && sex ? calcIBW(Number(height), sex) : null, [height, sex])
  const abw  = useMemo(() => ibw && weight ? calcABW(ibw, Number(weight)) : null, [ibw, weight])
  const asaSuggestion = useMemo(() => suggestASAFromTags(comorbidities ?? [], bmi), [comorbidities, bmi])

  const apfelScore = useMemo(() => calcApfel({
    female:         sex === "FEMALE",
    nonSmoker:      !smoking,
    ponvHistory:    apfelPONVHistory  ?? false,
    opioidsPlanned: apfelPostopOpioids ?? false,
  }), [sex, smoking, apfelPONVHistory, apfelPostopOpioids])

  const stopBangScore = useMemo(() => calcStopBang({
    snoring:      stopbangSnoring  ?? false,
    tired:        stopbangTired    ?? false,
    observed:     stopbangObserved ?? false,
    highBP:       stopbangBP       ?? false,
    bmi:          bmi ?? 0,
    ageOver50:    (ageYearsVal ?? 0) > 50,
    neckOver40cm: stopbangNeck    ?? false,
    male:         sex === "MALE",
  }), [stopbangSnoring, stopbangTired, stopbangObserved, stopbangBP, bmi, ageYearsVal, stopbangNeck, sex])

  const rcriScore = useMemo(() => calcRCRI({
    highRiskSurgery:          highRiskSurgery   ?? false,
    ischaemicHeartDisease:    rcriIschemicHeart ?? false,
    congestiveHeartFailure:   rcriCHF           ?? false,
    cerebrovascularDisease:   rcriCVD           ?? false,
    insulinDependentDiabetes: rcriInsulinDM     ?? false,
    creatinineHigh:           rcriCreatinine    ?? false,
  }), [highRiskSurgery, rcriIschemicHeart, rcriCHF, rcriCVD, rcriInsulinDM, rcriCreatinine])

  const [vitalsUTO, setVitalsUTO] = useState<Set<string>>(new Set())
  function toggleUTO(field: string, clearFn: () => void) {
    setVitalsUTO(prev => {
      const next = new Set(prev)
      if (next.has(field)) { next.delete(field) }
      else { next.add(field); clearFn() }
      return next
    })
  }

  // ── Debounced auto-save — subscription callback instead of JSON.stringify ────
  useEffect(() => {
    if (!onAutoSave) return
    let timer: ReturnType<typeof setTimeout>
    const subscription = watch((values) => {
      const { sex, ageYears, diagnoses } = values as any
      const hasData = sex || ageYears != null || (diagnoses?.length ?? 0) > 0
      if (!hasData) return
      clearTimeout(timer)
      timer = setTimeout(() => onAutoSave(getValues()), 1500)
    })
    return () => { subscription.unsubscribe(); clearTimeout(timer) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch, onAutoSave])
  const [airwayUTO, setAirwayUTO] = useState(false)
  const [activeTab, setActiveTab] = useState<"patient" | "case" | "history" | "exam" | "risk">("patient")

  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set())
  const refMap = useRef<Record<string, HTMLDivElement | null>>({})

  function fe(key: string) {
    return fieldErrors.has(key)
      ? "ring-2 ring-red-500 dark:ring-red-500 rounded-lg"
      : ""
  }

  function validate(data: PreopData): string[] {
    const errs: string[] = []
    if (data.ageYears == null)      errs.push("ageYears")
    if (!data.sex)                  errs.push("sex")
    if (!data.diagnoses?.length)    errs.push("diagnoses")
    if (!data.procedures?.length)   errs.push("procedures")
    if (!vitalsUTO.has("bp") && (!data.bpSystolic || !data.bpDiastolic)) errs.push("bp")
    if (!vitalsUTO.has("heartRate") && !data.heartRate)                  errs.push("heartRate")
    if (!vitalsUTO.has("respiratoryRate") && !data.respiratoryRate)      errs.push("respiratoryRate")
    if (!airwayUTO && !data.mallampati)  errs.push("airway")
    if (!data.asaScore)                  errs.push("asaScore")
    return errs
  }

  const TABS = [
    { value: "patient", label: "Patient"   },
    { value: "case",    label: "Case"      },
    { value: "history", label: "History"   },
    { value: "exam",    label: "Exam"      },
    { value: "risk",    label: "Risk & ASA"},
  ]

  function hasTabError(tab: string): boolean {
    if (fieldErrors.size === 0) return false
    switch (tab) {
      case "patient": return fieldErrors.has("ageYears") || fieldErrors.has("sex")
      case "case":    return fieldErrors.has("diagnoses") || fieldErrors.has("procedures")
      case "exam":    return fieldErrors.has("bp") || fieldErrors.has("heartRate") || fieldErrors.has("respiratoryRate") || fieldErrors.has("airway")
      case "risk":    return fieldErrors.has("asaScore")
      default: return false
    }
  }

  function handleValidatedSubmit(data: PreopData) {
    const errs = validate(data)
    if (errs.length > 0) {
      const errSet = new Set(errs)
      setFieldErrors(errSet)
      if (layoutMode === "tabs") {
        const firstErr = errs[0]
        const tab =
          firstErr === "ageYears"  || firstErr === "sex"        ? "patient" :
          firstErr === "diagnoses" || firstErr === "procedures" ? "case" :
          firstErr === "bp" || firstErr === "heartRate" || firstErr === "respiratoryRate" || firstErr === "airway" ? "exam" :
          "risk"
        setActiveTab(tab as any)
      } else {
        const sectionOrder = ["ageYears","sex","diagnoses","procedures","bp","heartRate","respiratoryRate","airway","asaScore"]
        const firstErr = sectionOrder.find(e => errSet.has(e))
        if (firstErr) {
          const sectionKey =
            firstErr === "patientName" || firstErr === "patientId" ? "patient" :
            firstErr === "ageYears"   || firstErr === "sex"        ? "demographics" :
            firstErr === "diagnoses"  || firstErr === "procedures" ? "case" :
            firstErr === "bp" || firstErr === "heartRate" || firstErr === "respiratoryRate" ? "vitals" :
            firstErr === "airway" ? "airway" : "asa"
          setTimeout(() => refMap.current[sectionKey]?.scrollIntoView({ behavior: "smooth", block: "center" }), 0)
        }
      }
      return
    }
    setFieldErrors(new Set())
    onSubmit({ ...data, rcriScore, apfelScore, stopBangScore })
  }

  return (
    <form onSubmit={handleSubmit(handleValidatedSubmit, () => handleValidatedSubmit(getValues() as PreopData))} className="space-y-6">

      {/* Tab bar — tabs mode only */}
      {layoutMode === "tabs" && (
        <div className="sticky top-0 z-20 bg-white dark:bg-[#111] border-b border-slate-200 dark:border-[#2a2a2a] flex items-center h-11 -mx-0">
          {TABS.map(tab => (
            <button key={tab.value} type="button"
              onClick={() => setActiveTab(tab.value as any)}
              className={`relative h-full px-4 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === tab.value
                  ? "border-slate-900 dark:border-slate-100 text-slate-900 dark:text-slate-100"
                  : "border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
              }`}>
              {tab.label}
              {hasTabError(tab.value) && <span className="absolute top-2 right-0.5 w-1.5 h-1.5 rounded-full bg-red-500" />}
            </button>
          ))}
        </div>
      )}

      {/* ── Patient tab ─────────────────────────────────────────── */}
      <div className={layoutMode === "tabs" && activeTab !== "patient" ? "hidden" : ""}>
      {/* Demographics */}
      <div ref={el => { refMap.current.demographics = el }} data-tour="preop-demographics">
      <SectionCard title={t("preop.demographicsSection")} error={fieldErrors.has("ageYears") || fieldErrors.has("sex")}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("preop.age")} <span className="text-red-500">*</span></Label>
            <Controller name="ageYears" control={control} render={({ field }) => (
              <div className={fe("ageYears")}><NumberStepper value={field.value} onChange={field.onChange} min={0} max={120} unit="yrs" showSlider /></div>
            )} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("preop.height")}</Label>
            <Controller name="heightCm" control={control} render={({ field }) => (
              <NumberStepper value={field.value} onChange={field.onChange} min={0} max={220} unit="cm" showSlider />
            )} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("preop.weight")}</Label>
            <Controller name="weightKg" control={control} render={({ field }) => (
              <NumberStepper value={field.value} onChange={field.onChange} min={0} max={250} step={0.5} stepFn={v => v < 20 ? 0.5 : 1} unit="kg" showSlider />
            )} />
          </div>
        </div>

        {(bmi || ibw) && (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {bmi && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400 font-medium">BMI</span>
                <Badge variant={bmi >= 40 ? "destructive" : bmi >= 30 ? "secondary" : "default"}>{bmi} kg/m²</Badge>
              </div>
            )}
            {ibw && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400 font-medium">IBW</span>
                <Badge variant="outline">{ibw} kg</Badge>
              </div>
            )}
            {abw && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400 font-medium">ABW</span>
                <Badge variant="outline" className="border-amber-300 text-amber-700">{abw} kg</Badge>
              </div>
            )}
            {ibw && <span className="text-xs text-slate-400">Devine formula</span>}
          </div>
        )}

        {/* Sex */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("preop.sex")} <span className="text-red-500">*</span></Label>
          <Controller name="sex" control={control} render={({ field }) => (
            <div className={`flex gap-3 ${fe("sex")}`}>
              {[
                { value: "MALE",   label: t("preop.male"),   icon: "♂" },
                { value: "FEMALE", label: t("preop.female"), icon: "♀" },
                { value: "OTHER",  label: t("preop.other"),  icon: "⚥" },
              ].map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => field.onChange(opt.value)}
                  className={`flex-1 rounded-xl border-2 py-2.5 text-sm font-semibold transition-all ${
                    field.value === opt.value
                      ? "border-blue-500 bg-blue-500 text-white dark:bg-slate-600 dark:border-slate-300 dark:text-white"
                      : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#555]"
                  }`}>
                  <span className="text-lg block">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          )} />
        </div>
        {(fieldErrors.has("ageYears") || fieldErrors.has("sex")) && (
          <p className="text-red-500 text-xs">Age and sex are required.</p>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>{t("preop.bloodType")}</Label>
            <Controller name="bloodType" control={control} render={({ field }) => (
              <div className="flex gap-2">
                {["A","B","AB","O"].map(bt => (
                  <button key={bt} type="button"
                    onClick={() => field.onChange(field.value === bt ? undefined : bt)}
                    className={`flex-1 rounded-xl border-2 py-2 font-bold text-sm transition-all ${
                      field.value === bt
                        ? "bg-blue-500 border-blue-500 text-white dark:bg-slate-600 dark:border-slate-300 dark:text-white scale-105"
                        : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#555]"
                    }`}>{bt}</button>
                ))}
              </div>
            )} />
          </div>
          <div className="space-y-1">
            <Label>{t("preop.rhFactor")}</Label>
            <Controller name="rhFactor" control={control} render={({ field }) => (
              <div className="flex gap-2">
                {[
                  { v: "POSITIVE", label: "Rh +" },
                  { v: "NEGATIVE", label: "Rh −" },
                ].map(opt => (
                  <button key={opt.v} type="button"
                    onClick={() => field.onChange(field.value === opt.v ? undefined : opt.v)}
                    className={`flex-1 rounded-xl border-2 py-2 font-bold text-sm transition-all ${
                      field.value === opt.v
                        ? "bg-blue-500 border-blue-500 text-white dark:bg-slate-600 dark:border-slate-300 dark:text-white scale-105"
                        : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#555]"
                    }`}>{opt.label}</button>
                ))}
              </div>
            )} />
          </div>
        </div>
      </SectionCard>
      </div>
      </div>

      {/* ── Case tab ─────────────────────────────────────────────── */}
      <div className={layoutMode === "tabs" && activeTab !== "case" ? "hidden" : ""}>
      {/* Case details */}
      <div ref={el => { refMap.current.case = el }} data-tour="preop-diagnosis">
      <SectionCard title={t("preop.caseSection")} error={fieldErrors.has("diagnoses") || fieldErrors.has("procedures")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1 sm:col-span-2">
            <Label>{t("preop.diagnosis")} <span className="text-red-500">*</span></Label>
            <Controller name="diagnoses" control={control} render={({ field }) => (
              <div className={fe("diagnoses")}>
                <TagInput
                  value={(field.value ?? []) as Tag[]}
                  onChange={field.onChange}
                  searchUrl={`/api/search/icd11?locale=${locale}`}
                  renderSuggestion={item => ({ label: `${item.code} — ${item.description}`, sub: item.code })}
                  placeholder={t("preop.diagnosisPlaceholder")}
                />
              </div>
            )} />
            {fieldErrors.has("diagnoses") && <p className="text-red-500 text-xs">At least one diagnosis is required.</p>}
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>{t("preop.procedure")} <span className="text-red-500">*</span></Label>
            <Controller name="procedures" control={control} render={({ field }) => (
              <div className={fe("procedures")}>
                <TagInput
                  value={(field.value ?? []) as Tag[]}
                  onChange={field.onChange}
                  searchUrl="/api/search/procedures"
                  renderSuggestion={item => ({
                    label: item.group || item.description,
                    sub: `${item.code} · ${item.domain}`,
                  })}
                  placeholder={t("preop.procedurePlaceholder")}
                />
              </div>
            )} />
            {fieldErrors.has("procedures") && <p className="text-red-500 text-xs">{t("preop.procedureRequired")}</p>}
          </div>
          <div className="space-y-1 col-span-full">
            <Label>{t("preop.teamNotes")} <span className="font-normal text-slate-400">({t("common.optional")})</span></Label>
            <GuardedTextarea
              {...register("teamNotes")}
              maxLength={500}
              rows={2}
              placeholder={t("preop.teamNotesPlaceholder")}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-3 pt-1">
          <div className="flex items-center gap-2">
            <Controller name="highRiskSurgery" control={control} render={({ field }) => (
              <Checkbox id="highRiskSurgery" checked={!!field.value} onCheckedChange={field.onChange} />
            )} />
            <Label htmlFor="highRiskSurgery" className="font-normal cursor-pointer">{t("preop.highRiskSurgery")}</Label>
          </div>
          <Controller name="emergencySurgery" control={control} render={({ field }) => (
            <button type="button"
              onClick={() => field.onChange(!field.value)}
              className={`px-4 py-1.5 rounded-full border-2 text-sm font-semibold transition-all ${
                field.value
                  ? "bg-red-600 border-red-600 text-white scale-105 shadow"
                  : "border-red-300 text-red-500 hover:border-red-400"
              }`}>
              {t("preop.emergencySurgery")}
            </button>
          )} />
        </div>
      </SectionCard>
      </div>
      </div>

      {/* ── History tab ──────────────────────────────────────────── */}
      <div className={layoutMode === "tabs" && activeTab !== "history" ? "hidden" : "space-y-6"}>
      {/* Medical History */}
      <SectionCard title={t("preop.historySection")}>
        <p className="text-sm text-slate-500">{t("preop.historyDesc")}</p>
        <Controller name="comorbidities" control={control} render={({ field }) => (
          <>
            <TagInput
              value={(field.value ?? []) as Tag[]}
              onChange={field.onChange}
              searchUrl="/api/search/icd11"
              renderSuggestion={item => ({ label: `${item.code} — ${item.description}`, sub: item.code })}
              placeholder={t("preop.historyPlaceholder")}
            />
            <ComorbiditiesBySystem
              tags={(field.value ?? []) as Tag[]}
              noItemsLabel={t("preop.noComorbidities")}
              onRemove={label => field.onChange((field.value as Tag[]).filter(tg => tg.label !== label))}
            />
          </>
        )} />
      </SectionCard>

      {/* Medications */}
      <SectionCard title={t("preop.medicationsSection")}>
        <Controller name="currentMedications" control={control} render={({ field }) => (
          <TagInput
            value={(field.value ?? []) as Tag[]}
            onChange={field.onChange}
            searchUrl="/api/search/drugs"
            renderSuggestion={item => ({
              label: item.inn ? `${item.inn}${item.strength ? ` ${item.strength}` : ""}` : item.name,
              sub: item.name !== item.inn ? item.name : undefined,
            })}
            placeholder={t("preop.medicationsPlaceholder")}
          />
        )} />
      </SectionCard>

      {/* Anamnesis, habits & risk factor checkboxes */}
      <SectionCard title="Clinical Anamnesis & History">
        <div className="space-y-3">
          {/* Allergies */}
          <div className="flex items-center gap-2">
            <Controller name="allergies" control={control} render={({ field }) => (
              <Checkbox id="allergies" checked={!!field.value} onCheckedChange={field.onChange} />
            )} />
            <Label htmlFor="allergies" className="font-normal cursor-pointer">{t("preop.allergies")}</Label>
          </div>
          {allergies && (
            <Controller name="allergyDetails" control={control} render={({ field }) => (
              <TagInput
                value={(field.value ?? []) as Tag[]}
                onChange={field.onChange}
                searchUrl="/api/search/drugs"
                renderSuggestion={item => ({
                  label: item.inn ? `${item.inn}${item.strength ? ` ${item.strength}` : ""}` : item.name,
                  sub: item.name !== item.inn ? item.name : undefined,
                })}
                placeholder="Search allergen (drug name or INN)…"
              />
            )} />
          )}
          <div className="flex items-center gap-2">
            <Controller name="latexAllergy" control={control} render={({ field }) => (
              <Checkbox id="latexAllergy" checked={!!field.value} onCheckedChange={field.onChange} />
            )} />
            <Label htmlFor="latexAllergy" className="font-normal cursor-pointer">{t("preop.latexAllergy")}</Label>
          </div>
          <Separator />
          {/* Family history */}
          <div className="flex items-center gap-2">
            <Controller name="familyAnesthesiaProblems" control={control} render={({ field }) => (
              <Checkbox id="familyAnesthesiaProblems" checked={!!field.value} onCheckedChange={field.onChange} />
            )} />
            <Label htmlFor="familyAnesthesiaProblems" className="font-normal cursor-pointer">{t("preop.familyAnesthesia")}</Label>
          </div>
          {familyAnesthesiaProblems && <Textarea placeholder={t("common.details")} {...register("familyAnesthesiaDetails")} />}
          <Separator />
          {/* Dental */}
          <div className="flex items-center gap-2">
            <Controller name="dentalProsthetics" control={control} render={({ field }) => (
              <Checkbox id="dentalProsthetics" checked={!!field.value} onCheckedChange={field.onChange} />
            )} />
            <Label htmlFor="dentalProsthetics" className="font-normal cursor-pointer">{t("preop.dentalProsthetics")}</Label>
          </div>
          <div className="flex items-center gap-2">
            <Controller name="looseTeeth" control={control} render={({ field }) => (
              <Checkbox id="looseTeeth" checked={!!field.value} onCheckedChange={field.onChange} />
            )} />
            <Label htmlFor="looseTeeth" className="font-normal cursor-pointer">{t("preop.looseTeeth")}</Label>
          </div>
          <Separator />
          {/* Habits */}
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t("preop.harmfulHabits")}</p>
          <div className="flex items-center gap-2">
            <Controller name="smoking" control={control} render={({ field }) => (
              <Checkbox id="smoking" checked={!!field.value} onCheckedChange={field.onChange} />
            )} />
            <Label htmlFor="smoking" className="font-normal cursor-pointer">{t("preop.smoking")}</Label>
          </div>
          <div className="flex items-center gap-2">
            <Controller name="substanceAbuse" control={control} render={({ field }) => (
              <Checkbox id="substanceAbuse" checked={!!field.value} onCheckedChange={field.onChange} />
            )} />
            <Label htmlFor="substanceAbuse" className="font-normal cursor-pointer">{t("preop.substanceAbuse")}</Label>
          </div>

          <Separator />

          {/* RCRI */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">RCRI — Cardiac risk factors</p>
            <p className="text-xs text-slate-400">High-risk surgery is set in the Case section above.</p>
            {[
              { id:"rcriIschemicHeart", label:"Ischaemic heart disease (history of MI, positive stress test, use of nitrates, ECG Q waves)" },
              { id:"rcriCHF",           label:"Congestive heart failure (pulmonary oedema, PND, S3, bilateral crackles, CXR redistribution)" },
              { id:"rcriCVD",           label:"Cerebrovascular disease (history of TIA or stroke)" },
              { id:"rcriInsulinDM",     label:"Insulin-dependent diabetes mellitus" },
              { id:"rcriCreatinine",    label:"Creatinine > 177 µmol/L (> 2.0 mg/dL)" },
            ].map(item => (
              <div key={item.id} className="flex items-start gap-2">
                <Controller name={item.id as any} control={control} render={({ field }) => (
                  <Checkbox id={item.id} checked={!!field.value} onCheckedChange={field.onChange} className="mt-0.5" />
                )} />
                <Label htmlFor={item.id} className="font-normal cursor-pointer leading-snug">{item.label}</Label>
              </div>
            ))}
          </div>

          <Separator />

          {/* APFEL */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">APFEL — PONV risk</p>
            <p className="text-xs text-slate-400">Female sex and non-smoker status are derived from demographics and habits above.</p>
            {[
              { id:"apfelPONVHistory",   label:"History of PONV or motion sickness" },
              { id:"apfelPostopOpioids", label:"Postoperative opioids planned" },
            ].map(item => (
              <div key={item.id} className="flex items-center gap-2">
                <Controller name={item.id as any} control={control} render={({ field }) => (
                  <Checkbox id={item.id} checked={!!field.value} onCheckedChange={field.onChange} />
                )} />
                <Label htmlFor={item.id} className="font-normal cursor-pointer">{item.label}</Label>
              </div>
            ))}
          </div>

          <Separator />

          {/* STOP-BANG */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">STOP-BANG — OSA screening</p>
            <p className="text-xs text-slate-400">BMI &gt; 35, age &gt; 50, and male sex are derived automatically.</p>
            {[
              { id:"stopbangSnoring",  label:"Snoring — do you snore loudly?" },
              { id:"stopbangTired",    label:"Tired — often feel tired, fatigued, or sleepy during daytime?" },
              { id:"stopbangObserved", label:"Observed — has anyone observed you stop breathing during sleep?" },
              { id:"stopbangBP",       label:"Pressure — do you have or are you being treated for high blood pressure?" },
              { id:"stopbangNeck",     label:"Neck circumference > 40 cm" },
            ].map(item => (
              <div key={item.id} className="flex items-start gap-2">
                <Controller name={item.id as any} control={control} render={({ field }) => (
                  <Checkbox id={item.id} checked={!!field.value} onCheckedChange={field.onChange} className="mt-0.5" />
                )} />
                <Label htmlFor={item.id} className="font-normal cursor-pointer leading-snug">{item.label}</Label>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>
      </div>

      {/* ── Exam tab ─────────────────────────────────────────────── */}
      <div className={layoutMode === "tabs" && activeTab !== "exam" ? "hidden" : "space-y-6"}>
      {/* Vitals */}
      <div ref={el => { refMap.current.vitals = el }}>
      <SectionCard title={t("preop.vitalsSection")} error={fieldErrors.has("bp") || fieldErrors.has("heartRate") || fieldErrors.has("respiratoryRate")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

          {/* BP */}
          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("preop.bloodPressure")} <span className="text-red-500">*</span></Label>
              <button type="button"
                onClick={() => toggleUTO("bp", () => { setValue("bpSystolic", undefined); setValue("bpDiastolic", undefined) })}
                className={`text-xs px-2.5 py-1 rounded-full border transition-all ${vitalsUTO.has("bp") ? "bg-slate-200 border-slate-400 text-slate-700 font-semibold" : "border-slate-200 text-slate-400 hover:border-slate-300"}`}>
                {t("preop.unableToObtain")}
              </button>
            </div>
            {vitalsUTO.has("bp")
              ? <p className="text-sm text-slate-400 italic py-2">{t("preop.unableToObtain")}</p>
              : <div className={`flex items-center gap-3 ${fe("bp")}`}>
                  <div className="flex-1">
                    <p className="text-xs text-slate-400 text-center mb-1">{t("preop.systolic")}</p>
                    <Controller name="bpSystolic" control={control} render={({ field }) => (
                      <NumberStepper value={field.value} onChange={field.onChange} min={0} max={260} showSlider />
                    )} />
                  </div>
                  <span className="text-2xl font-light text-slate-300 mt-4">/</span>
                  <div className="flex-1">
                    <p className="text-xs text-slate-400 text-center mb-1">{t("preop.diastolic")}</p>
                    <Controller name="bpDiastolic" control={control} render={({ field }) => (
                      <NumberStepper value={field.value} onChange={field.onChange} min={0} max={160} showSlider />
                    )} />
                  </div>
                </div>
            }
            {fieldErrors.has("bp") && !vitalsUTO.has("bp") && <p className="text-red-500 text-xs">{t("common.required")}</p>}
          </div>

          {[
            { id: "heartRate",      label: t("preop.heartRate"),      min: 0, max: 250, step: 1,   unit: "bpm",  required: true, slider: true },
            { id: "spO2",           label: t("preop.spO2"),           min: 0, max: 100, step: 1,   unit: "%",    slider: true },
            { id: "temperature",    label: t("preop.temperature"),    min: 0, max: 42,  step: 0.1, unit: "°C",   slider: true },
            { id: "respiratoryRate",label: t("preop.respiratoryRate"),min: 0, max: 60,  step: 1,   unit: "/min", required: true, slider: true },
          ].map(v => (
            <div key={v.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {v.label}{v.required && <span className="text-red-500 ml-0.5">*</span>}
                  </Label>
                  {v.id === "heartRate" && (
                    <Controller name="heartArrhythmia" control={control} render={({ field }) => (
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <Checkbox checked={!!field.value} onCheckedChange={field.onChange} />
                        <span className="text-xs text-slate-500">{t("preop.arrhythmia")}</span>
                      </label>
                    )} />
                  )}
                </div>
                <button type="button"
                  onClick={() => toggleUTO(v.id, () => setValue(v.id as any, undefined))}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-all ${vitalsUTO.has(v.id) ? "bg-slate-200 border-slate-400 text-slate-700 font-semibold" : "border-slate-200 text-slate-400 hover:border-slate-300"}`}>
                  {t("preop.unableToObtain")}
                </button>
              </div>
              {vitalsUTO.has(v.id)
                ? <p className="text-sm text-slate-400 italic py-2">{t("preop.unableToObtain")}</p>
                : <>
                    <Controller name={v.id as any} control={control} render={({ field }) => (
                      <div className={fe(v.id)}>
                        <NumberStepper value={field.value} onChange={field.onChange} min={v.min} max={v.max} step={v.step} unit={v.unit} showSlider={v.slider} />
                      </div>
                    )} />
                    {fieldErrors.has(v.id) && <p className="text-red-500 text-xs">{t("common.required")}</p>}
                  </>
              }
            </div>
          ))}

        </div>

        {/* Physical Exam Report */}
        <div className="space-y-1 pt-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("preop.physicalExamReport")}</Label>
          <Textarea placeholder={t("preop.physicalExamPlaceholder")} rows={3} {...register("physicalExamReport")} />
        </div>
      </SectionCard>
      </div>

      {/* Airway */}
      <div ref={el => { refMap.current.airway = el }} data-tour="preop-airway">
      <SectionCard title={`${t("preop.airwaySection")} *`} error={fieldErrors.has("airway")} action={
        <button type="button"
          onClick={() => setAirwayUTO(v => !v)}
          className={`text-xs px-3 py-1 rounded-full border transition-all ${airwayUTO ? "bg-slate-200 border-slate-400 text-slate-700 font-semibold" : "border-slate-200 text-slate-400 hover:border-slate-300"}`}>
          {t("preop.unableToObtain")}
        </button>
      }>
        {airwayUTO ? (
          <p className="text-sm text-slate-400 italic py-4 text-center">{t("preop.airwayUTO")}</p>
        ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="space-y-2 col-span-2 sm:col-span-3">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("preop.mallampati")}</Label>
            <Controller name="mallampati" control={control} render={({ field }) => (
              <div className="grid grid-cols-4 gap-2">
                {[
                  { v:"I",   desc:"Soft palate, uvula, fauces, pillars", color:"bg-green-500  border-green-500  text-white dark:bg-green-700  dark:border-green-500" },
                  { v:"II",  desc:"Soft palate, uvula, fauces",          color:"bg-yellow-500 border-yellow-500 text-white dark:bg-yellow-700 dark:border-yellow-500" },
                  { v:"III", desc:"Soft palate, base of uvula",           color:"bg-orange-500 border-orange-500 text-white dark:bg-orange-700 dark:border-orange-500" },
                  { v:"IV",  desc:"Hard palate only",                    color:"bg-red-500    border-red-500    text-white dark:bg-red-700    dark:border-red-500"    },
                ].map(opt => (
                  <button key={opt.v} type="button"
                    onClick={() => field.onChange(field.value === opt.v ? undefined : opt.v)}
                    className={`rounded-xl border-2 p-3 text-center transition-all ${field.value === opt.v ? opt.color+" scale-105 shadow-sm" : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#555]"}`}>
                    <div className="text-xl font-bold">{opt.v}</div>
                    <div className="text-[10px] mt-1 leading-tight">{opt.desc}</div>
                  </button>
                ))}
              </div>
            )} />
          </div>
          <div className="space-y-1">
            <Label>{t("preop.mouthOpening")}</Label>
            <Controller name="mouthOpeningCm" control={control} render={({ field }) => (
              <NumberStepper value={field.value} onChange={field.onChange} min={0.5} max={8} step={0.5} unit="cm" />
            )} />
          </div>
          <div className="space-y-1">
            <Label>{t("preop.thyromental")}</Label>
            <Controller name="thyromental" control={control} render={({ field }) => (
              <NumberStepper value={field.value} onChange={field.onChange} min={3} max={12} step={0.5} unit="cm" />
            )} />
          </div>
          <div className="space-y-2 col-span-2 sm:col-span-3">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("preop.neckMobility")}</Label>
            <Controller name="neckMobility" control={control} render={({ field }) => (
              <div className="flex gap-3">
                {[
                  { v:"FULL",    label:t("preop.neckFull"),    color:"bg-green-500  border-green-500  text-white dark:bg-green-700  dark:border-green-500" },
                  { v:"LIMITED", label:t("preop.neckLimited"), color:"bg-yellow-500 border-yellow-500 text-white dark:bg-yellow-700 dark:border-yellow-500" },
                  { v:"FIXED",   label:t("preop.neckFixed"),   color:"bg-red-500    border-red-500    text-white dark:bg-red-700    dark:border-red-500"    },
                ].map(opt => (
                  <button key={opt.v} type="button"
                    onClick={() => field.onChange(field.value === opt.v ? undefined : opt.v)}
                    className={`flex-1 rounded-xl border-2 py-2.5 font-semibold text-sm transition-all ${field.value === opt.v ? opt.color+" scale-105 shadow-sm" : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#555]"}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            )} />
          </div>
          <div className="space-y-2 col-span-2 sm:col-span-3">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("preop.upperLipBite")}</Label>
            <Controller name="upperLipBiteTest" control={control} render={({ field }) => (
              <div className="flex gap-3">
                {[
                  { v:"CLASS_I",   label:"Class I",   desc:"Incisors bite above vermillion",  color:"bg-green-500  border-green-500  text-white dark:bg-green-700  dark:border-green-500" },
                  { v:"CLASS_II",  label:"Class II",  desc:"Incisors bite below vermillion",  color:"bg-yellow-500 border-yellow-500 text-white dark:bg-yellow-700 dark:border-yellow-500" },
                  { v:"CLASS_III", label:"Class III", desc:"Cannot bite upper lip",            color:"bg-red-500    border-red-500    text-white dark:bg-red-700    dark:border-red-500"    },
                ].map(opt => (
                  <button key={opt.v} type="button"
                    onClick={() => field.onChange(field.value === opt.v ? undefined : opt.v)}
                    className={`flex-1 rounded-xl border-2 p-3 text-center transition-all ${field.value === opt.v ? opt.color+" scale-105 shadow-sm" : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#555]"}`}>
                    <div className="font-bold">{opt.label}</div>
                    <div className="text-[10px] mt-0.5 leading-tight">{opt.desc}</div>
                  </button>
                ))}
              </div>
            )} />
          </div>
          <div className="space-y-2 col-span-2 sm:col-span-3">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("preop.cormackLehane")}</Label>
            <Controller name="cormackLehane" control={control} render={({ field }) => (
              <div className="flex gap-2">
                {[
                  { v:"I",   desc:"Full glottis",          color:"bg-green-500  border-green-500  text-white dark:bg-green-700  dark:border-green-500" },
                  { v:"IIa", desc:"Posterior glottis",     color:"bg-lime-500   border-lime-500   text-white dark:bg-lime-700   dark:border-lime-500"   },
                  { v:"IIb", desc:"Arytenoids only",       color:"bg-yellow-500 border-yellow-500 text-white dark:bg-yellow-700 dark:border-yellow-500" },
                  { v:"III", desc:"Epiglottis only",       color:"bg-orange-500 border-orange-500 text-white dark:bg-orange-700 dark:border-orange-500" },
                  { v:"IV",  desc:"No glottic structures", color:"bg-red-500    border-red-500    text-white dark:bg-red-700    dark:border-red-500"    },
                ].map(opt => (
                  <button key={opt.v} type="button"
                    onClick={() => field.onChange(field.value === opt.v ? undefined : opt.v)}
                    className={`flex-1 rounded-xl border-2 p-2 text-center transition-all ${field.value === opt.v ? opt.color+" scale-105 shadow-sm" : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#555]"}`}>
                    <div className="text-lg font-bold">{opt.v}</div>
                    <div className="text-[9px] mt-0.5 leading-tight">{opt.desc}</div>
                  </button>
                ))}
              </div>
            )} />
          </div>
          <div className="space-y-2 col-span-2 sm:col-span-3">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("preop.airwayFeatures")}</Label>
            <div className="flex flex-wrap gap-2">
              {[
                { id:"retrognathia",           label:t("preop.retrognathia") },
                { id:"prominentIncisors",      label:t("preop.prominentIncisors") },
                { id:"facialHair",             label:t("preop.facialHair") },
                { id:"difficultAirwayHistory", label:t("preop.difficultAirway") },
              ].map(item => (
                <Controller key={item.id} name={item.id as any} control={control} render={({ field }) => (
                  <button type="button"
                    onClick={() => field.onChange(!field.value)}
                    className={`px-4 py-2 rounded-full border-2 text-sm font-medium transition-all ${field.value ? "bg-amber-50 border-amber-400 text-amber-800 scale-105" : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#555]"}`}>
                    {item.label}
                  </button>
                )} />
              ))}
            </div>
          </div>
        </div>
        )}
        {!airwayUTO && difficultAirwayHistory && (
          <div className="space-y-1">
            <Label>{t("common.details")}</Label>
            <Textarea placeholder={t("preop.difficultAirwayDetails")} {...register("difficultAirwayNotes")} />
          </div>
        )}
        {fieldErrors.has("airway") && !airwayUTO && (
          <p className="text-red-500 text-xs pt-1">{t("preop.mallampatiRequired")}</p>
        )}
      </SectionCard>
      </div>
      </div>

      {/* ── Risk & ASA tab ────────────────────────────────────────── */}
      <div className={layoutMode === "tabs" && activeTab !== "risk" ? "hidden" : "space-y-6"}>
      {/* Lab Results */}
      <SectionCard title={t("preop.labSection")}>
        <Controller name="labResults" control={control} render={({ field }) => (
          <LabResults
            value={(field.value ?? []) as LabResult[]}
            onChange={field.onChange}
          />
        )} />
      </SectionCard>

      {/* ASA */}
      <div ref={el => { refMap.current.asa = el }} data-tour="preop-scores">
      <SectionCard title={`${t("preop.riskSection")} *`} error={fieldErrors.has("asaScore")}>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>{t("preop.asaLabel")} <span className="text-red-500">*</span></Label>
            {asaSuggestion && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 space-y-1">
                <div className="flex items-center gap-2 text-sm text-blue-700">
                  <Lightbulb className="h-4 w-4 shrink-0" />
                  <span>{t("preop.asaSuggested")}: <strong>ASA {asaSuggestion.cls}</strong> — {t("preop.asaReview")}</span>
                </div>
                {asaSuggestion.reasons.length > 0 && (
                  <ul className="text-xs text-blue-600 pl-6 list-disc space-y-0.5">
                    {asaSuggestion.reasons.map(r => <li key={r}>{r}</li>)}
                  </ul>
                )}
              </div>
            )}
            {emergencySurgery && (
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                🚨 Emergency surgery — ASA class will be suffixed with E
              </div>
            )}
            <Controller name="asaScore" control={control} render={({ field }) => (
              <div className={`grid grid-cols-3 sm:grid-cols-6 gap-2 ${fe("asaScore")}`}>
                {[
                  { v:"I",   desc:"Normal healthy patient",               color:"bg-green-500  border-green-500  text-white dark:bg-green-700  dark:border-green-500" },
                  { v:"II",  desc:"Mild systemic disease",                color:"bg-lime-500   border-lime-500   text-white dark:bg-lime-700   dark:border-lime-500"   },
                  { v:"III", desc:"Severe systemic disease",              color:"bg-yellow-500 border-yellow-500 text-white dark:bg-yellow-700 dark:border-yellow-500" },
                  { v:"IV",  desc:"Constant threat to life",              color:"bg-orange-500 border-orange-500 text-white dark:bg-orange-700 dark:border-orange-500" },
                  { v:"V",   desc:"Moribund patient",                     color:"bg-red-500    border-red-500    text-white dark:bg-red-700    dark:border-red-500"    },
                  { v:"VI",  desc:"Brain-dead organ donor",               color:"bg-slate-500  border-slate-500  text-white dark:bg-slate-600  dark:border-slate-400"  },
                ].map(opt => {
                  const label = emergencySurgery && opt.v !== "VI" ? `${opt.v}E` : opt.v
                  return (
                    <button key={opt.v} type="button"
                      onClick={() => field.onChange(field.value === opt.v ? undefined : opt.v)}
                      className={`rounded-xl border-2 p-3 text-center transition-all ${field.value === opt.v ? opt.color + " scale-105 shadow-sm" : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#555]"}`}>
                      <div className="text-xl font-bold">{label}</div>
                      <div className="text-[9px] mt-1 leading-tight">{opt.desc}</div>
                    </button>
                  )
                })}
              </div>
            )} />
          </div>
          {fieldErrors.has("asaScore") && <p className="text-red-500 text-xs">ASA class is required.</p>}
          <p className="text-xs text-slate-500">{t("preop.scoresNote")}</p>
        </div>

        {/* Calculated risk scores */}
        <div className="pt-1 border-t border-slate-100 dark:border-[#2a2a2a]">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Calculated Risk Scores</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-200 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#181818] p-4">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">RCRI — Cardiac risk</p>
              <p className="text-3xl font-bold text-slate-700 dark:text-slate-100">
                {rcriScore}
                <span className="text-base font-normal text-slate-400">/6</span>
              </p>
              <p className={`text-xs font-semibold mt-1.5 ${rcriScore >= 3 ? "text-red-500" : rcriScore === 2 ? "text-amber-500" : "text-emerald-600"}`}>
                {rcriRiskLabel(rcriScore)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#181818] p-4">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">APFEL — PONV risk</p>
              <p className="text-3xl font-bold text-slate-700 dark:text-slate-100">
                {apfelScore}
                <span className="text-base font-normal text-slate-400">/4</span>
              </p>
              <p className={`text-xs font-semibold mt-1.5 ${apfelScore >= 3 ? "text-red-500" : apfelScore === 2 ? "text-amber-500" : "text-emerald-600"}`}>
                {apfelRiskLabel(apfelScore)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#181818] p-4">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">STOP-BANG — OSA</p>
              <p className="text-3xl font-bold text-slate-700 dark:text-slate-100">
                {stopBangScore}
                <span className="text-base font-normal text-slate-400">/8</span>
              </p>
              <p className={`text-xs font-semibold mt-1.5 ${stopBangScore >= 5 ? "text-red-500" : stopBangScore >= 3 ? "text-amber-500" : "text-emerald-600"}`}>
                {stopBangRiskLabel(stopBangScore)}
              </p>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-1 pt-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</Label>
          <Textarea placeholder="No patient-identifying information — additional clinical notes, anaesthesia-specific considerations…" rows={3} {...register("notes")} />
        </div>
      </SectionCard>
      </div>

      {/* AI advisor opt-in */}
      <div className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#1c1c1c] px-4 py-3">
        <Controller name="aiOptIn" control={control} render={({ field }) => (
          <input type="checkbox" id="aiOptIn" checked={!!field.value} onChange={e => field.onChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0" />
        )} />
        <div>
          <label htmlFor="aiOptIn" className="text-sm font-medium text-slate-700 dark:text-slate-200 cursor-pointer">
            Enable AI pre-operative advisor for this case
          </label>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Optional. The AI receives only structured clinical fields — no names, notes, or free-text. EU-hosted (Mistral).
          </p>
        </div>
      </div>

      {watch("aiOptIn") && <AIAdvisor getFormData={getValues} />}
      </div>

      {fieldErrors.size > 0 && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          <p className="font-semibold mb-1">Please complete the required fields:</p>
          <ul className="list-disc list-inside space-y-0.5 text-xs">
            {fieldErrors.has("ageYears")    && <li>Age</li>}
            {fieldErrors.has("sex")         && <li>Sex</li>}
            {fieldErrors.has("diagnoses")   && <li>At least one diagnosis</li>}
            {fieldErrors.has("procedures")  && <li>At least one planned procedure</li>}
            {fieldErrors.has("bp")          && <li>Blood pressure</li>}
            {fieldErrors.has("heartRate")   && <li>Heart rate</li>}
            {fieldErrors.has("respiratoryRate") && <li>Respiratory rate</li>}
            {fieldErrors.has("airway")      && <li>Airway evaluation (or mark Unable to Obtain)</li>}
            {fieldErrors.has("asaScore")    && <li>ASA physical status class</li>}
          </ul>
        </div>
      )}

      <div className="flex justify-end" data-tour="preop-submit">
        <Button type="submit" size="lg" className="gap-2 bg-blue-600 hover:bg-blue-700">
          {t("preop.continueIntraop")} <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </form>
  )
}
