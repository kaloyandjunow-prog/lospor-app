"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { Progress } from "@/components/ui/progress"
import { PreopForm, type PreopData } from "@/components/forms/PreopForm"
import { IntraopForm, type IntraopData } from "@/components/forms/IntraopForm"
import { type TimetableData } from "@/components/IntraopTimetable"
import { PostopForm, type PostopData } from "@/components/forms/PostopForm"
import { UserRound, CheckCircle2 } from "lucide-react"
import { CaseMeta } from "@/components/CaseMeta"
import { calcBMI } from "@/lib/scores"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { CaseSummary } from "@/components/CaseSummary"
import { useTour } from "@/context/TourContext"

type SaveStatus = "idle" | "saving" | "saved" | "error"

export default function NewCasePage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations()
  const STEPS = [t("case.steps.preop"), t("case.steps.intraop"), t("case.steps.postop"), t("case.steps.summary")]

  const { setCurrentFormStep } = useTour()

  const [step, setStep]               = useState(0)
  const [caseId, setCaseId]           = useState<string | null>(null)
  const [preopData, setPreopData]     = useState<PreopData | null>(null)
  const [intraopData, setIntraopData] = useState<IntraopData | null>(null)
  const [timetableDefault, setTimetableDefault] = useState<TimetableData | null>(null)
  const [continuedPostopItems, setContinuedPostopItems] = useState<string[]>([])
  const [layoutMode, setLayoutMode]   = useState<"tabs" | "scroll">("scroll")

  useEffect(() => {
    const stored = localStorage.getItem("layoutMode")
    if (stored === "tabs" || stored === "scroll") setLayoutMode(stored)
    const handler = (e: StorageEvent) => {
      if (e.key === "layoutMode" && (e.newValue === "tabs" || e.newValue === "scroll"))
        setLayoutMode(e.newValue)
    }
    window.addEventListener("storage", handler)
    return () => window.removeEventListener("storage", handler)
  }, [])
  const [submitting, setSubmitting]   = useState(false)
  const [saveStatus, setSaveStatus]   = useState<SaveStatus>("idle")
  const [loading, setLoading]         = useState(false)
  const [patientName, setPatientName] = useState("")
  const [patientId,   setPatientId]   = useState("")
  const [caseCode, setCaseCode]       = useState<string | null>(null)

  // Sync current form step into TourContext so TourButton and TourManager can react
  useEffect(() => {
    setCurrentFormStep(step)
    return () => setCurrentFormStep(null)
  }, [step, setCurrentFormStep])

  // Refs for synchronous access inside async callbacks
  const caseIdRef  = useRef<string | null>(null)
  const savingRef  = useRef(false)

  // Load existing draft when ?continue=<id> is in the URL
  useEffect(() => {
    const continueId = searchParams.get("continue")
    const stepParam  = searchParams.get("step")
    if (!continueId) return
    setLoading(true)
    fetch(`/api/cases/${continueId}`)
      .then(r => r.json())
      .then(record => {
        caseIdRef.current = continueId
        setCaseId(continueId)
        if (record.caseCode) setCaseCode(record.caseCode)
        if (record.preop)   setPreopData(dbPreopToForm(record.preop) as PreopData)
        if (record.intraop) {
          const endTimeNextDay = !!(record.intraop.endTime &&
            new Date(record.intraop.endTime).getTime() - new Date(record.intraop.startTime).getTime() > 12 * 60 * 60 * 1000)
          setIntraopData({
            ...record.intraop,
            monthYear:      record.intraop.monthYear ?? undefined,
            startTime:      isoToHHMM(record.intraop.startTime),
            endTime:        record.intraop.endTime ? isoToHHMM(record.intraop.endTime) : undefined,
            endTimeNextDay,
          })
          // keyEvents must be a non-array object with a "vitals" key — the old
          // Prisma default was "[]" which is an array; skip that gracefully.
          const ke = record.intraop.keyEvents
          if (ke && typeof ke === "object" && !Array.isArray(ke) && "vitals" in (ke as object)) {
            try { setTimetableDefault(ke as TimetableData) } catch {}
          }
        }
        // URL step param wins; fall back to deriving from saved data
        const target = stepParam
          ? Math.max(0, Math.min(2, parseInt(stepParam)))
          : record.postop ? 2 : record.intraop ? 1 : 0
        setStep(target)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep ?step= in sync so refresh lands on the right step
  useEffect(() => {
    if (!caseId) return
    router.replace(`/cases/new?continue=${caseId}&step=${step}`, { scroll: false })
  }, [step, caseId])

  // Convert Prisma DateTime → HH:MM. DB values are stored in UTC (ref date 2000-01-01),
  // so read UTC hours/minutes to recover the original local time the user entered.
  function isoToHHMM(iso: any): string | undefined {
    if (!iso) return undefined
    if (typeof iso === "string" && /^\d{2}:\d{2}$/.test(iso)) return iso
    try {
      const d = new Date(iso)
      if (!isNaN(d.getTime())) return `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`
    } catch {}
    return undefined
  }


  // Convert flat DB preop record → PreopForm defaultValues shape
  // Only map fields that exist in the PreopForm schema — strip all DB-only fields
  // (id, caseId, bmi, rcriScore, gutaScore, apfelScore, stopBangScore, createdAt, etc.)
  function dbPreopToForm(p: any): Partial<PreopData> {
    const toTags = (str: string | null | undefined) =>
      str ? str.split(/[;,]/).map(s => s.trim()).filter(Boolean).map(label => ({ label })) : []

    return {
      // Demographics
      ageYears:  p.ageYears  ?? undefined,
      sex:       p.sex       ?? undefined,
      heightCm:  p.heightCm  ?? undefined,
      weightKg:  p.weightKg  ?? undefined,
      bloodType: p.bloodType ?? undefined,
      rhFactor:  p.rhFactor  ?? undefined,

      // Case — DB stores joined strings, form expects Tag arrays
      diagnoses:          toTags(p.diagnosis),
      procedures:         toTags(p.plannedProcedure),
      teamNotes:            p.teamNotes            ?? undefined,
      highRiskSurgery:      p.highRiskSurgery      ?? false,
      emergencySurgery:     p.emergencySurgery      ?? false,

      // Medical history
      comorbidities: Array.isArray(p.comorbidities)
        ? p.comorbidities.map((c: any) => typeof c === "string" ? { label: c } : c)
        : [],

      // Safety
      allergies:                p.allergies                ?? false,
      allergyDetails:           toTags(p.allergyDetails),
      latexAllergy:             p.latexAllergy             ?? false,
      currentMedications:       toTags(p.currentMedications),
      familyAnesthesiaProblems: p.familyAnesthesiaProblems ?? false,
      familyAnesthesiaDetails:  p.familyAnesthesiaDetails  ?? undefined,
      dentalProsthetics:        p.dentalProsthetics        ?? false,
      looseTeeth:               p.looseTeeth               ?? false,
      smoking:                  p.smoking                  ?? false,
      substanceAbuse:           p.substanceAbuse           ?? false,

      // Vitals
      bpSystolic:      p.bpSystolic      ?? undefined,
      bpDiastolic:     p.bpDiastolic     ?? undefined,
      heartRate:       p.heartRate       ?? undefined,
      heartArrhythmia: p.heartArrhythmia ?? false,
      spO2:            p.spO2            ?? undefined,
      temperature:     p.temperature     ?? undefined,
      respiratoryRate: p.respiratoryRate ?? undefined,

      // Airway
      mallampati:             p.mallampati             ?? undefined,
      mouthOpeningCm:         p.mouthOpeningCm         ?? undefined,
      thyromental:            p.thyromental            ?? undefined,
      neckMobility:           p.neckMobility           ?? undefined,
      upperLipBiteTest:       p.upperLipBiteTest       ?? undefined,
      retrognathia:           p.retrognathia           ?? false,
      prominentIncisors:      p.prominentIncisors      ?? false,
      facialHair:             p.facialHair             ?? false,
      difficultAirwayHistory: p.difficultAirwayHistory ?? false,
      difficultAirwayNotes:   p.difficultAirwayNotes   ?? undefined,
      cormackLehane:          p.cormackLehane          ?? undefined,

      // Scores
      asaScore: p.asaScore ?? undefined,

      // Free text
      physicalExamReport: p.physicalExamReport ?? undefined,
      notes:              p.notes              ?? undefined,

      labResults: Array.isArray(p.labResults) ? p.labResults : [],

      // Patient fields (never saved to DB — intentionally left empty for GDPR)
      patientFirstName: undefined,
      patientLastName:  undefined,
      patientId:        undefined,
    }
  }

  // ── Core save / patch function ──────────────────────────────────────────────
  const saveSection = useCallback(async (
    section: "preop" | "intraop" | "postop",
    data: any,
    { showToast = false, nextStep }: { showToast?: boolean; nextStep?: number } = {}
  ) => {
    try {
      if (!caseIdRef.current) {
        // First save: create the case
        const bmi = data.heightCm && data.weightKg ? calcBMI(data.heightCm, data.weightKg) : 0
        const res = await fetch("/api/cases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preop: { ...data, bmi } }),
        })
        if (!res.ok) throw new Error()
        const { id, caseCode: code } = await res.json()
        caseIdRef.current = id
        setCaseId(id)
        if (code) setCaseCode(code)
        // Update URL so page refresh restores the correct step
        router.replace(`/cases/new?continue=${id}`, { scroll: false })
      } else {
        // Update existing case
        const bmi = section === "preop" && data.heightCm && data.weightKg
          ? calcBMI(data.heightCm, data.weightKg) : undefined
        const payload = section === "preop" ? { ...data, bmi } : data
        const res = await fetch(`/api/cases/${caseIdRef.current}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [section]: payload }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? "Save failed")
        }
      }

      if (showToast) toast.success(
        section === "preop"   ? "Preoperative data saved"   :
        section === "intraop" ? "Intraoperative data saved" : t("case.savedSuccess")
      )
      return true
    } catch (err: any) {
      console.error("saveSection error:", err)
      if (showToast) toast.error(err?.message ?? t("case.saveFailed"))
      return false
    }
  }, [t])

  // ── Auto-save (debounced, called by each form) ──────────────────────────────
  const handleAutoSave = useCallback(async (section: "preop" | "intraop" | "postop", data: any) => {
    if (savingRef.current) return
    savingRef.current = true
    setSaveStatus("saving")
    const ok = await saveSection(section, data)
    setSaveStatus(ok ? "saved" : "error")
    savingRef.current = false
    if (ok) {
      // Fade back to idle after 2s
      setTimeout(() => setSaveStatus(s => s === "saved" ? "idle" : s), 2000)
    }
  }, [saveSection])

  // ── Manual submit handlers — step advances regardless of save result ─────────
  async function handlePreopSubmit(data: PreopData) {
    setPreopData(data)
    setStep(1); window.scrollTo(0, 0)
    // Save in background — don't block navigation on success/failure
    setSubmitting(true)
    await saveSection("preop", data, { showToast: true })
    setSubmitting(false)
  }

  async function handleIntraopSubmit(data: IntraopData) {
    setIntraopData(data)
    setStep(2); window.scrollTo(0, 0)
    if (!caseIdRef.current) return
    setSubmitting(true)
    await saveSection("intraop", data, { showToast: true })
    setSubmitting(false)
  }

  async function handlePostopSubmit(postopData: PostopData) {
    if (!caseIdRef.current) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/cases/${caseIdRef.current}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postop: postopData, status: "COMPLETE" }),
      })
      if (!res.ok) throw new Error()
      toast.success(t("case.savedSuccess"))
      setStep(3); window.scrollTo(0, 0)
    } catch {
      toast.error(t("case.saveFailed"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={`${step === 1 ? "max-w-6xl" : "max-w-4xl"} mx-auto space-y-8 transition-all`}>
      <div className="no-print flex items-center gap-4">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-950 border-2 border-blue-100 dark:border-blue-900 shrink-0">
          <UserRound className="h-9 w-9 text-blue-500 dark:text-blue-400" strokeWidth={1.5} />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-800">
            {patientName
              ? <>{patientName}{patientId && <span className="text-slate-400 font-normal text-lg"> — ID: {patientId}</span>}</>
              : t("case.newTitle")
            }
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">{t("case.newSubtitle")}</p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          {caseId && caseCode && (
            <CaseMeta caseId={caseId} caseCode={caseCode} />
          )}
          <div className="text-xs">
            {saveStatus === "saving" && <span className="text-slate-400 animate-pulse">Saving draft…</span>}
            {saveStatus === "saved"  && <span className="text-green-500">✓ Draft saved</span>}
            {saveStatus === "error"  && <span className="text-red-400">Auto-save failed</span>}
          </div>
        </div>
      </div>

      <div className="no-print space-y-3">
        <Progress value={((step + 1) / STEPS.length) * 100} className="h-2" />
        <div className="flex justify-between">
          {STEPS.map((label, i) => {
            const isClickable = step === 3 && i < 3 && !!caseId
            return (
              <button key={label} type="button"
                onClick={() => { if (isClickable) setStep(i) }}
                className={`flex items-center gap-1.5 ${isClickable ? "cursor-pointer hover:opacity-80 transition-opacity" : "cursor-default"}`}>
                {i < step
                  ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                  : <div className={`h-4 w-4 rounded-full border-2 ${i === step ? "border-blue-600 bg-blue-600" : "border-slate-300"}`} />
                }
                <span className={`text-sm font-medium ${i === step ? "text-blue-600" : i < step ? "text-green-600" : "text-slate-400"} ${isClickable ? "underline underline-offset-2" : ""}`}>
                  {label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <span className="animate-pulse">Loading draft…</span>
        </div>
      )}

      {!loading && step === 0 && (
        <PreopForm
          defaultValues={preopData ?? undefined}
          onSubmit={handlePreopSubmit}
          onNameChange={setPatientName}
          onIdChange={setPatientId}
          onAutoSave={data => handleAutoSave("preop", data)}
        />
      )}
      {!loading && step === 1 && (
        <IntraopForm
          defaultValues={intraopData ?? undefined}
          defaultTimetable={timetableDefault ?? undefined}
          preop={preopData ? {
            asaScore:              preopData.asaScore,
            ageYears:              preopData.ageYears,
            heightCm:              preopData.heightCm,
            weightKg:              preopData.weightKg,
            sex:                   preopData.sex,
            bmi:                   preopData.heightCm && preopData.weightKg ? Math.round(preopData.weightKg / ((preopData.heightCm / 100) ** 2) * 10) / 10 : undefined,
            bpSystolic:            preopData.bpSystolic,
            bpDiastolic:           preopData.bpDiastolic,
            heartRate:             preopData.heartRate,
            spO2:                  preopData.spO2,
            mallampati:            preopData.mallampati,
            difficultAirwayHistory: preopData.difficultAirwayHistory,
            allergies:             preopData.allergies,
            allergyDetails:        preopData.allergyDetails as any,
            comorbidities:         preopData.comorbidities as any,
            labResults:            (preopData as any).labResults,
            diagnosis:             (preopData.diagnoses as any[])?.map((t: any) => t.label).join("; ") || null,
            plannedProcedure:      (preopData.procedures as any[])?.map((t: any) => t.label).join("; ") || null,
            emergencySurgery:      preopData.emergencySurgery ?? null,
          } : null}
          caseStarted={!!(intraopData?.startTime)}
          onSubmit={handleIntraopSubmit}
          onBack={() => setStep(0)}
          onAutoSave={data => handleAutoSave("intraop", data)}
          onPostopContinued={items => setContinuedPostopItems(items)}
          layoutMode={layoutMode}
        />
      )}
      {!loading && step === 2 && (
        <PostopForm
          onSubmit={handlePostopSubmit}
          onBack={() => setStep(1)}
          submitting={submitting}
          onAutoSave={data => handleAutoSave("postop", data)}
          initialComplicationsText={continuedPostopItems.length > 0 ? `Continued postoperatively: ${continuedPostopItems.join(", ")}` : undefined}
        />
      )}

      {/* Step 3: Case summary / protocol preview */}
      {step === 3 && caseId && (
        <div className="space-y-4">
          {/* Success banner — hidden on print */}
          <div className="no-print rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 px-5 py-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
            <div>
              <p className="font-semibold text-green-800 dark:text-green-300">Case saved successfully</p>
              <p className="text-sm text-green-600 dark:text-green-400">Click "Print / Save as PDF" to generate the protocol.</p>
            </div>
          </div>

          {/* Case summary — patient name dialog is inside CaseSummary */}
          <div data-tour="summary-print" className="no-print absolute opacity-0 pointer-events-none" aria-hidden />
          <CaseSummary caseId={caseId} />

          {/* Navigation — hidden on print */}
          <div className="no-print flex justify-between items-center pt-2">
            <Button variant="outline" onClick={() => setStep(2)}>← Edit postop</Button>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => router.push("/dashboard")}>Dashboard</Button>
              <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => router.push(`/cases/${caseId}`)}>
                Go to case →
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
