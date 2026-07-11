"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { Progress } from "@/components/ui/progress"
import { PreopForm, type PreopData } from "@/components/forms/PreopForm"
import { IntraopForm, type IntraopData } from "@/components/forms/IntraopForm"
import { type TimetableData } from "@/components/IntraopTimetable"
import type { LogEvent } from "@/types/timetable"
import type { CaseDetail, CaseDetailPreop, CaseDetailIntraop, CaseDetailPostop } from "@/types/case-detail"
import { PostopForm, type PostopData } from "@/components/forms/PostopForm"
import { UserRound, CheckCircle2 } from "lucide-react"
import { CaseMeta } from "@/components/CaseMeta"
import { calcBMI } from "@/lib/scores"
import { FINALIZE_UNDO_WINDOW_MS } from "@/lib/constants"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { CaseSummary } from "@/components/CaseSummary"
import { useTour } from "@/context/TourContext"
import { useCaseLock } from "@/hooks/useCaseLock"
import { WatchingBanner } from "@/components/WatchingBanner"
import { ConflictModal } from "@/components/ConflictModal"
import {
  classifyPatchResponse,
  createCaseWriteQueue,
  sendWithConflictRetry,
  FORCE_UPDATE_HEADER,
  SECTION_CONFLICT_HEADER,
  type CasePatchResponse,
  type ConflictBody,
  type ConflictRetryOutcome,
} from "@lospor/core/sync"
import { caseOutbox, isNetworkSaveError } from "@/lib/case-outbox"
import { useOutboxFlusher } from "@/hooks/useOutboxFlusher"

type SaveStatus = "idle" | "saving" | "saved" | "queued" | "error"

