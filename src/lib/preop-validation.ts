import { validateClinicalModeAge } from "@lospor/core/pediatric"

import type { PreopData } from "@/components/forms/preopSchema"

/**
 * Which required preoperative fields are still missing.
 *
 * Returns field names rather than messages: the form decides how to say it and
 * in which language, and this decides what is incomplete. Out of the component
 * because it is a clinical rule about what a preoperative assessment must
 * contain, and because a rule buried in a 1,200-line form is a rule nobody can
 * check.
 *
 * `vitalsUTO` and `airwayUTO` are the unobtainable markers. A vital somebody
 * documented as unobtainable is answered, not missing — that distinction is
 * the whole reason those markers exist, and dropping it here would demand a
 * number nobody can produce.
 */
export function missingPreopFields(
  data: PreopData,
  vitalsUTO: Set<string>,
  airwayUTO: boolean,
): string[] {
  const errs: string[] = []
  if (data.clinicalMode === "PEDIATRIC") {
    if (data.ageValue == null || !data.ageUnit) {
      errs.push("ageValue")
    } else if (!validateClinicalModeAge("PEDIATRIC", {
      value: data.ageValue,
      unit: data.ageUnit,
    }).valid) {
      errs.push("ageValue")
    }
  } else if (data.ageYears == null || !validateClinicalModeAge("ADULT", {
    value: data.ageYears,
    unit: "YEARS",
  }).valid) {
    errs.push("ageYears")
  }
  // UNKNOWN is a truthy string, so `!data.sex` would let it through. It means
  // "nobody recorded this yet" and must block submission exactly like a blank.
  if (!data.sex || data.sex === "UNKNOWN") errs.push("sex")
  if (!data.heightCm)             errs.push("heightCm")
  if (!data.weightKg)             errs.push("weightKg")
  if (!data.diagnoses?.length)    errs.push("diagnoses")
  if (!data.procedures?.length)   errs.push("procedures")
  if (!vitalsUTO.has("bp") && (!data.bpSystolic || !data.bpDiastolic)) errs.push("bp")
  if (!vitalsUTO.has("heartRate") && !data.heartRate)                  errs.push("heartRate")
  if (!vitalsUTO.has("respiratoryRate") && !data.respiratoryRate)      errs.push("respiratoryRate")
  if (!airwayUTO && !data.mallampati)  errs.push("airway")
  if (!data.asaScore)                  errs.push("asaScore")
  return errs

  return errs
}
