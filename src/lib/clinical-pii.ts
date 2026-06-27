import { checkPII } from "@/lib/pii-check"

type Labelled = { label?: unknown; name?: unknown; term?: unknown }

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null
}

function labelList(items: unknown): string | null {
  if (!Array.isArray(items)) return text(items)
  const labels = items
    .map((item: Labelled) => text(item?.label) ?? text(item?.name) ?? text(item?.term))
    .filter((v): v is string => Boolean(v))
  return labels.length ? labels.join("; ") : null
}

export function checkClinicalPayloadPII(payload: {
  preop?: Record<string, unknown>
  intraop?: Record<string, unknown>
  postop?: Record<string, unknown>
  notes?: unknown
}): string | null {
  const preop = payload.preop ?? {}
  const intraop = payload.intraop ?? {}
  const postop = payload.postop ?? {}

  return checkPII(
    {
      notes: text(payload.notes),
      teamNotes: text(preop.teamNotes),
      allergyDetails: labelList(preop.allergyDetails),
      currentMedications: labelList(preop.currentMedications),
      familyAnesthesiaDetails: text(preop.familyAnesthesiaDetails),
      difficultAirwayNotes: text(preop.difficultAirwayNotes),
      physicalExamReport: text(preop.physicalExamReport),
      preopNotes: text(preop.notes),
      premedicationEvening: text(intraop.premedicationEvening),
      premedicationMorning: text(intraop.premedicationMorning),
      airwayNotes: text(intraop.airwayNotes),
      bloodProductsNote: text(intraop.bloodProductsNote),
      intraopComplications: text(intraop.complications),
      postopComplications: text(postop.complications),
      dispositionNotes: text(postop.dispositionNotes),
    },
    { skipNameCheck: new Set(["allergyDetails", "currentMedications"]) },
  )
}

export function checkEventPII(ev: Record<string, unknown>): string | null {
  return checkPII({
    notes: text(ev.notes),
    note: text(ev.note),
    comment: text(ev.comment),
    description: text(ev.description),
    complicationNote: text(ev.complicationNote),
    customText: text(ev.customText),
  })
}