interface ConflictState {
  open: boolean
  localValues: Record<string, unknown>
  serverValues: Record<string, unknown>
  section: "preop" | "intraop" | "postop"
  pendingData: PreopData | IntraopData | PostopData
  nextStep?: number
  showToast?: boolean
}

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
  const [eventLog, setEventLog] = useState<LogEvent[]>([])

  async function handleDeleteEvent(evId: string) {
    if (!caseId) return
    const newLog = eventLog.filter(e => e.id !== evId)
    const previousLog = eventLog
    setEventLog(newLog)
    try {
      const res = await fetch(`/api/cases/${caseId}/events`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(intraopUpdatedAtRef.current ? { "x-lospor-intraop-updated-at": intraopUpdatedAtRef.current } : {}),
        },
        body: JSON.stringify({ log: newLog }),
      })
      if (res.ok) {
        const body = await res.json().catch(() => ({}))
        if (body.intraopUpdatedAt) intraopUpdatedAtRef.current = new Date(body.intraopUpdatedAt).toISOString()
      } else {
        setEventLog(previousLog)
        console.error("[intraop event] delete failed", await res.text().catch(() => ""))
      }
    } catch (err) {
      setEventLog(previousLog)
      console.error("[intraop event] delete failed", err)
    }
  }
  // Per-action event from the intraop timetable (bolus/infusion/agent/fluid/
  // clinical event) - posts one CaseEvent row, mirroring how mobile already
  // persists these, instead of only the legacy keyEvents JSON blob.
  async function handleLogEvent(event: LogEvent) {
    if (!caseIdRef.current) return
    setEventLog(prev => [event, ...prev])
    try {
      const res = await fetch(`/api/cases/${caseIdRef.current}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      })
      if (!res.ok) console.error("[intraop event] save failed", await res.text().catch(() => ""))
      else {
        const body = await res.json().catch(() => ({}))
        if (body.intraopUpdatedAt) intraopUpdatedAtRef.current = new Date(body.intraopUpdatedAt).toISOString()
      }
    } catch (err) {
      console.error("[intraop event] save failed", err)
    }
  }
  // Deleting an infusion/fluid bar removes ALL events that share its
  // infId/fluidId (start + any rate changes/stop), via the full-log PUT
  // reconcile - same mechanism handleDeleteEvent already uses, generalized
  // to a correlation-id match instead of a single event id.
  async function handleLogEventDelete(match: { infId?: string; fluidId?: string }) {
    if (!caseIdRef.current) return
    const key = match.infId ? "infId" : "fluidId"
    const value = match.infId ?? match.fluidId
    if (!value) return
    const newLog = eventLog.filter(e => e[key] !== value)
    if (newLog.length === eventLog.length) return
    const previousLog = eventLog
    setEventLog(newLog)
    try {
      const res = await fetch(`/api/cases/${caseIdRef.current}/events`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(intraopUpdatedAtRef.current ? { "x-lospor-intraop-updated-at": intraopUpdatedAtRef.current } : {}),
        },
        body: JSON.stringify({ log: newLog }),
      })
      if (!res.ok) {
        setEventLog(previousLog)
        console.error("[intraop event] delete failed", await res.text().catch(() => ""))
      }
      else {
        const body = await res.json().catch(() => ({}))
        if (body.intraopUpdatedAt) intraopUpdatedAtRef.current = new Date(body.intraopUpdatedAt).toISOString()
      }
    } catch (err) {
      setEventLog(previousLog)
      console.error("[intraop event] delete failed", err)
    }
  }
  const [postopData, setPostopData]   = useState<PostopData | null>(null)
  const [continuedPostopItems, setContinuedPostopItems] = useState<string[]>([])
  const [layoutMode, setLayoutMode]   = useState<"tabs" | "scroll">("scroll")
  const [preopLayout, setPreopLayout] = useState<"tabs" | "scroll">("scroll")
  // 30-minute graceful close window (seconds remaining; null = not started)
  const [closeSecsLeft, setCloseSecsLeft] = useState<number | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    // One-time mount sync from localStorage (can't read it during SSR), plus
    // a storage-event listener for cross-tab updates - same pattern as
    // SettingsMenu.tsx/ThemeToggle.tsx.
    /* eslint-disable react-hooks/set-state-in-effect */
    const stored = localStorage.getItem("layoutMode")
    if (stored === "tabs" || stored === "scroll") setLayoutMode(stored)
    const storedPreop = localStorage.getItem("preopLayout")
    if (storedPreop === "tabs" || storedPreop === "scroll") setPreopLayout(storedPreop)
    const handler = (e: StorageEvent) => {
      if (e.key === "layoutMode" && (e.newValue === "tabs" || e.newValue === "scroll"))
        setLayoutMode(e.newValue)
      if (e.key === "preopLayout" && (e.newValue === "tabs" || e.newValue === "scroll"))
        setPreopLayout(e.newValue)
    }
    window.addEventListener("storage", handler)
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => window.removeEventListener("storage", handler)
  }, [])
  const [submitting, setSubmitting]   = useState(false)
  const [saveStatus, setSaveStatus]   = useState<SaveStatus>("idle")
  const [autoSaveErrMsg, setAutoSaveErrMsg] = useState<string | null>(null)
  const [loading, setLoading]         = useState(false)
  const [patientName, setPatientName] = useState("")
  const [patientId,   setPatientId]   = useState("")
  const [caseCode, setCaseCode]       = useState<string | null>(null)
  const [conflict, setConflict]       = useState<ConflictState | null>(null)
  // Tracks the last known server updatedAt timestamps so conflict headers are sent correctly
  const preopUpdatedAtRef  = useRef<string | null>(null)
  const postopUpdatedAtRef = useRef<string | null>(null)
  const intraopUpdatedAtRef = useRef<string | null>(null)
  // Undo finalization state
  const [finalizedCaseId,   setFinalizedCaseId]   = useState<string | null>(null)
  const [undoSecsLeft,      setUndoSecsLeft]       = useState<number | null>(null)
  const [undoExpired,       setUndoExpired]        = useState(false)
  const undoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const finalizedAtRef = useRef<number | null>(null)

  const { isWatching, holderName, takeover } = useCaseLock(
    caseId,
    step < 3  // only lock during editing steps, not the summary step
  )

  // Replay the offline save tray on reconnect/focus/interval; when queued
  // patches make it to the server, flip the "queued" pill to "saved".
  useOutboxFlusher(useCallback(({ saved }: { saved: number }) => {
    if (saved > 0) {
      setSaveStatus(s => s === "queued" ? "saved" : s)
      setTimeout(() => setSaveStatus(s => s === "saved" ? "idle" : s), 2000)
    }
  }, []))

  // Sync current form step into TourContext so TourButton and TourManager can react
  useEffect(() => {
    setCurrentFormStep(step)
    return () => setCurrentFormStep(null)
  }, [step, setCurrentFormStep])

  // Refs for synchronous access inside async callbacks
  const caseIdRef  = useRef<string | null>(null)
  const savingRef  = useRef(false)
  const startCloseCountdownRef = useRef<() => void>(() => {})
  const dbIntraopToFormRef = useRef<(intraop: CaseDetailIntraop) => Partial<IntraopData>>(() => ({}))

  // Load existing draft when -continue=<id> is in the URL
  useEffect(() => {
    const continueId = searchParams.get("continue")
    const stepParam  = searchParams.get("step")
    if (!continueId) return
    // Async fetch-on-mount with a loading flag - standard data-fetching effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    fetch(`/api/cases/${continueId}`)
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}))
          throw Object.assign(new Error(body.error ?? `Request failed (${r.status})`), { status: r.status })
        }
        return r.json()
      })
      .then((record: CaseDetail) => {
        if (record.status === "COMPLETE") {
          toast(t("case.caseFinalisedRedirect"))
          router.replace(`/cases/${continueId}`)
          return
        }
        caseIdRef.current = continueId
        setCaseId(continueId)
        if (record.caseCode) setCaseCode(record.caseCode)
        if (record.preop)   setPreopData(dbPreopToForm(record.preop) as PreopData)
        if (record.postop)  setPostopData(dbPostopToForm(record.postop))
        preopUpdatedAtRef.current = record.preop?.updatedAt ? new Date(record.preop.updatedAt).toISOString() : null
        postopUpdatedAtRef.current = record.postop?.updatedAt ? new Date(record.postop.updatedAt).toISOString() : null
        intraopUpdatedAtRef.current = record.intraop?.updatedAt ? new Date(record.intraop.updatedAt).toISOString() : null
        if (record.intraop) {
          setIntraopData(dbIntraopToFormRef.current(record.intraop) as IntraopData)
          // keyEvents must be a non-array object with a "vitals" key - the old
          // Prisma default was "[]" which is an array; skip that gracefully.
          const ke = record.intraop.keyEvents
          if (ke && typeof ke === "object" && !Array.isArray(ke) && "vitals" in (ke as object)) {
            try { setTimetableDefault(ke as TimetableData) } catch {}
          }
          // Extract mobile event log if present
          if (ke && typeof ke === "object" && !Array.isArray(ke) && "log" in (ke as object)) {
            const mobileLog = (ke as { log?: unknown }).log
            if (Array.isArray(mobileLog) && mobileLog.length > 0) {
              setEventLog(mobileLog)
            }
          }
        }
        // URL step param wins; fall back to deriving from saved data
        const target = stepParam
          ? Math.max(0, Math.min(3, parseInt(stepParam)))
          : record.postop ? 3 : record.intraop ? 1 : 0
        setStep(target)
        // Re-enter the 30-min window when reopening a case that had postop but isn't finalised
        if (target === 3) {
          startCloseCountdownRef.current()
        }
      })
      .catch((error: Error & { status?: number }) => {
        caseIdRef.current = null
        setCaseId(null)
        if (error.status === 404) {
          toast.error("This draft no longer exists.")
          router.replace("/dashboard")
          return
        }
        toast.error(error.message || t("case.saveFailed"))
      })
      .finally(() => setLoading(false))
  }, [router, searchParams, t])

  // Keep -step= in sync so refresh lands on the right step
  useEffect(() => {
    if (!caseId) return
    router.replace(`/cases/new?continue=${caseId}&step=${step}`, { scroll: false })
  }, [step, caseId, router])

  // Cleanup countdowns on unmount
  useEffect(() => () => { if (closeTimerRef.current) clearInterval(closeTimerRef.current) }, [])
  useEffect(() => () => { if (undoTimerRef.current) clearInterval(undoTimerRef.current) }, [])

  // Convert Prisma DateTime -> HH:MM. DB values are stored in UTC (ref date 2000-01-01),
  // so read UTC hours/minutes to recover the original local time the user entered.
  function isoToHHMM(iso: unknown): string | undefined {
    if (!iso) return undefined
    if (typeof iso === "string" && /^\d{2}:\d{2}$/.test(iso)) return iso
    if (typeof iso !== "string" && typeof iso !== "number" && !(iso instanceof Date)) return undefined
    try {
      const d = new Date(iso)
      if (!isNaN(d.getTime())) return `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`
    } catch {}
    return undefined
  }


  // Convert flat DB preop record -> PreopForm defaultValues shape
  // Only map fields that exist in the PreopForm schema - strip all DB-only fields
  // (id, caseId, bmi, rcriScore, gutaScore, apfelScore, stopBangScore, createdAt, etc.)
  function dbPreopToForm(p: CaseDetailPreop): Partial<PreopData> {
    // Comma-joined fields (allergyDetails, currentMedications)
    const toTags = (str: string | null | undefined) => {
      if (!str) return []
      const trimmed = str.trim()
      if (trimmed.startsWith("[")) {
        try {
          const parsed = JSON.parse(trimmed)
          if (Array.isArray(parsed)) return parsed
        } catch {}
      }
      return str.split(",").map(s => s.trim()).filter(Boolean).map(label => ({ label }))
    }
    // Semicolon-joined fields - diagnoses/procedure names can contain commas
    const toTagsSemi = (json: unknown, str: string | null | undefined) => {
      if (Array.isArray(json) && json.length > 0) return json as { label: string; sub?: string }[]
      return str ? str.split(";").map(s => s.trim()).filter(Boolean).map(label => ({ label })) : []
    }

    return {
      // Demographics
      ageYears:  p.ageYears  ?? undefined,
      sex:       p.sex       ?? undefined,
      heightCm:  p.heightCm  ?? undefined,
      weightKg:  p.weightKg  ?? undefined,
      bloodType: p.bloodType ?? undefined,
      rhFactor:  p.rhFactor  ?? undefined,

      // Case - prefer JSON arrays; fall back to semicolon-split string (never comma-split)
      diagnoses:          toTagsSemi(p.diagnosesJson, p.diagnosis),
      procedures:         toTagsSemi(p.proceduresJson, p.plannedProcedure),
      teamNotes:            p.teamNotes            ?? undefined,
      highRiskSurgery:      p.highRiskSurgery      ?? false,
      emergencySurgery:     p.emergencySurgery      ?? false,

      // Medical history
      comorbidities: Array.isArray(p.comorbidities)
        ? p.comorbidities.map(c => typeof c === "string" ? { label: c } : c)
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

      labResults: Array.isArray(p.labResults) ? p.labResults : [],

      // Patient fields (never saved to DB - intentionally left empty for GDPR)
      patientFirstName: undefined,
      patientLastName:  undefined,
      patientId:        undefined,
    }
  }

  function dbPostopToForm(o: CaseDetailPostop): PostopData {
    return {
      aldreteActivity:      o.aldreteActivity      ?? undefined,
      aldreteRespiration:   o.aldreteRespiration   ?? undefined,
      aldreteCirculation:   o.aldreteCirculation   ?? undefined,
      aldreteConsciousness: o.aldreteConsciousness ?? undefined,
      aldreteSpO2:          o.aldreteSpO2          ?? undefined,
      painScoreNRS:         o.painScoreNRS         ?? undefined,
      ponv:                 o.ponv                 ?? false,
      temperatureCelsius:   o.temperatureCelsius   ?? undefined,
      recoveryBpSystolic:   o.recoveryBpSystolic   ?? undefined,
      recoveryBpDiastolic:  o.recoveryBpDiastolic  ?? undefined,
      recoveryHeartRate:    o.recoveryHeartRate    ?? undefined,
      recoverySpO2:         o.recoverySpO2         ?? undefined,
      recoveryBpUnobtainable:          o.recoveryBpUnobtainable          ?? false,
      recoveryHeartRateUnobtainable:   o.recoveryHeartRateUnobtainable   ?? false,
      recoverySpO2Unobtainable:        o.recoverySpO2Unobtainable        ?? false,
      recoveryTemperatureUnobtainable: o.recoveryTemperatureUnobtainable ?? false,
      disposition:          o.disposition          ?? undefined,
      dispositionNotes:     o.dispositionNotes     ?? undefined,
      handoverItems:        Array.isArray(o.handoverItems) ? o.handoverItems : [],
    }
  }

  function dbIntraopToForm(intraop: CaseDetailIntraop): Partial<IntraopData> {
    // Strip DB-only fields that don't belong in the form and would cause autosave
    // ZodErrors: keyEvents is a TimetableData object but intraopSchema expects an array;
    // id/caseId/createdAt/updatedAt are DB metadata; timeSeriesData/durationMinutes are computed.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, caseId, createdAt, updatedAt, keyEvents, timeSeriesData, durationMinutes, ...formFields } = intraop
    const endTimeNextDay = !!(intraop.endTime &&
      new Date(intraop.endTime).getTime() - new Date(intraop.startTime).getTime() > 12 * 60 * 60 * 1000)
    return {
      // JSON-blob fields (positions, techniques, airwayDevices, etc.) are
      // unknown on CaseDetailIntraop - genuinely loosely shaped at the DB
      // level - but always arrays/scalars matching IntraopData's shape in
      // practice, same boundary as the rest of this file's DB?>form mapping.
      ...(formFields as Partial<IntraopData>),
      monthYear:      intraop.monthYear ?? undefined,
      startTime:      isoToHHMM(intraop.startTime),
      endTime:        intraop.endTime ? isoToHHMM(intraop.endTime) : undefined,
      endTimeNextDay,
    }
  }
  dbIntraopToFormRef.current = dbIntraopToForm

  // ── Core save / patch function ──────────────────────────────────────────────
  // All writes go through the shared per-case write queue: a save that starts
  // while another is in flight is queued behind it, not dropped or interleaved.
  const writeQueueRef = useRef(createCaseWriteQueue())

  const saveSectionInner = useCallback(async (
    section: "preop" | "intraop" | "postop",
    data: PreopData | IntraopData | PostopData,
    { showToast = false, nextStep, forceUpdate = false, onError }: { showToast?: boolean; nextStep?: number; forceUpdate?: boolean; onError?: (msg: string) => void } = {}
  ) => {
    try {
      if (!caseIdRef.current) {
        // First save: create the case
        const preopData = data as PreopData
        const bmi = preopData.heightCm && preopData.weightKg ? calcBMI(preopData.heightCm, preopData.weightKg) : 0
        const res = await fetch("/api/cases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preop: { ...data, bmi } }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? `Save failed (HTTP ${res.status})`)
        }
        const { id, caseCode: code, preopUpdatedAt } = await res.json()
        caseIdRef.current = id
        setCaseId(id)
        if (code) setCaseCode(code)
        if (preopUpdatedAt) preopUpdatedAtRef.current = new Date(preopUpdatedAt).toISOString()
        // Update URL so page refresh restores the correct step
        router.replace(`/cases/new?continue=${id}`, { scroll: false })
      } else {
        // Update existing case
        const bmi = section === "preop" && (data as PreopData).heightCm && (data as PreopData).weightKg
          ? calcBMI((data as PreopData).heightCm!, (data as PreopData).weightKg!) : undefined
        const payload = section === "preop" ? { ...data, bmi } : data
        const existingCaseId = caseIdRef.current
        const baseRef =
          section === "preop" ? preopUpdatedAtRef :
          section === "postop" ? postopUpdatedAtRef : intraopUpdatedAtRef
        // Shared conflict-retry engine. Web policy: only auto-retry the
        // uninitialized-timestamp case (missing_conflict_timestamp — e.g. the
        // case-ID was set from URL params before the case fetch completed);
        // genuine conflicts open the resolution modal below.
        let outcome: ConflictRetryOutcome<CasePatchResponse>
        try {
          outcome = await sendWithConflictRetry<CasePatchResponse>(
            async (base) => {
              const headers: Record<string, string> = { "Content-Type": "application/json" }
              if (base) headers[SECTION_CONFLICT_HEADER[section]] = base
              if (forceUpdate) headers[FORCE_UPDATE_HEADER] = "true"
              const res = await fetch(`/api/cases/${caseIdRef.current}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({ [section]: payload }),
              })
              return classifyPatchResponse<CasePatchResponse>(res)
            },
            baseRef,
            (body) => (body as ConflictBody | undefined)?.reason === "missing_conflict_timestamp",
          )
        } catch (err) {
          if (isNetworkSaveError(err)) {
            // Offline tray: keep the data locally (merge-on-queue, latest
            // field values win) and let the flusher replay it when back online.
            await caseOutbox.queue(existingCaseId, section, payload, baseRef.current)
            if (showToast) toast.info(t("case.savedOffline"))
            return "queued" as const
          }
          throw err
        }
        if (!outcome.ok && outcome.conflict) {
          const body = (outcome.body ?? {}) as ConflictBody
          if (body.error === "conflict" && body.serverVersion) {
            // Open conflict resolution modal instead of throwing
            setConflict({
              open: true,
              localValues: payload,
              serverValues: body.serverVersion,
              section,
              pendingData: data,
              nextStep,
              showToast,
            })
            return false
          }
          // Unknown 409 - treat as error
          throw new Error("Save conflict - please reload and try again.")
        }
        if (!outcome.ok && outcome.status === 404 && section === "preop") {
          caseIdRef.current = null
          setCaseId(null)
          preopUpdatedAtRef.current = null
          postopUpdatedAtRef.current = null
          intraopUpdatedAtRef.current = null
          const createRes = await fetch("/api/cases", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ preop: payload }),
          })
          if (!createRes.ok) {
            const body = await createRes.json().catch(() => ({}))
            throw new Error(body.error ?? `Save failed (HTTP ${createRes.status})`)
          }
          const created = await createRes.json()
          caseIdRef.current = created.id
          setCaseId(created.id)
          if (created.caseCode) setCaseCode(created.caseCode)
          if (created.preopUpdatedAt) preopUpdatedAtRef.current = new Date(created.preopUpdatedAt).toISOString()
          router.replace(`/cases/new?continue=${created.id}`, { scroll: false })
        } else if (!outcome.ok) {
          const body = (outcome.body ?? {}) as { error?: string }
          console.error(`[saveSection] HTTP ${outcome.status}`, JSON.stringify(outcome.body ?? {}).slice(0, 500))
          throw new Error(body.error ?? `Save failed (HTTP ${outcome.status})`)
        } else {
          // Track updated timestamps so future saves include correct conflict headers
          const result = outcome.body
          if (result.preopUpdatedAt) preopUpdatedAtRef.current = new Date(result.preopUpdatedAt).toISOString()
          if (result.postopUpdatedAt) postopUpdatedAtRef.current = new Date(result.postopUpdatedAt).toISOString()
          if (result.intraopUpdatedAt) intraopUpdatedAtRef.current = new Date(result.intraopUpdatedAt).toISOString()
          // A direct save supersedes any older patch still in the offline
          // tray for this section — drop it so the flusher can't replay
          // stale data over what we just saved.
          await caseOutbox.clearOne(existingCaseId, section).catch(() => {})
        }
      }

      if (showToast) toast.success(
        section === "preop"   ? t("case.preopSaved")   :
        section === "intraop" ? t("case.intraopSaved") : t("case.savedSuccess")
      )
      return true
    } catch (err: unknown) {
      console.error("saveSection error:", err)
      const errMsg = err instanceof Error ? err.message : t("case.saveFailed")
      if (showToast) toast.error(errMsg)
      onError?.(errMsg)
      return false
    }
  }, [t, router])

  // Public save entry: serialized through the per-case write queue so callers
  // (autosave, manual submit, conflict resolution) can never interleave.
  const saveSection = useCallback((
    section: "preop" | "intraop" | "postop",
    data: PreopData | IntraopData | PostopData,
    opts: { showToast?: boolean; nextStep?: number; forceUpdate?: boolean; onError?: (msg: string) => void } = {}
  ) => writeQueueRef.current.enqueue(caseIdRef.current ?? "new-case", () => saveSectionInner(section, data, opts)),
  [saveSectionInner])

  // ── Auto-save (debounced, called by each form) ──────────────────────────────
  // Coalescing drain loop: an autosave arriving while one is in flight is
  // remembered (latest payload per section wins) and sent right after —
  // never silently dropped like the old `if (savingRef.current) return`.
  const pendingAutosaveRef = useRef(new Map<"preop" | "intraop" | "postop", PreopData | IntraopData | PostopData>())
  const handleAutoSave = useCallback(async (section: "preop" | "intraop" | "postop", data: PreopData | IntraopData | PostopData) => {
    pendingAutosaveRef.current.set(section, data)
    if (savingRef.current) return // the running drain loop below picks this up
    savingRef.current = true
    setSaveStatus("saving")
    let ok = true
    let queuedAny = false
    for (;;) {
      const next = pendingAutosaveRef.current.entries().next()
      if (next.done) break
      const [nextSection, nextData] = next.value
      pendingAutosaveRef.current.delete(nextSection)
      const saved = await saveSection(nextSection, nextData, { onError: msg => setAutoSaveErrMsg(msg) })
      if (saved === "queued") queuedAny = true
      else ok = saved && ok
    }
    if (ok) setAutoSaveErrMsg(null)
    setSaveStatus(!ok ? "error" : queuedAny ? "queued" : "saved")
    savingRef.current = false
    if (ok && !queuedAny) {
      // Fade back to idle after 2s (queued stays visible until it syncs)
      setTimeout(() => setSaveStatus(s => s === "saved" ? "idle" : s), 2000)
    }
  }, [saveSection])

  // ── Manual submit handlers - step advances regardless of save result ─────────
  async function handlePreopSubmit(data: PreopData) {
    setPreopData(data)
    setStep(1); window.scrollTo(0, 0)
    // Save in background - don't block navigation on success/failure
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
        body: JSON.stringify({ postop: postopData }),
      })
      if (!res.ok) throw new Error()
      setPostopData(postopData)
      toast.success(t("case.savedSuccess"))
      // Start 30-minute graceful close countdown before finalising
      startCloseCountdown()
      setStep(3); window.scrollTo(0, 0)
    } catch {
      toast.error(t("case.saveFailed"))
    } finally {
      setSubmitting(false)
    }
  }

  function startCloseCountdown() {
    const id = caseIdRef.current
    if (!id) return
    if (closeTimerRef.current) clearInterval(closeTimerRef.current)

    const storageKey = `summaryOpenedAt_${id}`
    const stored = localStorage.getItem(storageKey)
    const openedAt = stored ? parseInt(stored, 10) : Date.now()
    if (!stored) localStorage.setItem(storageKey, String(openedAt))

    const remaining = Math.max(0, 30 * 60 - Math.floor((Date.now() - openedAt) / 1000))
    if (remaining === 0) { finaliseCase(); return }

    setCloseSecsLeft(remaining)
    closeTimerRef.current = setInterval(() => {
      setCloseSecsLeft(s => {
        if (s === null || s <= 1) {
          clearInterval(closeTimerRef.current!)
          closeTimerRef.current = null
          localStorage.removeItem(`summaryOpenedAt_${id}`)
          finaliseCase()
          return null
        }
        return s - 1
      })
    }, 1000)
  }
  startCloseCountdownRef.current = startCloseCountdown

  async function finaliseCase() {
    const id = caseIdRef.current
    if (!id) return
    if (closeTimerRef.current) { clearInterval(closeTimerRef.current); closeTimerRef.current = null }
    localStorage.removeItem(`summaryOpenedAt_${id}`)
    try {
      const res = await fetch(`/api/cases/${id}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      if (!res.ok) throw new Error()
      // Use server finalizedAt if available, otherwise use current timestamp
      let serverFinalizedAt: number = Date.now()
      try {
        const body = await res.json()
        if (body?.finalizedAt) serverFinalizedAt = new Date(body.finalizedAt).getTime()
      } catch {}
      // Start 5-minute undo countdown
      finalizedAtRef.current = serverFinalizedAt
      const UNDO_WINDOW_SECS = FINALIZE_UNDO_WINDOW_MS / 1000
      const elapsed = Math.floor((Date.now() - serverFinalizedAt) / 1000)
      const remaining = Math.max(0, UNDO_WINDOW_SECS - elapsed)
      setFinalizedCaseId(id)
      setUndoExpired(false)
      setUndoSecsLeft(remaining)
      if (undoTimerRef.current) clearInterval(undoTimerRef.current)
      undoTimerRef.current = setInterval(() => {
        setUndoSecsLeft(s => {
          if (s === null || s <= 1) {
            clearInterval(undoTimerRef.current!)
            undoTimerRef.current = null
            setUndoSecsLeft(null)
            setUndoExpired(false)
            setFinalizedCaseId(null)
            // Navigate to case detail after undo window expires
            router.push(`/cases/${id}`)
            return null
          }
          return s - 1
        })
      }, 1000)
      // Navigate to summary step so user sees the undo banner
      setStep(3)
    } catch {
      toast.error(t("case.couldNotClose"))
    }
  }

  async function handleUndo() {
    const id = finalizedCaseId
    if (!id) return
    if (undoTimerRef.current) { clearInterval(undoTimerRef.current); undoTimerRef.current = null }
    try {
      const res = await fetch(`/api/cases/${id}/unfinalize`, { method: "POST" })
      if (res.status === 403) {
        setUndoExpired(true)
        setUndoSecsLeft(null)
        setFinalizedCaseId(null)
        return
      }
      if (!res.ok) throw new Error()
      // Undo succeeded - restore editing state
      setUndoSecsLeft(null)
      setFinalizedCaseId(null)
      setUndoExpired(false)
      toast.success("Finalization undone. You can continue editing.")
      // Re-enter the close countdown for the restored case
      startCloseCountdown()
    } catch {
      toast.error("Could not undo finalization. Please try again.")
    }
  }

  async function handleConflictResolve(resolved: Record<string, unknown>) {
    if (!conflict) return
    setConflict(null)
    // Retry the save with forceUpdate so the server accepts it
    const ok = await saveSection(conflict.section, resolved as PreopData | IntraopData | PostopData, {
      showToast: conflict.showToast,
      nextStep: conflict.nextStep,
      forceUpdate: true,
    })
    if (ok && conflict.nextStep !== undefined) {
      setStep(conflict.nextStep)
      window.scrollTo(0, 0)
    }
  }

  return (
    <div className={`${step === 1 ? "max-w-6xl" : step === 3 ? "max-w-[1200px]" : "max-w-4xl"} mx-auto space-y-8 transition-all`}>
      {conflict && (
        <ConflictModal
          open={conflict.open}
          onClose={() => setConflict(null)}
          localValues={conflict.localValues}
          serverValues={conflict.serverValues}
          onResolve={handleConflictResolve}
        />
      )}
      {/* Undo finalization banner - shown for 5 minutes after finalizing */}
      {(undoSecsLeft !== null || undoExpired) && (
        <div className={`no-print rounded-lg border px-4 py-3 flex items-center justify-between gap-3 ${
          undoExpired
            ? "border-slate-200 dark:border-[#333] bg-slate-50 dark:bg-[#1a1a1a]"
            : "border-green-200 dark:border-green-700/50 bg-green-50 dark:bg-green-950/20"
        }`}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
            {undoExpired ? (
              <span className="text-sm text-slate-600 dark:text-slate-400">Undo window has expired.</span>
            ) : (
              <span className="text-sm text-green-700 dark:text-green-300">
                Case finalized.{" "}
                <span className="font-bold tabular-nums">
                  {String(Math.floor((undoSecsLeft ?? 0) / 60)).padStart(2, "0")}:{String((undoSecsLeft ?? 0) % 60).padStart(2, "0")}
                </span>
              </span>
            )}
          </div>
          {!undoExpired && undoSecsLeft !== null && (
            <Button
              size="sm"
              variant="outline"
              className="border-green-300 text-green-700 hover:bg-green-100 dark:border-green-600 dark:text-green-300 dark:hover:bg-green-900/40"
              onClick={handleUndo}
            >
              Undo
            </Button>
          )}
        </div>
      )}

      {isWatching && <WatchingBanner onTakeover={takeover} holderName={holderName} />}
      <div className="no-print flex items-center gap-4">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-950 border-2 border-blue-100 dark:border-blue-900 shrink-0">
          <UserRound className="h-9 w-9 text-blue-500 dark:text-blue-400" strokeWidth={1.5} />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-800">
            {patientName
              ? <>{patientName}{patientId && <span className="text-slate-400 font-normal text-lg"> - ID: {patientId}</span>}</>
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
            {saveStatus === "saving" && <span className="text-slate-400 animate-pulse">{t("case.savingDraft")}</span>}
            {saveStatus === "saved"  && <span className="text-green-500">{t("case.draftSaved")}</span>}
            {saveStatus === "queued" && <span className="text-amber-500">{t("case.draftQueued")}</span>}
            {saveStatus === "error"  && <span className="text-red-400">{autoSaveErrMsg ?? t("case.autoSaveFailed")}</span>}
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

      {/* Compact pending-close banner - visible at steps 0/1/2 while countdown is running */}
      {closeSecsLeft !== null && step < 3 && (
        <div className="no-print rounded-lg border border-amber-200 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-950/20 px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-sm text-amber-700 dark:text-amber-300">
              {t("case.pendingClose")}{" "}
              <span className="font-bold tabular-nums">
                {String(Math.floor(closeSecsLeft / 60)).padStart(2,"0")}:{String(closeSecsLeft % 60).padStart(2,"0")}
              </span>
            </span>
          </div>
          <Button size="sm" variant="outline"
            className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-900/40"
            onClick={() => setStep(3)}>
            {t("case.backToSummary")}
          </Button>
        </div>
      )}

      <fieldset disabled={isWatching} style={{ border: "none", padding: 0, margin: 0, minWidth: 0 }}>
        {loading && (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <span className="animate-pulse">{t("case.loadingDraft")}</span>
          </div>
        )}

        {!loading && step === 0 && (
          <PreopForm
            defaultValues={preopData ?? undefined}
            onSubmit={handlePreopSubmit}
            onNameChange={setPatientName}
            onIdChange={setPatientId}
            onAutoSave={data => handleAutoSave("preop", data)}
            layoutMode={preopLayout}
            caseId={caseId}
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
              neckMobility:          preopData.neckMobility,
              mouthOpeningCm:        preopData.mouthOpeningCm,
              cormackLehane:         preopData.cormackLehane,
              difficultAirwayHistory: preopData.difficultAirwayHistory,
              allergies:             preopData.allergies,
              allergyDetails:        preopData.allergyDetails,
              comorbidities:         preopData.comorbidities,
              currentMedications:    preopData.currentMedications,
              labResults:            preopData.labResults,
              diagnosis:             preopData.diagnoses?.map(t => t.label).join("; ") || null,
              plannedProcedure:      preopData.procedures?.map(t => t.label).join("; ") || null,
              emergencySurgery:      preopData.emergencySurgery ?? null,
            } : null}
            caseStarted={!!(intraopData?.startTime)}
            onSubmit={handleIntraopSubmit}
            onBack={() => setStep(0)}
            onAutoSave={data => handleAutoSave("intraop", data)}
            onPostopContinued={items => setContinuedPostopItems(items)}
            layoutMode={layoutMode}
            eventLog={eventLog}
            onDeleteEvent={handleDeleteEvent}
            onLogEvent={handleLogEvent}
            onLogEventDelete={handleLogEventDelete}
          />
        )}
        {!loading && step === 2 && (
          <PostopForm
            defaultValues={postopData ?? undefined}
            onSubmit={handlePostopSubmit}
            onBack={() => setStep(1)}
            submitting={submitting}
            onAutoSave={data => handleAutoSave("postop", data)}
            initialComplicationsText={continuedPostopItems.length > 0 ? `Continued postoperatively: ${continuedPostopItems.join(", ")}` : undefined}
          />
        )}
      </fieldset>

      {/* Step 3: Case summary / protocol preview */}
      {step === 3 && caseId && (
        <div className="space-y-4">
          {/* Graceful close countdown banner - hidden once finalized */}
          {closeSecsLeft !== null && (
          <div className="no-print rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div>
                <p className="font-semibold text-amber-800 dark:text-amber-300">
                  {t("case.pendingClose")}{" "}
                  <span className="font-bold tabular-nums">
                    {String(Math.floor(closeSecsLeft / 60)).padStart(2,"0")}:{String(closeSecsLeft % 60).padStart(2,"0")}
                  </span>
                </p>
                <p className="text-sm text-amber-600 dark:text-amber-400">{t("case.pendingCloseHint")}</p>
              </div>
            </div>
            {closeSecsLeft !== null && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-amber-600 dark:text-amber-400">{t("settings.edit")}:</span>
                <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-900/40" onClick={() => setStep(0)}>{t("case.steps.preop")}</Button>
                <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-900/40" onClick={() => setStep(1)}>{t("case.steps.intraop")}</Button>
                <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-900/40" onClick={() => setStep(2)}>{t("case.steps.postop")}</Button>
                <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => { setCloseSecsLeft(null); finaliseCase() }}>
                  {t("case.closeNow")}
                </Button>
              </div>
            )}
          </div>
          )}

          {/* Case summary - patient name dialog is inside CaseSummary */}
          <div data-tour="summary-print" className="no-print absolute opacity-0 pointer-events-none" aria-hidden />
          <CaseSummary caseId={caseId} />

          {/* Navigation - hidden on print */}
          <div className="no-print flex justify-between items-center pt-2">
            <Button variant="outline" onClick={() => setStep(2)}>{t("case.editPostop")}</Button>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => router.push("/dashboard")}>{t("nav.dashboard")}</Button>
              <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => router.push(`/cases/${caseId}`)}>
                {t("case.goToCase")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
