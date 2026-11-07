"use client"

import { useForm, useWatch, type Resolver } from "react-hook-form"
import { useIntraopEventTimeline } from "@/hooks/useIntraopEventTimeline"
import { useIntraopEventAutofill } from "@/hooks/useIntraopEventAutofill"
import { useIntraopAttention } from "@/lib/use-intraop-attention"
import { useLikelyEvents, useSuggestionContext, useVitalQuestionContext } from "@/lib/use-intraop-automation"
import { IntraopAttentionPanel } from "@/components/intraop/IntraopAttentionPanel"
import { AirwayExchangeDialog } from "@/components/intraop/AirwayExchangeDialog"
import { accessKindOf, replaceFailedLine, vascularLineText, type AccessKind, type VascularLine } from "@lospor/core/vascular-access-lines"
import { airwayDeviceEntriesOf, airwayPrimaryConflict, hasActiveTrachealTube, type AirwayDeviceEntry, type AirwayExchangeReason } from "@lospor/core/airway-device-entries"
import { cardEventOps } from "@lospor/core/intraop-suggestions"
import type { LogEvent as CoreLogEvent } from "@lospor/core/intraop-types"
import { serverNow } from "@/lib/intraop-clock"
import { displayClinicalCode, displayOption } from "@/lib/clinical-display"
import { CaseSaveStateContext } from "@/lib/use-case-save-state"
import { totalsProvisional } from "@lospor/core/intraop-save-state"
import type { IntraopEventOps } from "@lospor/core/intraop-timetable-edit"
import { computeLiveDrugTotals, infusionsVolumeMl, tciPatientFrom } from "@/lib/intraop-drug-totals"
import { buildIntraopSubmission, intraopEndCaseValuesNow, intraopTimeErrors } from "@/lib/intraop-submit"
import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { toast } from "sonner"
import { createPortal } from "react-dom"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { StepTabBar } from "@/components/forms/StepTabBar"
import { SectionJumpStrip } from "@/components/forms/SectionJumpStrip"
import { useLocale, useTranslations } from "next-intl"
import { IntraopTimetable, type TimetableData, type IntraopLogEvent } from "@/components/IntraopTimetable"
import type { WeightBasisMap } from "@/lib/infusion-calc"
import { buildTree as buildTechniqueTree, techniqueDisplayLabel, techniqueIsGeneral, techniqueUsesGas } from "@/components/TechniqueTree"
import { CaseSidebar, sidebarPatientOf, type CaseStages } from "@/components/forms/CaseSidebar"
import { broselowZone } from "@lospor/core/broselow"
import { clinicalRecordId } from "@lospor/core/clinical-record-id"
import { clinicalRelationForEventLabel } from "@lospor/core/intraop-automation-actions"

const AIRWAY_EVENT_COLORS: Record<string, string> = {
  Intubated: "#6366f1", Reintubation: "#f97316", "LMA in": "#6366f1", "DLT placed": "#6366f1", "Airway exchange": "#f97316",
  "Mask vent": "#0891b2", "OPA in": "#6366f1", "NPA in": "#6366f1", "Endobronchial tube in": "#6366f1", "Surgical airway in": "#dc2626", "Airway device in": "#6366f1",
}
const VASCULAR_EVENT_COLORS: Record<string, string> = {
  "IV line in": "#a67cff", "Art line in": "#22c55e", "CVC in": "#a67cff", PICC: "#a67cff",
}
import { IntraopPreopSummary } from "@/components/intraop/IntraopPreopSummary"
import { useEndCaseCheck } from "@/components/intraop/EndCaseReadiness"
import { useAllergyGate } from "@/components/intraop/AllergyGate"
import { useSuggestionGate } from "@/components/intraop/SuggestionGate"
import { intraopFocusTab, scrollToReadiness, useScrollToReadiness } from "@/lib/readiness-focus"
import {
  AIRWAY_DEVICE_REQUIRED_FIELDS,
  isAirwayDeviceComplete,
  monitoringPatchForTechniques,
  monthYearForDate,
  syncAirwayDeviceSelection,
  type AirwayDeviceWithProfile,
  airwayAbsentReason,
  airwayDeviceSummary,
} from "@lospor/core/intraop"
import { AIRWAY_EVENT_DEVICE, airwayRecordFields, AIRWAY_RECORD_PATCH_KEYS, stripAirwayRecordPatch, type AirwayPatient } from "@lospor/core/airway-smart"
import { localTimeOf } from "@lospor/core/intraop-time"
import { randomId } from "@/lib/random-id"
import { AirwaySmart } from "@/components/intraop/AirwaySmart"
import { AirwaySmartPanel, type AirwaySmartRequest } from "@/components/intraop/AirwaySmartPanel"
import { useAirwayScreen } from "@/lib/use-airway-screen"
import { VASCULAR_EVENT_TYPE } from "@lospor/core/vascular-smart"
import { VascularSmart } from "@/components/intraop/VascularSmart"
import { VascularSmartPanel, type VascularSmartRequest } from "@/components/intraop/VascularSmartPanel"
import { useVascularScreen } from "@/lib/use-vascular-screen"
import { useMonitoringScreen } from "@/lib/use-monitoring-screen"
import { useEquipmentScreen } from "@/lib/use-equipment-screen"
import { useEventsScreen } from "@/lib/use-events-screen"
import { useFluidsScreen } from "@/lib/use-fluids-screen"
import { useEventLogScreen } from "@/lib/use-event-log-screen"
import { EventSelectorContext } from "@/components/intraop/event-selector-context"
import { useTechniqueScreen } from "@/lib/use-technique-screen"
import { useRecentTechniques } from "@/lib/use-recent-techniques"
import { TechniqueSmart } from "@/components/intraop/TechniqueSmart"
import { parseTechniqueSides, techniqueSidesFor, techniquesAfterTciStart, type TechniqueSide } from "@lospor/core/technique-smart"
import { addAirwayDevice, airwayClinicalEvent, resolveAirwayTime, suggestedAirwayDetails } from "@lospor/core/airway-smart"
import { MonitoringSmart } from "@/components/intraop/MonitoringSmart"
import { MONITORING_READINGS, isRelaxant, monitoringAutomationId, monitoringSuggestionKey, monitoringSuggestions, type MonitoringSuggestion } from "@lospor/core/monitoring-smart"
import { monitoringDismissalEventId } from "@lospor/core/intraop-automation-actions"
import { EquipmentSuggestions } from "@/components/EquipmentSuggestions"
import { IntraopLabsDialog } from "@/components/intraop/IntraopLabsDialog"
import { useClinicalRules } from "@/hooks/useClinicalRules"
import { useOptionLibrary } from "@/hooks/useOptionLibrary"
import { SectionCard } from "@/components/forms/shared/SectionCard"
import { usePremedicationLibrary } from "@/components/intraop/use-premedication-library"
import { usePremedicationPrefill } from "@/components/intraop/use-premedication-prefill"
import { PositionSection } from "@/components/forms/sections/PositionSection"
import { MonitoringSection } from "@/components/forms/sections/MonitoringSection"
import { VascularAccessSection } from "@/components/forms/sections/VascularAccessSection"
import { PremedicationSection } from "@/components/forms/sections/PremedicationSection"
import { ComplicationsSection } from "@/components/forms/sections/ComplicationsSection"
import { DrugsFluidTotalsSection } from "@/components/forms/sections/DrugsFluidTotalsSection"
import { TimelineSection } from "@/components/forms/sections/TimelineSection"
import { AirwaySection } from "@/components/forms/sections/AirwaySection"
import { TechniqueSection } from "@/components/forms/sections/TechniqueSection"
import {
  weightBasisMap,
} from "@lospor/core/option-library"
import {
  evaluateIntraopReadiness,
  type ClinicalIssueCode,
} from "@lospor/core/clinical-validation"
import { resolveIdealBodyWeight } from "@lospor/core/ideal-body-weight"
import { fluidDeliveredVolumeMl } from "@/lib/fluid-entry-ui"
import { INTRAOP_ISSUE_KEYS } from "./intraop-issue-copy"
import { schema, type IntraopData, type IntraopFormFields } from "./intraopSchema"

export type { IntraopFormFields, IntraopData } from "./intraopSchema"

// Position, airway management, and monitoring option lists now live in the
// OptionLibrary table (POSITION / AIRWAY_MANAGEMENT / MONITORING categories)
// and are fetched via useOptionLibrary inside IntraopForm below.

import type { PreopSummary } from "@/components/forms/preop-summary"

export function IntraopForm({ defaultValues, defaultTimetable, preop, onSubmit, onBack, onAutoSave, onPostopContinued, onDeath, layoutMode = "tabs", caseStarted: caseStartedProp = false, eventLog, onEventOps, readOnly = false, autoEnded: autoEndedProp = false, caseId = null, aiOptIn = false, focus = null, stages }: {
  /** Where the case is, for the case panel (sidebar layout). */
  stages?: CaseStages
  /**
   * The saved case, once autosave has created one.
   *
   * Needed by the intraoperative lab scan: the server reads AI consent from the
   * stored case and ignores anything the client claims, because a photographed
   * report carries the patient's name and no redaction is possible on an image.
   */
  caseId?: string | null
  aiOptIn?: boolean
  defaultValues?: Partial<IntraopData>
  defaultTimetable?: TimetableData
  preop?: PreopSummary | null
  onSubmit: (data: IntraopData) => void
  onBack: () => void
  onAutoSave?: (data: IntraopData) => void
  onPostopContinued?: (items: string[]) => void
  /** A death charted in theatre (10.2.0): the postop destination becomes Deceased. */
  onDeath?: () => void
  /** "sidebar": one scrolling page beside the case panel (10.0.0). */
  layoutMode?: "tabs" | "scroll" | "sidebar"
  caseStarted?: boolean
  eventLog?: IntraopLogEvent[]
  /** Writes timeline edits as event operations (the log is the only source). */
  onEventOps?: (ops: IntraopEventOps) => void | Promise<void>
  /** Another screen holds the case: nothing here may write (9.12.1). */
  readOnly?: boolean
  /** Ended automatically after 48 hours; applies while that saved end stands (9.12.1). */
  autoEnded?: boolean
  /** A part of the record to open on arrival, from a readiness "Go to" (1.5.0). */
  focus?: string | null
}) {
  const t = useTranslations()
  const localizeIssue = (code: ClinicalIssueCode) => {
    const messageKey = INTRAOP_ISSUE_KEYS[code]
    return messageKey ? t(messageKey) : code
  }
  const locale = useLocale()
  const { register, handleSubmit, control, watch, setValue, getValues, formState } = useForm<IntraopFormFields>({
    // zodResolver's inferred generic doesn't exactly match z.infer<typeof
    // schema> for a schema this size (lots of .optional()/.default() fields)
    // — a known zod-v4/react-hook-form resolver-typing friction point, not
    // something this cast is hiding a real mismatch behind.
    resolver: zodResolver(schema) as Resolver<IntraopFormFields>,
    defaultValues: {
      monthYear: monthYearForDate(new Date()),
      drugsAdministered: [], vitals: [], positions: [], techniques: [],
      airwayDevices: [], ventilationModes: [], airwayTools: [],
      presentsIntubated: false, airwayNotApplicable: false, labResults: [],
      nbpMonitor: true, spO2Monitor: true, ecg: true,
      ...defaultValues,
    },
  })

  const { options: positionOptions } = useOptionLibrary("POSITION")
  const { options: techniqueLibOpts } = useOptionLibrary("TECHNIQUE")
  const techniqueTree = useMemo(() => buildTechniqueTree(techniqueLibOpts, locale), [locale, techniqueLibOpts])
  const { options: monitoringOptions } = useOptionLibrary("MONITORING")
  const { options: airwayOptions } = useOptionLibrary("AIRWAY_MANAGEMENT")
  const { options: infusionLibOpts } = useOptionLibrary("INTRAOP_INFUSION")
  const infusionWeightBasis = useMemo<WeightBasisMap>(
    () => weightBasisMap(infusionLibOpts),
    [infusionLibOpts],
  )
  const airwayDeviceOptions = useMemo(() => airwayOptions.filter(o => o.group === "Device"), [airwayOptions])
  const airwayToolOptions = useMemo(() => airwayOptions.filter(o => o.group === "Instrument"), [airwayOptions])
  // The premedication picker's drugs and doses, rebuilt for a child from its
  // weight and age (shared with the preop order: use-premedication-library).
  const clinicalMode = preop?.clinicalMode === "PEDIATRIC" ? "PEDIATRIC" : "ADULT"
  const isPediatric = clinicalMode === "PEDIATRIC"
  const { premedCategories, premedDoses, premedAnnotations, premedDoseForRoute } = usePremedicationLibrary(preop)

  const EMPTY_TIMETABLE = useMemo<TimetableData>(() => ({ vitals: [], drugs: [], fluids: [], agents: [], infusions: [], gasSettings: [], clinicalEvents: [] }), [])
  const safeTimetable = (defaultTimetable && !Array.isArray(defaultTimetable) && "vitals" in defaultTimetable)
    ? defaultTimetable : EMPTY_TIMETABLE
  const [manualSaved, setManualSaved] = useState(false)
  // While the reasons for a changed end are open, the floating questions step aside (10.1.0).
  const [endCorrectionOpen, setEndCorrectionOpen] = useState(false)
  // The chart is the projection of the event log; edits become events (1.4.9).
  const [timelineStartedAt, timelineEndedAt, timelineStartTime, timelineZone] = useWatch({ control, name: ["startedAt", "endedAt", "startTime", "timezone"] })
  const { timetable, log: timelineLog, chartStartMs, startedAt: chartStartedAt, onTimetableChange, removeEvent, addEvents } = useIntraopEventTimeline({
    eventLog, startedAt: timelineStartedAt, startTime: timelineStartTime, timezone: timelineZone, endedAt: timelineEndedAt, onEventOps, readOnly, legacyTimetable: safeTimetable,
  })
  useIntraopEventAutofill({ log: timelineLog, chartStartMs, endedAt: timelineEndedAt, addEvents, disabled: readOnly })

  const {
    snapshot: clinicalRulesSnapshot,
    loading: clinicalRulesLoading,
    error: clinicalRulesError,
    prospectiveGuidanceEnabled,
  } = useClinicalRules(clinicalMode)
  const ibwResolution = resolveIdealBodyWeight({
    clinicalMode,
    heightCm: preop?.heightCm,
    sex: preop?.sex,
    age: isPediatric && preop?.ageValue != null && preop.ageUnit
      ? { value: preop.ageValue, unit: preop.ageUnit }
      : null,
  })
  // Rounded to 0.1 kg as the PWA and the printed record use it, so the three
  // cannot total the same infusion a few decimals apart (9.12.3).
  const calcIbw = ibwResolution.available ? ibwResolution.roundedKg : null
  const calcTbw = preop?.weightKg ?? null
  const [watchedTof, watchedBloodLoss, watchedIntraopLabs] = useWatch({ control, name: ["tofMonitor", "bloodLossMl", "labResults"] })
  const [watchedTechniquesForSuggestions, watchedTechniqueSidesForSuggestions, watchedAirwayDevicesForSuggestions, watchedAirwayEntriesForSuggestions, watchedPresentsIntubatedForSuggestions] = useWatch({
    control, name: ["techniques", "techniqueSides", "airwayDevices", "airwayDeviceEntries", "presentsIntubated"],
  })
  const suggestionFacts = useMemo(() => ({
    idealWeightKg: calcIbw, tofMonitor: watchedTof, bloodLossMl: watchedBloodLoss,
    labs: (watchedIntraopLabs ?? []).map(lab => ({ ...lab, unit: lab.unit ?? "" })),
    startedAt: chartStartedAt ?? null, endedAt: timelineEndedAt ?? null,
    timeZone: timelineZone ?? null,
    techniques: (watchedTechniquesForSuggestions ?? []) as string[],
    techniqueSides: (watchedTechniqueSidesForSuggestions ?? {}) as Record<string, "LEFT" | "RIGHT" | "BOTH">,
    airwayDevices: (watchedAirwayDevicesForSuggestions ?? []) as string[],
    airwayDeviceEntries: (watchedAirwayEntriesForSuggestions ?? []) as Record<string, unknown>[],
    presentsIntubated: watchedPresentsIntubatedForSuggestions === true,
  }), [calcIbw, watchedTof, watchedIntraopLabs, watchedBloodLoss, chartStartedAt, timelineEndedAt, timelineZone, watchedTechniquesForSuggestions, watchedTechniqueSidesForSuggestions, watchedAirwayDevicesForSuggestions, watchedAirwayEntriesForSuggestions, watchedPresentsIntubatedForSuggestions])
  const suggestionContext = useSuggestionContext(preop, suggestionFacts, readOnly)
  const attention = useIntraopAttention({ caseId, log: timelineLog, endedAt: timelineEndedAt, timeZone: timelineZone, locale, onEventOps, readOnly, vitals: useVitalQuestionContext(preop, readOnly), suggestions: suggestionContext })

  // Arithmetic, not interface — see @/lib/intraop-drug-totals.
  const liveDrugTotals = useMemo(
    () => computeLiveDrugTotals(timetable, calcIbw, calcTbw, infusionWeightBasis, preop?.heightCm ?? null, tciPatientFrom(preop ?? {})),
    [calcIbw, calcTbw, infusionWeightBasis, preop, timetable])

  // Auto-calculate fluid totals from the one canonical delivered-volume path.
  // Running rate entries advance against the real clock; bag entries retain
  // their selected size until a full/partial actual amount is confirmed.
  const [liveFluidTotals, setLiveFluidTotals] = useState<Partial<Record<"crystalloidsMl" | "colloidsMl" | "bloodMl" | "infusionsMl", number | null>> | null>(null)
  useEffect(() => {
    function updateFluidTotals() {
      const asOf = new Date()
      let crystalloids = 0, colloids = 0, blood = 0
      for (const fluid of timetable.fluids ?? []) {
        const volume = fluidDeliveredVolumeMl(fluid, asOf)
        if (!volume) continue
        const category = fluid.category ?? ""
        if (category === "Crystalloids") crystalloids += volume
        else if (category === "Colloids") colloids += volume
        else if (category === "Blood products") blood += volume
      }
      // These are derived display values. They must not enter the form state:
      // doing so makes the 30-second clock look like a clinician edit and
      // sends a full PATCH whose mapper intentionally ignores these columns.
      setLiveFluidTotals({
        crystalloidsMl: crystalloids || null,
        colloidsMl: colloids || null,
        bloodMl: blood || null,
        infusionsMl: infusionsVolumeMl(timetable.infusions, asOf, tciPatientFrom(preop ?? {})) || null,
      })
    }

    updateFluidTotals()
    const hasRunningRate = (timetable.fluids ?? []).some(
      fluid => fluid.fluidEntryMode === "RATE" && !fluid.stopped,
    ) || (timetable.infusions ?? []).some(infusion => !infusion.stopped && (infusion.volumeRateMlPerHour != null || !!infusion.tciModel))
    if (!hasRunningRate) return
    const timer = window.setInterval(updateFluidTotals, 30_000)
    return () => window.clearInterval(timer)
  }, [preop, setValue, timetable.fluids, timetable.infusions])

  // Smart monitoring defaults — fire once when technique first selected
  const techniques = useMemo(() => (watchedTechniquesForSuggestions ?? []) as string[], [watchedTechniquesForSuggestions])

  useEffect(() => {
    if (!techniques.length) return
    const patch = monitoringPatchForTechniques(techniques, getValues() as Record<string, unknown>)
    for (const [field, value] of Object.entries(patch)) {
      setValue(field as keyof IntraopFormFields, value)
    }
  }, [getValues, setValue, techniques])

  // Debounced auto-save — skip on initial mount so loading a case never overwrites DB with form defaults
  const mountedRef   = useRef(false)
  // Keep a ref to the latest save function so the unmount effect can call it
  const pendingSaveRef = useRef<(() => void) | null>(null)
  // A structured airway/vascular action already persists its form patch and
  // event atomically. The next form snapshot is therefore suppressed once.
  const atomicAirwayEventPendingRef = useRef(false)
  const atomicVascularEventPendingRef = useRef(false)

  const allValues = useWatch({ control })
  // Watch array fields explicitly so their changes always trigger auto-save
  const _wAD = useWatch({ control, name: "airwayDevices" })
  const _wVM = useWatch({ control, name: "ventilationModes" })
  const _wAT = useWatch({ control, name: "airwayTools" })
  const _wPS = useWatch({ control, name: "positions" })
  const watchedLabResults = useWatch({ control, name: "labResults" })
  // Which draw the dialog is editing. null takenAt with open true is the
  // read-across view of every draw.
  const [labsDialog, setLabsDialog] = useState<{ open: boolean; takenAt: string | null }>(
    { open: false, takenAt: null },
  )
  // Watch airway sub-option fields for auto-collapse logic
  const _wLmaSize       = useWatch({ control, name: "lmaSize" })
  const _wOralTubeSize  = useWatch({ control, name: "oralTubeSize" })
  const _wOralCuffed    = useWatch({ control, name: "oralCuffed" })
  const _wNasalTubeSize = useWatch({ control, name: "nasalTubeSize" })
  const _wNasalCuffed   = useWatch({ control, name: "nasalCuffed" })
  const _wDltType  = useWatch({ control, name: "dltType" })
  const _wDltSide  = useWatch({ control, name: "dltSide" })
  const _wDltSize  = useWatch({ control, name: "dltSize" })
  const _wEbSize   = useWatch({ control, name: "endobronchialSize" })
  const allValuesKey = JSON.stringify(allValues)
  const airwayDevicesKey = JSON.stringify(_wAD)
  const ventilationModesKey = JSON.stringify(_wVM)
  const airwayToolsKey = JSON.stringify(_wAT)
  const positionsKey = JSON.stringify(_wPS)

  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return }
    if (!onAutoSave) return
    // A legacy airway addition carries its structured record and clinical
    // event through one idempotent event operation. Do not immediately replay
    // the same snapshot through the slower form PATCH path.
    if (atomicAirwayEventPendingRef.current || atomicVascularEventPendingRef.current) {
      atomicAirwayEventPendingRef.current = false
      atomicVascularEventPendingRef.current = false
      pendingSaveRef.current = null
      return
    }
    const payload = { ...getValues() }
    const save = () => onAutoSave(payload)
    pendingSaveRef.current = save                    // always keep latest snapshot
    const timer = setTimeout(save, 1000)             // reduced from 2 s → 1 s
    return () => clearTimeout(timer)
  }, [airwayDevicesKey, airwayToolsKey, allValuesKey, getValues, onAutoSave, positionsKey, ventilationModesKey])

  // The premedication starts from what the preop visit ordered (1.7.0).
  usePremedicationPrefill({
    ordered: preop?.premedicationOrders,
    readOnly,
    getValue: field => getValues(field),
    setValue: (field, value) => setValue(field, value, { shouldDirty: true }),
  })

  // Fire pending save immediately when user navigates away (component unmounts)
  useEffect(() => {
    return () => {
      if (pendingSaveRef.current) pendingSaveRef.current()
    }
  }, [])
  // Form fields, not component state. These are clinical facts -- "arrived
  // intubated" and "no airway intervention" -- and holding them in useState
  // meant they relaxed the finalisation gate, were never saved, and vanished on
  // reload, leaving a record with no airway device and no reason for it.
  const presentsIntubated = useWatch({ control, name: "presentsIntubated" }) ?? false
  const airwayNA = useWatch({ control, name: "airwayNotApplicable" }) ?? false
  // Both toggles go through core, so web and mobile cannot drift apart on
  // them. They are independent: a patient can arrive from the ICU already
  // intubated AND have no airway intervention here, which is both at once.
  const applyAirwayAbsentReason = (which: "presentsIntubated" | "airwayNotApplicable") => {
    const next = airwayAbsentReason(which, {
      presentsIntubated,
      airwayNotApplicable: airwayNA,
    })
    setValue("presentsIntubated", next.presentsIntubated, { shouldDirty: true })
    setValue("airwayNotApplicable", next.airwayNotApplicable, { shouldDirty: true })
    if (next.airwayNotApplicable) {
      // “No airway intervention” is mutually exclusive with every selected
      // airway device and instrument, including the Smart airway entries.
      for (const [field, value] of Object.entries(airwayRecordFields([]))) {
        setValue(field as keyof IntraopFormFields, value as never, { shouldDirty: true })
      }
      if (which === "airwayNotApplicable" && onEventOps) {
        const update: CoreLogEvent[] = []
        const remove: string[] = []
        for (const event of timelineLog) {
          if (event.type !== "clinical_event") continue
          const rawPatch = event.intraopPatch
          const patch = rawPatch && typeof rawPatch === "object" ? rawPatch as Record<string, unknown> : null
          const hasAirway = event.clinicalRelation === "airway-record"
            || AIRWAY_EVENT_COLORS[event.label ?? ""] != null
            || !!patch && Object.keys(patch).some(key => AIRWAY_RECORD_PATCH_KEYS.includes(key))
          if (!hasAirway) continue
          if (!patch) {
            if (event.id) remove.push(event.id)
            continue
          }
          const stripped = stripAirwayRecordPatch(patch)
          if (Object.keys(stripped).length === 0) {
            if (event.id) remove.push(event.id)
          } else {
            update.push({ ...event, intraopPatch: stripped } as unknown as CoreLogEvent)
          }
        }
        if (update.length > 0 || remove.length > 0) void onEventOps({ add: [], update, remove })
      }
    }
  }
  const setPresentsIntubated = () => applyAirwayAbsentReason("presentsIntubated")
  const setAirwayNA = () => {
    if (!airwayNA) {
      const values = getValues()
      const hasRecordedAirway = (values.airwayDevices?.length ?? 0) > 0
        || (values.airwayDeviceEntries?.length ?? 0) > 0
        || (values.airwayTools?.length ?? 0) > 0
      if (hasRecordedAirway && typeof window !== "undefined" && !window.confirm(t("intraop.airway.clearRecorded"))) return
    }
    applyAirwayAbsentReason("airwayNotApplicable")
  }
  const clearAirwayNotApplicable = () => {
    if (airwayNA) setValue("airwayNotApplicable", false, { shouldDirty: true })
  }
  const [timeErrors,           setTimeErrors]           = useState<{ startTime?: boolean; endTime?: boolean }>({})
  const [incompleteItems,      setIncompleteItems]      = useState<string[] | null>(null)
  const [canContinueIncomplete, setCanContinueIncomplete] = useState(true)
  // The Legacy Monitoring section is one grouped list now; the setter stays for templates that expect it.
  const [, setAdvancedMonOpen] = useState(false)
  const [airwayExpandedDevice, setAirwayExpandedDevice] = useState<string | null>(null)
  const [activeTab,            setActiveTab]            = useState(() => intraopFocusTab(focus) ?? "overview")
  useScrollToReadiness(focus)
  const [airwayOverride,       setAirwayOverride]       = useState(false)
  const monDefaultsApplied      = useRef(false)
  const deviceWasCompleteOnOpen = useRef(false)
  const timelineSectionRef = useRef<HTMLDivElement>(null)
  const pendingLegacyAirwayEventsRef = useRef(new Map<string, { previousDevices: string[]; airwayPatch: Record<string, unknown> }>())

  const chartAirwayEvent = useCallback((event: { id?: string; label: string; ts: string; clinicalRelation?: string; intraopPatch?: Record<string, unknown> }): boolean => {
    if (!onEventOps) return false
    const existing = timelineLog.find(item => item.type === "clinical_event" && (event.id ? item.id === event.id : item.label === event.label && item.ts === event.ts))
    if (existing) {
      if (!event.intraopPatch) return false
      void onEventOps({
        add: [],
        update: [{ ...existing, ...event, id: existing.id, clinicalRelation: event.clinicalRelation ?? clinicalRelationForEventLabel(event.label) ?? undefined, recordedAt: serverNow().toISOString() }],
        remove: [],
      })
      return true
    }
    void onEventOps({
      add: [{ id: event.id ?? randomId(), ts: event.ts, type: "clinical_event", label: event.label, color: AIRWAY_EVENT_COLORS[event.label] ?? "#6366f1", clinicalRelation: event.clinicalRelation ?? clinicalRelationForEventLabel(event.label) ?? undefined, recordedAt: serverNow().toISOString(), ...(event.intraopPatch ? { intraopPatch: event.intraopPatch } : {}) }],
      update: [], remove: [],
    })
    return true
  }, [onEventOps, timelineLog])
  const legacyAirwayPatch = useCallback((nextDevices: readonly string[]) => {
    const values = getValues()
    return {
      airwayDevices: [...nextDevices],
      airwayNotApplicable: false,
      airwayTools: values.airwayTools ?? [],
      lmaSize: values.lmaSize ?? null,
      oralTubeSize: values.oralTubeSize ?? null,
      oralCuffed: values.oralCuffed ?? null,
      nasalTubeSize: values.nasalTubeSize ?? null,
      nasalCuffed: values.nasalCuffed ?? null,
      dltType: values.dltType ?? null,
      dltSide: values.dltSide ?? null,
      dltSize: values.dltSize ?? null,
      endobronchialSize: values.endobronchialSize ?? null,
    }
  }, [getValues])
  const chartLegacyAirwayDevice = useCallback((device: string, previousDevices: readonly string[], patch?: Record<string, unknown>): boolean => {
    if (readOnly) return false
    const insertedAt = resolveAirwayTime("start", { startedAt: chartStartedAt ?? null, now: serverNow().toISOString() })
    if (!insertedAt) {
      pendingLegacyAirwayEventsRef.current.set(device, { previousDevices: [...previousDevices], airwayPatch: { ...(patch ?? {}) } })
      toast.error(t("intraop.airway.missingStart"))
      return false
    }
    pendingLegacyAirwayEventsRef.current.delete(device)
    const label = airwayClinicalEvent(device, {
      priorTrachealTube: hasActiveTrachealTube(airwayDeviceEntriesOf({ airwayDevices: previousDevices })),
    })
    if (!label) return false
    const nextDevices = Array.isArray(patch?.airwayDevices) ? patch.airwayDevices.filter((value): value is string => typeof value === "string") : [...previousDevices, device]
    const eventPatch = { ...legacyAirwayPatch(nextDevices), ...(patch ?? {}), airwayDevices: nextDevices, airwayNotApplicable: false, airwayEventDevice: device }
    const added = chartAirwayEvent({ id: clinicalRecordId("airway-event", insertedAt), label, ts: insertedAt, intraopPatch: eventPatch })
    if (added) atomicAirwayEventPendingRef.current = true
    return added
  }, [chartAirwayEvent, chartStartedAt, legacyAirwayPatch, readOnly, t])
  function chartVascularEvent(event: { id?: string; label: string; ts: string; clinicalRelation?: string; intraopPatch?: Record<string, unknown> }) {
    if (!onEventOps) return
    const existing = timelineLog.find(item => item.type === "clinical_event" && (event.id ? item.id === event.id : item.label === event.label && item.ts === event.ts))
    if (existing) {
      if (!event.intraopPatch) return
      void onEventOps({ add: [], update: [{ ...existing, ...event, id: existing.id, clinicalRelation: event.clinicalRelation ?? clinicalRelationForEventLabel(event.label) ?? undefined, recordedAt: serverNow().toISOString() }], remove: [] })
      return
    }
    void onEventOps({
      add: [{ id: event.id ?? randomId(), ts: event.ts, type: "clinical_event", label: event.label, color: VASCULAR_EVENT_COLORS[event.label] ?? "#a67cff", clinicalRelation: event.clinicalRelation ?? clinicalRelationForEventLabel(event.label) ?? undefined, recordedAt: serverNow().toISOString(), ...(event.intraopPatch ? { intraopPatch: event.intraopPatch } : {}) }],
      update: [], remove: [],
    })
  }

  function expandAirwayDevice(v: string) {
    const vals = getValues()
    const devs: string[] = vals.airwayDevices ?? []
    // Reopening an already-added device is a re-edit: clear its sub-fields so
    // the panel opens with everything deselected and the user re-picks from
    // scratch, identical to first-time entry (the normal
    // incomplete→complete→auto-collapse flow then runs again). Previously we
    // kept the old values and set deviceWasCompleteOnOpen to suppress the
    // auto-collapse, but that flag was never reset, so after a re-edit the
    // panel could never collapse again and the device was impossible to edit.
    if (devs.includes(v)) {
      for (const field of AIRWAY_DEVICE_REQUIRED_FIELDS[v as AirwayDeviceWithProfile] ?? []) {
        setValue(field as Parameters<typeof setValue>[0], undefined)
      }
    }
    deviceWasCompleteOnOpen.current = false
    setAirwayExpandedDevice(v)
  }

  // Keep airwayDevices in sync with the currently-open device's own completeness:
  // add it the moment it becomes complete (this is also the gate that gets it to the
  // DB in the first place), and drop it again if an edit blanks a required field back
  // out — a device should never sit confirmed-but-empty. Auto-collapses on completion.
  useEffect(() => {
    if (!airwayExpandedDevice) return
    const vals = getValues()
    const devs: string[] = vals.airwayDevices ?? []
    const complete = isAirwayDeviceComplete(airwayExpandedDevice, vals)
    const nextDevices = syncAirwayDeviceSelection(devs, airwayExpandedDevice, complete)
    if (nextDevices !== devs) {
      setValue("airwayDevices", nextDevices)
      if (complete && !devs.includes(airwayExpandedDevice)) chartLegacyAirwayDevice(airwayExpandedDevice, devs, legacyAirwayPatch([...devs, airwayExpandedDevice]))
    }
    if (complete && !deviceWasCompleteOnOpen.current) setAirwayExpandedDevice(null)
  }, [_wDltSide, _wDltSize, _wDltType, _wEbSize, _wLmaSize, _wNasalCuffed, _wNasalTubeSize, _wOralCuffed, _wOralTubeSize, airwayExpandedDevice, chartLegacyAirwayDevice, getValues, legacyAirwayPatch, setValue])

  const watchedStartTime = useWatch({ control, name: "startTime" })
  const watchedEndTime = useWatch({ control, name: "endTime" })
  const watchedNbpMonitor = useWatch({ control, name: "nbpMonitor" })
  const watchedInvasiveBP = useWatch({ control, name: "invasiveBP" })
  const watchedEcg = useWatch({ control, name: "ecg" })
  const watchedSpO2Monitor = useWatch({ control, name: "spO2Monitor" })
  const watchedEtco2Monitor = useWatch({ control, name: "etco2Monitor" })
  const watchedTempMonitor = useWatch({ control, name: "tempMonitor" })
  const startTime  = watchedStartTime || "08:00"
  const showAirway   = techniqueIsGeneral(techniques)
  const showGases    = techniqueUsesGas(techniques)

  const monitoring = {
    nbpMonitor:    !!watchedNbpMonitor,
    invasiveBP:    !!watchedInvasiveBP,
    ecg:           !!watchedEcg,
    spO2Monitor:   !!watchedSpO2Monitor,
    etco2Monitor:  !!watchedEtco2Monitor,
    tempMonitor:   !!watchedTempMonitor,
  }

  // A dose that clashes with a recorded allergy is acknowledged before it is added (1.5.0).
  const allergyGate = useAllergyGate({ preop, locale: locale === "bg" ? "bg" : "en", ready: chartStartMs !== null })
  // 10.2.0: the MH-history warning, the local anaesthetic maximum and the latex banner.
  const suggestionGate = useSuggestionGate({ context: suggestionContext, log: timelineLog, locale, now: () => serverNow().toISOString(), ready: chartStartMs !== null })
  // The phone app's End case check, on web (1.5.0): blockers stop the end.
  const endCheck = useEndCaseCheck({
    record: () => ({ ...getValues(), timetableData: timetable, keyEvents: eventLog ?? [] }) as Record<string, unknown>,
    locale: locale === "bg" ? "bg" : "en",
    onGo: area => { setActiveTab(intraopFocusTab(area) ?? "overview"); scrollToReadiness(area) },
  })

  function handleContinue() {
    const vals = getValues()

    const readiness = evaluateIntraopReadiness({
      ...vals,
      airwayDevices: presentsIntubated || airwayNA
        ? ["DOCUMENTED_WITHOUT_NEW_DEVICE"]
        : vals.airwayDevices,
      timetableData: timetable,
      keyEvents: eventLog,
    } as Record<string, unknown>)
    const errs = intraopTimeErrors(readiness.blockers.map(issue => issue.code))
    setTimeErrors(errs)

    if (readiness.blockers.length > 0) {
      setCanContinueIncomplete(false)
      setIncompleteItems(readiness.blockers.map(issue => localizeIssue(issue.code)))
      if (errs.startTime || errs.endTime) {
        setActiveTab("overview")
        setTimeout(() => timelineSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50)
      }
      return
    }

    if (readiness.warnings.length > 0) {
      setCanContinueIncomplete(true)
      setIncompleteItems(readiness.warnings.map(issue => localizeIssue(issue.code)))
      return
    }

    doSubmit()
  }

  function doSubmit() {
    // Bypass react-hook-form's Zod resolver — handleContinue already validates
    // the mandatory fields (startTime, endTime). Calling handleSubmit() here
    // causes Zod to reject fields it can't parse (e.g. null-vs-undefined
    // mismatches on Json array fields), which silently blocks navigation.
    handleSubmitWithTimetable(getValues() as IntraopData)
  }

  function handleManualSave() {
    if (!onAutoSave) return
    onAutoSave({ ...getValues() })
    setManualSaved(true)
    setTimeout(() => setManualSaved(false), 2000)
  }

  function handleSubmitWithTimetable(formData: IntraopData) {
    // Columns are chart positions; the API stores wall-clock times. The
    // conversion lives in @/lib/intraop-submit, where it has a test.
    const { vitals, drugsAdministered } = buildIntraopSubmission(timetable, startTime)
    // The chart itself is never sent: its events are already saved one by one.
    onSubmit({ ...formData, vitals, drugsAdministered })
  }

  // The case panel (10.0.0): the same one as preop and postop, with this
  // step's parts, what is needed to finalise, and its times.
  const minutesOf = (time: string | null | undefined) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(time ?? "")
    return match ? Number(match[1]) * 60 + Number(match[2]) : null
  }
  const startMinutes = minutesOf(watchedStartTime)
  const endMinutes = minutesOf(watchedEndTime)
  const durationMinutes = startMinutes != null && endMinutes != null ? (endMinutes - startMinutes + 1440) % 1440 : null
  const intraopSidebar = layoutMode === "sidebar" ? (
    <CaseSidebar
      stages={stages ?? { current: 1 }}
      sections={[
        { id: "overview", label: t("intraop.tabs.overview"), missing: !watchedStartTime || !watchedEndTime },
        { id: "anaesthesia", label: t("intraop.tabs.anaesthesia"), missing: techniques.length === 0 },
        { id: "chart", label: t("intraop.tabs.chart"), missing: false },
        { id: "finish", label: t("intraop.tabs.finish"), missing: false },
      ]}
      anchorPrefix="intraop-sec-"
      patient={sidebarPatientOf(preop, locale)}
      broselow={isPediatric ? broselowZone({ clinicalMode: "PEDIATRIC", heightCm: preop?.heightCm ?? null, weightKg: preop?.weightKg ?? null }) : null}
      factsTitle={t("intraop.sidebar.title")}
      facts={[
        { label: t("intraop.startTime"), value: watchedStartTime || "—" },
        { label: t("intraop.endTime"), value: watchedEndTime || "—" },
        { label: t("intraop.sidebar.duration"), value: durationMinutes == null ? "—" : `${Math.floor(durationMinutes / 60)} h ${durationMinutes % 60} min` },
        { label: t("intraop.sidebar.technique"), value: techniques.length ? techniques.slice(0, 2).map(value => techniqueDisplayLabel(value, techniqueTree)).join(", ") : "—" },
        ...(preop?.asaScore ? [{ label: "ASA", value: preop.asaScore }] : []),
      ]}
      // The footer below already carries Continue; the panel stays clear of it.
      clearFooter
      testId="intraop-sidebar"
      stripTestId="intraop-section-strip"
    />
  ) : null


  // ── Suggestions (10.2.0): failed lines and the embedded airway picker ──────
  const [airwayDialog, setAirwayDialog] = useState<{ reason: AirwayExchangeReason | null; at: string; eventId?: string; eventLabel?: string; complication?: CoreLogEvent } | null>(null)
  const suggestionForm = {
    linesOf: (kind: AccessKind) => ((getValues("vascularAccesses") ?? []) as VascularLine[])
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => accessKindOf(line.site) === kind)
      .map(({ line, index }) => ({ id: String(index), label: vascularLineText(line, { failed: "", time: () => "" }), failed: line.failed === true })),
    markLineFailed: (id: string, failedAt: string) => {
      setValue("vascularAccesses", replaceFailedLine((getValues("vascularAccesses") ?? []) as VascularLine[], Number(id), failedAt) as IntraopFormFields["vascularAccesses"], { shouldDirty: true })
    },
    openAirway: (_rect: DOMRect, complication: CoreLogEvent) => setAirwayDialog({ reason: "reintubation", at: serverNow().toISOString(), complication }),
  }
  // E6: Reintubation or Airway exchange charted on this screen opens the picker
  // (Airway exchange asks why first); an event whose device is already on the list does not.
  const seenAirwayEvents = useRef<Set<string> | null>(null)
  const pendingAirwayEvents = useRef<Map<string, CoreLogEvent>>(new Map())
  const openedAirwayEvents = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (readOnly) return
    const events = timelineLog.filter(event => event.type === "clinical_event" && (event.label === "Reintubation" || event.label === "Airway exchange"))
    if (seenAirwayEvents.current == null) { seenAirwayEvents.current = new Set(events.map(event => event.id)); return }
    const entries = airwayDeviceEntriesOf(getValues() as Record<string, unknown>)
    const seen = seenAirwayEvents.current
    for (const event of events) {
      if (seen.has(event.id)) continue
      seen.add(event.id)
      const exactLink = entries.some(entry => entry.sourceEventId === event.id)
      const legacyMatches = entries.filter(entry => entry.insertedAt === event.ts)
      const linked = exactLink || Array.isArray(event.intraopPatch?.airwayDeviceEntries)
        || (!event.sourceEventId && legacyMatches.length === 1)
      if (!linked) pendingAirwayEvents.current.set(event.id, event)
    }
    if (airwayDialog) return
    const fresh = [...pendingAirwayEvents.current.values()]
      .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
      .find(event => !openedAirwayEvents.current.has(event.id))
    if (fresh) {
      openedAirwayEvents.current.add(fresh.id)
      pendingAirwayEvents.current.delete(fresh.id)
      setAirwayDialog({ reason: fresh.label === "Reintubation" ? "reintubation" : null, at: fresh.ts, eventId: fresh.id, eventLabel: fresh.label })
    }
  }, [timelineLog, readOnly, airwayDialog, getValues])
  function saveAirwayExchange(next: AirwayDeviceEntry[]) {
    const dialog = airwayDialog
    setAirwayDialog(null)
    if (!dialog) return
    const patch = airwayRecordFields(next, (getValues("airwayTools") ?? []) as string[])
    const hasAtomicEvent = !!onEventOps && (!!dialog.complication || (!!dialog.eventId && !!dialog.eventLabel))
    if (hasAtomicEvent) atomicAirwayEventPendingRef.current = true
    setValue("airwayDeviceEntries", next as unknown as IntraopFormFields["airwayDeviceEntries"], { shouldDirty: true })
    for (const [field, value] of Object.entries(patch)) {
      if (field === "airwayDeviceEntries") continue
      setValue(field as keyof IntraopFormFields, (value ?? undefined) as never, { shouldDirty: true })
    }
    if (dialog.complication && onEventOps) {
      void onEventOps(cardEventOps(dialog.complication, "Reintubation", "reintubate", dialog.at, serverNow(), { intraopPatch: patch }))
    } else if (dialog.eventId && dialog.eventLabel) {
      chartAirwayEvent({ id: dialog.eventId, label: dialog.eventLabel, ts: dialog.at, intraopPatch: patch })
    }
  }

  // ── Smart selection (10.2.0) ────────────────────────────────────────────────
  // The Airway tab that opens on what is in place. What it offers and how it saves
  // is Core's (airway-smart); this only hands it the case and writes the result.
  const airwayScreen = useAirwayScreen()
  useWatch({ control, name: ["airwayDeviceEntries", "airwayDevices", "airwayTools"] })
  const [smartRequest, setSmartRequest] = useState<AirwaySmartRequest | null>(null)
  const smartPatient: AirwayPatient = {
    clinicalMode: preop?.clinicalMode ?? "ADULT",
    ageYears: preop?.ageYears ?? null,
    age: preop?.ageValue != null && preop.ageUnit ? { value: preop.ageValue, unit: preop.ageUnit } : null,
    weightKg: preop?.weightKg ?? null, heightCm: preop?.heightCm ?? null, sex: preop?.sex ?? null,
  }
  const airwayName = (code: string) => displayClinicalCode("option:AIRWAY_MANAGEMENT", code, locale)
  const smartTimeOf = (iso: string) => (timelineZone ? localTimeOf(new Date(iso), timelineZone) : null) ?? iso.slice(11, 16)
  function applyAirwayEntries(next: AirwayDeviceEntry[]) {
    setValue("airwayDeviceEntries", next as unknown as IntraopFormFields["airwayDeviceEntries"], { shouldDirty: true })
    if (next.length > 0) setValue("airwayNotApplicable", false, { shouldDirty: true })
    for (const [field, value] of Object.entries(airwayRecordFields(next, (getValues("airwayTools") ?? []) as string[]))) {
      if (field === "airwayDeviceEntries") continue
      setValue(field as keyof IntraopFormFields, (value ?? undefined) as never, { shouldDirty: true })
    }
  }
  function removeSmartAirwayEntry(entry: AirwayDeviceEntry, next: AirwayDeviceEntry[]) {
    applyAirwayEntries(next)
    if (entry.sourceEventId && onEventOps) void onEventOps({ add: [], update: [], remove: [entry.sourceEventId] })
  }
  const removeLegacyAirwayEvents = (device: string) => {
    pendingLegacyAirwayEventsRef.current.delete(device)
    if (!onEventOps) return
    const ids = timelineLog
      .filter(event => event.type === "clinical_event" && event.intraopPatch?.airwayEventDevice === device)
      .map(event => event.id)
    if (ids.length > 0) void onEventOps({ add: [], update: [], remove: ids })
  }
  useEffect(() => {
    if (!chartStartedAt || readOnly || airwayScreen !== "legacy" || pendingLegacyAirwayEventsRef.current.size === 0) return
    const devices = new Set(getValues("airwayDevices") ?? [])
    for (const [device, pending] of [...pendingLegacyAirwayEventsRef.current.entries()]) {
      if (!devices.has(device)) {
        pendingLegacyAirwayEventsRef.current.delete(device)
        continue
      }
      chartLegacyAirwayDevice(device, pending.previousDevices, legacyAirwayPatch([...devices]))
    }
  }, [airwayScreen, chartStartedAt, chartLegacyAirwayDevice, getValues, legacyAirwayPatch, readOnly])
  const smartProps = {
    patient: smartPatient, startedAt: chartStartedAt ?? null, now: () => serverNow().toISOString(), timeZone: timelineZone ?? null,
    difficultAirway: preop?.mallampati === "III" || preop?.mallampati === "IV", deviceLabel: airwayName, toolLabel: airwayName,
    availableDevices: airwayDeviceOptions.map(option => option.value), availableTools: airwayToolOptions.map(option => option.value),
  }
  // Intubated, LMA in and DLT placed charted on the timeline open the same panel, with that time already set.
  const SMART_EVENT_DEVICE = AIRWAY_EVENT_DEVICE
  const seenSmartEvents = useRef<Set<string> | null>(null)
  const pendingSmartEvents = useRef<Map<string, CoreLogEvent>>(new Map())
  const openedSmartEvents = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (readOnly) return
    const events = timelineLog.filter(event => event.type === "clinical_event" && event.label != null && SMART_EVENT_DEVICE[event.label])
    if (seenSmartEvents.current == null) { seenSmartEvents.current = new Set(events.map(event => event.id)); return }
    const entries = airwayDeviceEntriesOf(getValues() as Record<string, unknown>)
    const seen = seenSmartEvents.current
    for (const event of events) {
      if (seen.has(event.id)) continue
      seen.add(event.id)
      const exactLink = entries.some(entry => entry.sourceEventId === event.id)
      const legacyMatches = entries.filter(entry => entry.insertedAt === event.ts)
      const linked = exactLink || Array.isArray(event.intraopPatch?.airwayDeviceEntries)
        || (!event.sourceEventId && legacyMatches.length === 1)
      if (!linked) pendingSmartEvents.current.set(event.id, event)
    }
    if (airwayScreen !== "smart") return
    const fresh = [...pendingSmartEvents.current.values()]
      .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
      .find(event => !openedSmartEvents.current.has(event.id))
    if (fresh?.label) {
      openedSmartEvents.current.add(fresh.id)
      pendingSmartEvents.current.delete(fresh.id)
      setSmartRequest({ device: SMART_EVENT_DEVICE[fresh.label]!, at: fresh.ts, source: "timeline", eventId: fresh.id, eventLabel: fresh.label })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timelineLog, readOnly, airwayScreen, getValues])
  const smartNode = airwayScreen === "smart" ? (
    <AirwaySmart {...smartProps} entries={airwayDeviceEntriesOf(getValues() as Record<string, unknown>)} onChange={applyAirwayEntries} onRemove={removeSmartAirwayEntry} onEvent={chartAirwayEvent}
      onAtomicSave={(next, event) => {
        atomicAirwayEventPendingRef.current = true
        applyAirwayEntries(next)
        chartAirwayEvent(event)
      }}
      techniques={techniques}
      describe={entry => airwayDeviceSummary(entry.device, entry.details, { device: airwayName, attribute: code => displayClinicalCode("clinicalAttribute", code, locale) }) ?? airwayName(entry.device)}
      timeOf={smartTimeOf} />
  ) : undefined

  // ── Smart selection for vascular access (10.2.0) ────────────────────────────
  // The Vascular access tab that opens on what is in place. What it offers and how it saves is Core's
  // (vascular-smart); this hands it the case and writes the result into the same list the legacy tab keeps.
  const vascularScreen = useVascularScreen()
  useWatch({ control, name: ["vascularAccesses"] })
  const [vascularRequest, setVascularRequest] = useState<VascularSmartRequest | null>(null)
  const vascularLines = () => ((getValues("vascularAccesses") ?? []) as unknown as VascularLine[])
  function applyVascularLines(next: VascularLine[], event?: { id?: string; label: string; ts: string; intraopPatch?: Record<string, unknown> }) {
    if (event) atomicVascularEventPendingRef.current = true
    setValue("vascularAccesses", next as unknown as IntraopFormFields["vascularAccesses"], { shouldDirty: true })
  }
  const vascularProps = {
    patient: { clinicalMode: preop?.clinicalMode ?? "ADULT", ageYears: preop?.ageYears ?? null },
    startedAt: chartStartedAt ?? null, now: () => serverNow().toISOString(), timeZone: timelineZone ?? null,
    siteLabel: (code: string) => displayClinicalCode("option:VASCULAR_ACCESS", code, locale),
  }
  // IV line in, Art line in, CVC in and PICC charted on the timeline open the same panel, with that time already set.
  const seenVascularEvents = useRef<Set<string> | null>(null)
  const pendingVascularEvents = useRef<Map<string, CoreLogEvent>>(new Map())
  const openedVascularEvents = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (readOnly) return
    const events = timelineLog.filter(event => event.type === "clinical_event" && event.label != null && VASCULAR_EVENT_TYPE[event.label])
    if (seenVascularEvents.current == null) { seenVascularEvents.current = new Set(events.map(event => event.id)); return }
    const lines = ((getValues("vascularAccesses") ?? []) as unknown as VascularLine[])
    const seen = seenVascularEvents.current
    for (const event of events) {
      if (seen.has(event.id)) continue
      seen.add(event.id)
      const exactLink = lines.some(line => line.sourceEventId === event.id)
      const legacyMatches = lines.filter(line => line.insertedAt === event.ts)
      const linked = exactLink || Array.isArray(event.intraopPatch?.vascularAccesses)
        || (!event.sourceEventId && legacyMatches.length === 1)
      if (!linked) pendingVascularEvents.current.set(event.id, event)
    }
    if (vascularScreen !== "smart") return
    const fresh = [...pendingVascularEvents.current.values()]
      .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
      .find(event => !openedVascularEvents.current.has(event.id))
    if (fresh?.label) {
      openedVascularEvents.current.add(fresh.id)
      pendingVascularEvents.current.delete(fresh.id)
      setVascularRequest({ ...VASCULAR_EVENT_TYPE[fresh.label]!, at: fresh.ts, source: "timeline", eventId: fresh.id, eventLabel: fresh.label })
    }
  }, [timelineLog, readOnly, vascularScreen, getValues])
  const vascularNode = vascularScreen === "smart" ? (
    <VascularSmart {...vascularProps} lines={vascularLines()} onChange={applyVascularLines} onEvent={chartVascularEvent}
      onAtomicSave={(next, event) => { applyVascularLines(next, event); chartVascularEvent(event) }} techniques={techniques} timeOf={smartTimeOf} />
  ) : undefined

  // ── Smart selection for monitoring (10.2.0) ─────────────────────────────────
  // Standard in one switch and the monitors this case calls for. What is suggested and when a reading is
  // due is Core's (monitoring-smart); a monitor added sets the same flag the legacy section sets.
  const monitoringScreen = useMonitoringScreen()
  const watchedMonitoring = useWatch({ control, name: monitoringOptions.map(option => option.value as keyof IntraopFormFields) })
  const hiddenMonitors = useMemo(() => timelineLog
    .filter(event => event.type === "prompt_answer" && event.answer === "not_now" && event.answerKind?.startsWith("monitor:") && typeof event.answerFor === "string")
    .map(event => event.answerFor as string), [timelineLog])
  const activeMonitoring = monitoringOptions.filter((_option, index) => Boolean(watchedMonitoring[index])).map(option => option.value)
  function applyMonitoring(next: string[]) {
    for (const option of monitoringOptions) setValue(option.value as keyof IntraopFormFields, next.includes(option.value) as never, { shouldDirty: true })
  }
  const monitoringSuggestionList = monitoringSuggestions({
    monitoring: activeMonitoring, techniques, airway: airwayDeviceEntriesOf(getValues() as Record<string, unknown>), lines: vascularLines(), hidden: hiddenMonitors,
    relaxantAt: timelineLog.find(event => event.type === "drug" && !!event.name && isRelaxant(event.name))?.ts ?? null,
    startedAt: chartStartedAt ?? null, now: serverNow(),
    settings: suggestionContext?.settings ?? null, user: suggestionContext?.user ?? null,
  })
  const dismissMonitoringSuggestion = useCallback((suggestion: MonitoringSuggestion) => {
    if (!onEventOps) return
    const occurrence = suggestion.key ?? monitoringSuggestionKey(suggestion.field, suggestion.at)
    const nowIso = serverNow().toISOString()
    void onEventOps({
      add: [{
        id: monitoringDismissalEventId(suggestion.field, occurrence),
        ts: nowIso,
        type: "prompt_answer",
        answerKind: monitoringAutomationId(suggestion.field),
        answerFor: occurrence,
        answer: "not_now",
        suggestion: monitoringAutomationId(suggestion.field),
        recordedAt: nowIso,
      }],
      update: [], remove: [],
    })
  }, [onEventOps])
  function lastMonitorReading(field: string) {
    const key = ({ bisValue: "bis", tofRatio: "tofRatio", cvpMmHg: "cvp", etco2: "etco2", temp: "temp" } as const)[(MONITORING_READINGS[field]?.vital ?? "temp") as "bisValue" | "tofRatio" | "cvpMmHg" | "etco2" | "temp"]
    const event = [...timelineLog].reverse().find(item => item.type === "vital" && typeof item[key] === "number")
    return event ? { text: String(event[key]), at: event.ts } : null
  }
  const monitoringNode = monitoringScreen === "smart" && !readOnly ? (
    <MonitoringSmart monitoring={activeMonitoring} onChange={applyMonitoring} monitoringOptions={monitoringOptions} suggestions={monitoringSuggestionList}
      onHide={dismissMonitoringSuggestion} lastReading={lastMonitorReading} now={() => serverNow().toISOString()} />
  ) : undefined

  // ── Smart selection for equipment (10.2.0) ──────────────────────────────────
  // Calculated suggestions compare with the canonical Airway/monitoring record;
  // preparation markers are persisted separately and never imply clinical use.
  const equipmentScreen = useEquipmentScreen()
  const [catheterOn, ngtOn, equipmentPrepared] = useWatch({ control, name: ["urinaryCatheter", "stomachTube", "equipmentPrepared"] })
  const equipmentAirwayEntries = airwayDeviceEntriesOf(getValues() as Record<string, unknown>)
  const equipmentSmart = equipmentScreen === "smart" && !readOnly ? {
    flags: { urinaryCatheter: !!catheterOn, stomachTube: !!ngtOn },
    airwayEntries: equipmentAirwayEntries,
    prepared: (equipmentPrepared ?? {}) as Record<string, boolean>,
    onFlag: (field: "urinaryCatheter" | "stomachTube") => setValue(field, !getValues(field), { shouldDirty: true }),
    onPreparedChange: (key: string, value: boolean) => setValue("equipmentPrepared", { ...(getValues("equipmentPrepared") ?? {}), [key]: value }, { shouldDirty: true }),
    onUseAirway: (device: "ORAL_ETT" | "LMA") => {
      const entries = airwayDeviceEntriesOf(getValues() as Record<string, unknown>)
      if (airwayPrimaryConflict(entries, device)) return false
      // The equipment shortcut is still a clinical airway record. Do not
      // silently stamp a later device with "now" when the case has no start.
      const insertedAt = resolveAirwayTime("start", { startedAt: smartProps.startedAt, now: smartProps.now() })
      if (!insertedAt) return false
      const eventId = clinicalRecordId("airway-event", insertedAt)
      const next = addAirwayDevice(entries, {
        id: clinicalRecordId("airway", insertedAt), device, details: suggestedAirwayDetails(device, smartProps.patient),
        insertedAt,
        sourceEventId: eventId,
      })
      atomicAirwayEventPendingRef.current = true
      applyAirwayEntries(next)
      const label = airwayClinicalEvent(device, {
        priorTrachealTube: hasActiveTrachealTube(entries),
      })
      if (label) chartAirwayEvent({ id: eventId, label, ts: insertedAt, intraopPatch: airwayRecordFields(next) })
      return true
    },
  } : undefined

  // ── Smart selection for technique (10.2.0) ──────────────────────────────────
  // Search, the preop plan, the usual ones and the side of a block. The saved data is the list of technique codes with
  // the side beside it; finding and sides are Core's (technique-smart).
  const techniqueScreen = useTechniqueScreen()
  const recentTechniques = useRecentTechniques()
  const techniqueSides = parseTechniqueSides(useWatch({ control, name: "techniqueSides" }))
  function applyTechniques(next: string[], sides: Record<string, TechniqueSide>, added: string[]) {
    setValue("techniques", next, { shouldDirty: true })
    setValue("techniqueSides", sides, { shouldDirty: true })
    recentTechniques.remember(added)
  }
  function onTimetableChangeWithTci(after: TimetableData) {
    const beforeIds = new Set((timetable.infusions ?? []).map(infusion => infusion.startEventId ?? infusion.id))
    const newTci = (after.infusions ?? []).find(infusion =>
      !beforeIds.has(infusion.startEventId ?? infusion.id)
      && techniquesAfterTciStart(techniques, infusion.tciModel).length > techniques.length,
    )
    const committed = onTimetableChange(after)
    if (!committed || !newTci) return
    setValue("techniques", techniquesAfterTciStart(techniques, newTci.tciModel), { shouldDirty: true })
  }
  // The timetable callback covers a start made from this form. The event log
  // effect covers a start that was already present when the form opened or was
  // written by another device, so the account-wide TCI rule is convergent.
  const seenTciStartIds = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (readOnly) return
    const starts = timelineLog.filter(event => event.type === "infusion_start" && event.tciModel)
    const fresh = starts.filter(event => !seenTciStartIds.current.has(event.id))
    if (fresh.length === 0) return
    for (const event of fresh) seenTciStartIds.current.add(event.id)
    const next = fresh.reduce((current, event) => techniquesAfterTciStart(current, event.tciModel), techniques)
    if (next.length === techniques.length) return
    setValue("techniques", next, { shouldDirty: true })
    setValue("techniqueSides", techniqueSidesFor(next, techniqueSides), { shouldDirty: true })
  }, [readOnly, setValue, techniqueSides, techniques, timelineLog])
  const techniqueNode = techniqueScreen === "smart" && !readOnly ? (
    <TechniqueSmart techniques={techniques} sides={techniqueSides} onChange={applyTechniques} tree={techniqueTree}
      planned={preop?.plannedTechniques ?? []} recents={recentTechniques.recents} />
  ) : undefined

  // ── The event selector (10.2.0) ─────────────────────────────────────────────
  // The new list or the Legacy buttons, and the events likely to come next (only ones not charted yet). What is likely
  // is Core's (event-succession); the timetable's picker reads it from here.
  const eventsScreen = useEventsScreen()
  const fluidsScreen = useFluidsScreen()
  const eventLogScreen = useEventLogScreen()
  const likelyEvents = useLikelyEvents({
    log: timelineLog,
    structured: { airway: airwayDeviceEntriesOf(getValues() as Record<string, unknown>), vascular: (getValues("vascularAccesses") ?? []) as unknown as ReadonlyArray<Record<string, unknown>> },
    techniques,
    child: isPediatric,
    enabled: !readOnly && eventsScreen === "smart",
    onEventOps,
  })
  const eventSelector = { screen: eventsScreen, likely: likelyEvents.likely, dismiss: likelyEvents.dismiss }

  return (
    <EventSelectorContext.Provider value={eventSelector}>
    <form onSubmit={handleSubmit(handleSubmitWithTimetable)} className="flex flex-col gap-0">

      {/* Dual-mode layout — tabs or scroll, sharing the same section content */}
      {(() => {
        const tabOverview = (<>

      {/* Timing is the first clinical surface: every time-dependent shortcut
          must have a documented start before it can write an event. */}
      <div ref={timelineSectionRef} data-tour="intraop-timing" data-readiness="times position">
      <TimelineSection
        t={t} control={control} watch={watch} setValue={setValue} getValues={getValues}
        onAutoSave={onAutoSave}
        timeErrors={timeErrors} setTimeErrors={setTimeErrors}
        monDefaultsAppliedRef={monDefaultsApplied}
        setAdvancedMonOpen={setAdvancedMonOpen} setAirwayExpandedDevice={setAirwayExpandedDevice}
        onEndCorrectionOpen={setEndCorrectionOpen}
      />
      </div>

      {preop ? <IntraopPreopSummary preop={preop} ibw={calcIbw} isPediatric={isPediatric} surgeryStart={timelineStartedAt} timezone={timelineZone} /> : null}
      {/* Equipment suggestions */}
      {preop && isPediatric ? (
        <EquipmentSuggestions
          smart={equipmentSmart}
          clinicalMode="PEDIATRIC"
          ageValue={preop.ageValue}
          ageUnit={preop.ageUnit}
          ageYears={preop.ageYears}
          weightKg={preop.weightKg}
          heightCm={preop.heightCm}
          sex={preop.sex}
          bmi={preop.bmi}
          mallampati={preop.mallampati}
          neckMobility={preop.neckMobility}
          mouthOpeningCm={preop.mouthOpeningCm}
          cormackLehane={preop.cormackLehane}
        />
      ) : preop && (preop.weightKg || preop.heightCm || preop.ageYears) ? (
        <EquipmentSuggestions
          smart={equipmentSmart}
          clinicalMode="ADULT"
          ageYears={preop.ageYears}
          weightKg={preop.weightKg}
          heightCm={preop.heightCm}
          sex={preop.sex}
          bmi={preop.bmi}
          mallampati={preop.mallampati}
          neckMobility={preop.neckMobility}
          mouthOpeningCm={preop.mouthOpeningCm}
          cormackLehane={preop.cormackLehane}
        />
      ) : null}

      {/* Positions (multi-select) */}
      <PositionSection t={t} control={control} watch={watch} positionOptions={positionOptions} />

        </>)
        const tabAnaesthesia = (<>

      {/* Monitoring */}
      <div data-tour="intraop-monitoring" data-readiness="monitoring">
      <MonitoringSection t={t} watch={watch} setValue={setValue} monitoringOptions={monitoringOptions} smart={monitoringNode} />
      </div>{/* /intraop-monitoring */}

      {/* Anaesthesia technique */}
      <div data-tour="intraop-technique" data-readiness="technique airway vascular_access">
      <TechniqueSection t={t} control={control} techniques={techniques} techniqueTree={techniqueTree}
        presentsIntubated={presentsIntubated} setPresentsIntubated={setPresentsIntubated} smart={techniqueNode} />

      <AirwaySection
        control={control} watch={watch} setValue={setValue} register={register}
        airwayToolOptions={airwayToolOptions} airwayDeviceOptions={airwayDeviceOptions}
        presentsIntubated={presentsIntubated} showAirway={showAirway} techniquesLength={techniques.length}
        airwayOverride={airwayOverride} setAirwayOverride={setAirwayOverride}
        airwayNA={airwayNA} setAirwayNA={setAirwayNA}
        onAirwayInterventionSelected={clearAirwayNotApplicable}
        onAirwayDeviceConfirmed={chartLegacyAirwayDevice}
        onAirwayDeviceRemoved={removeLegacyAirwayEvents}
        airwayExpandedDevice={airwayExpandedDevice} setAirwayExpandedDevice={setAirwayExpandedDevice}
        expandAirwayDevice={expandAirwayDevice}
        smart={smartNode}
      />

      {/* Volatile agent & gas settings are now a timetable lane (see IntraopTimetable's
          Gas Settings row, gated by the same showAgentRow prop below) — removed from
          here so settings are tracked over time instead of set once statically. */}

      {/* Vascular access */}
      <VascularAccessSection control={control} watch={watch} smart={vascularNode} />

      {/* Premedication */}
      <PremedicationSection t={t} control={control} watch={watch} premedCategories={premedCategories} premedDoses={premedDoses}
        premedAnnotations={premedAnnotations} premedDoseForRoute={premedDoseForRoute}
        prospectiveGuidanceEnabled={prospectiveGuidanceEnabled} ordered={preop?.premedicationOrders} />
      </div>{/* /intraop-technique */}

        </>)
        const tabChart = (<>

      {/* Intraoperative timetable */}
      <div data-tour="intraop-timetable" data-readiness="vitals medications fluids events">{endCheck.panel}{suggestionGate.banner}{allergyGate.modal}{suggestionGate.modal}
      <SectionCard title={t("intraop.vitalsSection")}>
        <IntraopLabsDialog
          open={labsDialog.open}
          takenAt={labsDialog.takenAt}
          value={(watchedLabResults ?? []) as never}
          onChange={rows => setValue("labResults", rows as never, { shouldDirty: true })}
          onClose={() => setLabsDialog({ open: false, takenAt: null })}
          caseId={caseId ?? null}
          aiOptIn={aiOptIn}
        />
        <CaseSaveStateContext.Provider value={attention.saveState}>
        {!endCorrectionOpen && <IntraopAttentionPanel entries={attention.entries} onAnswer={attention.canAnswer ? attention.answer : undefined} onOpen={attention.canAnswer ? attention.open : undefined} refused={attention.refused} onDismissRefused={attention.saveState.dismissRefused} />}
        {vascularRequest && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4" onClick={() => setVascularRequest(null)}>
            <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-[#161616] p-2" onClick={event => event.stopPropagation()}>
              <VascularSmartPanel {...vascularProps} request={vascularRequest} lines={vascularLines()}
              onSave={(next, event) => { setVascularRequest(null); applyVascularLines(next, event); if (event) chartVascularEvent(event) }} onClose={() => setVascularRequest(null)} />
            </div>
          </div>
        )}
        {smartRequest && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4" onClick={() => setSmartRequest(null)}>
            <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-[#161616] p-2" onClick={event => event.stopPropagation()}>
              <AirwaySmartPanel {...smartProps} request={smartRequest} entries={airwayDeviceEntriesOf(getValues() as Record<string, unknown>)}
              onSave={(next, event) => {
                setSmartRequest(null)
                if (event) {
                  atomicAirwayEventPendingRef.current = true
                }
                applyAirwayEntries(next)
                if (event) chartAirwayEvent(event)
              }} onClose={() => setSmartRequest(null)} />
            </div>
          </div>
        )}
        {airwayDialog && (
          <AirwayExchangeDialog
            entries={airwayDeviceEntriesOf(getValues() as Record<string, unknown>)}
            deviceOptions={airwayDeviceOptions.map(option => ({ value: option.value, label: displayOption("AIRWAY_MANAGEMENT", option, locale) }))}
            deviceLabel={code => displayClinicalCode("option:AIRWAY_MANAGEMENT", code, locale)}
            reason={airwayDialog.reason}
            at={airwayDialog.at}
            onSave={saveAirwayExchange}
            onCancel={() => setAirwayDialog(null)}
          />
        )}
        <IntraopTimetable
          labResults={(watchedLabResults ?? []) as never}
          onOpenLabDraw={takenAt => setLabsDialog({ open: true, takenAt })}
          onOpenAllLabs={() => setLabsDialog({ open: true, takenAt: null })}
          clinicalMode={preop?.clinicalMode ?? "ADULT"}
          prospectiveGuidanceEnabled={prospectiveGuidanceEnabled}
          pediatricAgeValue={preop?.ageValue ?? preop?.ageYears ?? null}
          pediatricAgeUnit={preop?.ageUnit ?? (preop?.ageYears != null ? "YEARS" : null)}
          patientHeightCm={preop?.heightCm ?? null}
          patientSex={preop?.sex ?? null}
          pediatricDrugProfiles={clinicalRulesSnapshot?.pediatricDrugProfiles ?? []}
          pediatricFluidProfiles={clinicalRulesSnapshot?.pediatricFluidProfiles ?? []}
          pediatricInfusionProfiles={clinicalRulesSnapshot?.pediatricInfusionProfiles ?? []}
          adultDoseProfiles={clinicalRulesSnapshot?.adultDoseProfiles ?? []}
          pediatricRulesSource={clinicalRulesSnapshot?.source ?? null}
          pediatricRulesCachedAt={clinicalRulesSnapshot?.cachedAt ?? null}
          pediatricRulesLoading={clinicalRulesLoading}
          pediatricRulesError={clinicalRulesError}
          clinicalPresetId={clinicalRulesSnapshot?.preset?.id ?? null}
          clinicalPresetVersion={clinicalRulesSnapshot?.preset?.version ?? null}
          clinicalPresetScope={clinicalRulesSnapshot?.preset?.scope ?? null}
          startTime={watchedStartTime || "08:00"}
          startedAt={chartStartedAt ?? undefined}
          endTime={watchedEndTime || undefined}
          endedAt={timelineEndedAt ?? null} attention={attention} suggestionForm={readOnly ? undefined : suggestionForm} beforeEndCase={endCheck.before}
          autoEnded={autoEndedProp && !!timelineEndedAt && timelineEndedAt === defaultValues?.endedAt}
          caseStarted={caseStartedProp || !!watchedStartTime}
          monitoring={monitoring}
          showAgentRow={showGases}
          showJetRow={(_wVM ?? []).includes("Jet")}
          ibw={calcIbw}
          tbw={preop?.weightKg ?? null}
          data={timetable}
          onChange={allergyGate.guard(timetable, suggestionGate.guard(timetable, onTimetableChangeWithTci))}
          onEndCase={() => {
            const end = intraopEndCaseValuesNow(getValues("timezone"), getValues("startTime"))
            setValue("endTime", end.endTime)
            if (end.endedAt && end.timezone) { setValue("endedAt", end.endedAt); setValue("timezone", end.timezone) }
            if (end.endTimeNextDay) setValue("endTimeNextDay", true)
          }}
          onResumeCase={() => { setValue("endTime", ""); setValue("endTimeNextDay", false); setValue("endedAt", null) }}
          onPostopContinued={items => onPostopContinued?.(items)}
          onDeath={onDeath}
        />
        </CaseSaveStateContext.Provider>
      </SectionCard>

      {/* Drugs and Fluid Balance Totals */}
      <DrugsFluidTotalsSection t={t} control={control} watch={watch} liveDrugTotals={liveDrugTotals} liveFluidTotals={liveFluidTotals} provisional={totalsProvisional(timetable, attention.saveState)} screen={fluidsScreen} />
      </div>{/* /intraop-timetable */}

        </>)
        const tabFinish = (<>

      {/* Complications */}
      <ComplicationsSection t={t} control={control} watch={watch} eventLog={eventLog} labResults={(watchedLabResults ?? []) as never} onDeleteEvent={onEventOps ? removeEvent : undefined} eventLogScreen={eventLogScreen} />

        </>)
        if (layoutMode === "sidebar") return (
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-x-6">
            {intraopSidebar}
            <div className="mt-6 min-w-0 space-y-6">
              <div id="intraop-sec-overview" className="scroll-mt-24 space-y-6">{tabOverview}</div>
              <div id="intraop-sec-anaesthesia" className="scroll-mt-24 space-y-6">{tabAnaesthesia}</div>
              <div id="intraop-sec-chart" className="scroll-mt-24 space-y-6">{tabChart}</div>
              <div id="intraop-sec-finish" className="scroll-mt-24 space-y-6">{tabFinish}</div>
            </div>
          </div>
        )
        if (layoutMode === "scroll") return (
          <div className="space-y-6 mt-6">
            {/* The same strip of jump links as the other steps' scrolling pages (10.0.0). */}
            <SectionJumpStrip
              sections={(["overview", "anaesthesia", "chart", "finish"] as const).map(id => ({ id, label: t(`intraop.tabs.${id}`) }))}
              anchorPrefix="intraop-sec-"
              testId="intraop-scroll-strip"
            />
            <div id="intraop-sec-overview" className="scroll-mt-28 space-y-6">{tabOverview}</div>
            <div id="intraop-sec-anaesthesia" className="scroll-mt-28 space-y-6">{tabAnaesthesia}</div>
            <div id="intraop-sec-chart" className="scroll-mt-28 space-y-6">{tabChart}</div>
            <div id="intraop-sec-finish" className="scroll-mt-28 space-y-6">{tabFinish}</div>
          </div>
        )
        return (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col gap-0">
            {/* The same bar as preop and postop (10.0.0). */}
            <StepTabBar
              tabs={(["overview", "anaesthesia", "chart", "finish"] as const).map(value => ({ value, label: t(`intraop.tabs.${value}`) }))}
              active={activeTab as "overview" | "anaesthesia" | "chart" | "finish"}
              onSelect={setActiveTab}
              label={t("case.steps.intraop")}
              testId="intraop-tabs"
            />
            <TabsContent value="overview"    className="space-y-6 p-0 mt-6">{tabOverview}</TabsContent>
            <TabsContent value="anaesthesia" className="space-y-6 p-0 mt-6">{tabAnaesthesia}</TabsContent>
            <TabsContent value="chart"       className="space-y-6 p-0 mt-6">{tabChart}</TabsContent>
            <TabsContent value="finish"      className="space-y-6 p-0 mt-6">{tabFinish}</TabsContent>
          </Tabs>
        )
      })()}

      {/* Sticky footer — always visible across all tabs */}
      <div className="sticky bottom-0 z-20 bg-white dark:bg-[#111] border-t border-slate-200 dark:border-[#2a2a2a] px-4 py-3 flex justify-between items-center gap-3 mt-0">
        <Button type="button" variant="outline" size="lg" className="gap-2" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" /> {t("common.back")}
        </Button>
        <div className="flex items-center gap-3">
          {!!watchedEndTime && formState.isDirty && (
            <Button type="button" size="lg"
              className={`gap-2 transition-colors ${manualSaved ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-600 hover:bg-slate-700"}`}
              onClick={handleManualSave}>
              {manualSaved ? t("intraop.saved") : t("intraop.saveChanges")}
            </Button>
          )}
          <Button type="button" size="lg" className="gap-2 bg-blue-600 hover:bg-blue-700" onClick={handleContinue} data-tour="intraop-submit">
            {t("intraop.continuePostop")} <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Incomplete-sections warning modal */}
      {incompleteItems && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setIncompleteItems(null)}>
          <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-4"
            onClick={e => e.stopPropagation()}>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                {canContinueIncomplete ? t("intraop.incompleteTitle") : t("intraop.requiredMissingTitle")}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {canContinueIncomplete
                  ? t("intraop.incompleteDescription")
                  : t("intraop.requiredMissingDescription")}
              </p>
            </div>
            <ul className="space-y-1">
              {incompleteItems.map(item => (
                <li key={item} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            {canContinueIncomplete && (
              <p className="text-xs text-slate-400">{t("intraop.incompleteOptional")}</p>
            )}
            <div className="flex gap-2 pt-1">
              <button type="button"
                onClick={() => setIncompleteItems(null)}
                className="flex-1 text-sm font-medium px-4 py-2 rounded-lg border border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] transition-colors">
                {t("intraop.goBack")}
              </button>
              {canContinueIncomplete && (
                <button type="button"
                  onClick={() => { setIncompleteItems(null); doSubmit() }}
                  className="flex-1 text-sm font-semibold px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                  {t("intraop.continueAnyway")}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </form>
    </EventSelectorContext.Provider>
  )
}
