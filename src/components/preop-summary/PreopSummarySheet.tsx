import type { ReactNode } from "react"
import { displayResearchScore } from "@lospor/core/research-scores"
import { calculateMostellerBsa } from "@lospor/core/pediatric-calculators"
import type { PreopDocumentsResponse, PreopSummaryFinding } from "@lospor/core/preop-documents"
import { displayClinicalCode } from "@/lib/clinical-display"
import type { CaseDetail } from "@/types/case-detail"
import { printGeneratedDate } from "@/components/case-summary/print-format"
import { preopSummaryLabels, type PreopSummaryLabels } from "./labels"

/** The print data the summary reads: the case, who consulted, who has it, what was found. */
export type PreopSummaryData = CaseDetail & {
  createdBy?: { name: string; title?: string | null } | null
  user?: { name: string; title?: string | null } | null
  preopDocuments?: PreopDocumentsResponse | null
  preopFindings?: PreopSummaryFinding[] | null
}

type Tag = { label?: string; code?: string }

function listOfLabels(raw: unknown): Tag[] {
  if (Array.isArray(raw)) return raw.filter((item): item is Tag => !!item && typeof item === "object")
  if (typeof raw !== "string" || !raw.trim()) return []
  const trimmed = raw.trim()
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (Array.isArray(parsed)) return parsed.map(item => {
        const value = item as { label?: unknown; inn?: unknown; name?: unknown; atcCode?: unknown; code?: unknown }
        const label = value.label ?? value.inn ?? value.name
        const code = value.atcCode ?? value.code
        return { label: typeof label === "string" ? label : undefined, code: typeof code === "string" ? code : undefined }
      }).filter(tag => !!tag.label)
    } catch {}
  }
  return [{ label: trimmed }]
}

function personName(person: { name: string; title?: string | null } | null | undefined): string | null {
  if (!person?.name) return null
  return person.title ? `${person.title} ${person.name}` : person.name
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h3 className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-blue-900 dark:text-blue-300 border-b border-blue-100 dark:border-blue-900/60 pb-0.5 mb-1">
        {title}{hint ? <span className="ml-1.5 font-normal normal-case tracking-normal text-slate-400">{hint}</span> : null}
      </h3>
      {children}
    </section>
  )
}

function Line({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex gap-2 text-[10.5px] leading-snug">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  )
}

/** A labelled line to write on: the plan is the anaesthetist's to fill in by hand. */
function PenLine({ label }: { label: string }) {
  return (
    <div className="flex items-end gap-2 text-[10.5px] h-[7mm]">
      <span className="text-slate-500 shrink-0 w-[28mm]">{label}</span>
      <span className="flex-1 border-b border-dotted border-slate-400 dark:border-slate-500" />
    </div>
  )
}

/**
 * Page one of the preop summary (layout B): what the colleague taking the
 * case to theatre needs, on one A4 page. Findings only -- a "no" and a
 * question never asked look the same on paper, so the sheet states neither.
 * Patient name and ID are blank lines for the pen: they are never stored.
 */
export function PreopSummarySheet({ data, locale, printedAt }: { data: PreopSummaryData; locale: string; printedAt: Date }) {
  const L: PreopSummaryLabels = preopSummaryLabels(locale)
  const clinicalLocale = locale === "bg" ? "bg" : "en"
  const p = data.preop
  const inst = data.institution
  const zone = data.intraop?.timezone ?? null

  const ageText = p?.ageValue != null && p.ageUnit
    ? `${p.ageValue} ${p.ageUnit === "YEARS" ? L.years : p.ageUnit === "MONTHS" ? L.months : L.days}`
    : p?.ageYears != null ? `${p.ageYears} ${L.years}` : null
  const bsaResult = p?.heightCm && p?.weightKg ? calculateMostellerBsa({ heightCm: p.heightCm, weightKg: p.weightKg }) : null
  const bsa = bsaResult?.available ? bsaResult.value.squareMetres : null
  const diagnoses = listOfLabels(p?.diagnosesJson).length > 0 ? listOfLabels(p?.diagnosesJson) : listOfLabels(p?.diagnosis)
  const procedures = listOfLabels(p?.proceduresJson).length > 0 ? listOfLabels(p?.proceduresJson) : listOfLabels(p?.plannedProcedure)
  const comorbidities = listOfLabels(p?.comorbidities)
  const medications = listOfLabels(p?.currentMedications)
  const allergyText = listOfLabels(p?.allergyDetails).map(tag => tag.label).join(", ")
  const findings = data.preopFindings ?? []
  const labs = (p?.labResults ?? []).filter(lab => lab?.value)
  const fasting = p?.pediatricFasting ?? []

  const scores: string[] = []
  if (p?.asaScore) scores.push(`ASA ${p.asaScore}${p.emergencySurgery ? "E" : ""}`)
  if (p?.rcriScore != null) scores.push(`RCRI ${displayResearchScore("rcri", p.rcriScore, clinicalLocale)}`)
  if (p?.apfelScore != null) scores.push(`Apfel ${displayResearchScore("apfel", p.apfelScore, clinicalLocale)}`)
  if (p?.stopBangScore != null) scores.push(`STOP-BANG ${displayResearchScore("stopBang", p.stopBangScore, clinicalLocale)}`)
  if (p?.povocScore != null) scores.push(`POVOC ${displayResearchScore("povoc", p.povocScore, clinicalLocale)}`)
  if (p?.coldsScore != null) scores.push(`COLDS ${displayResearchScore("colds", p.coldsScore, clinicalLocale)}`)

  const vitals = [
    p?.bpSystolic && p?.bpDiastolic ? `${L.bp} ${p.bpSystolic}/${p.bpDiastolic}` : null,
    p?.heartRate ? `${L.hr} ${p.heartRate}` : null,
    p?.respiratoryRate ? `${L.rr} ${p.respiratoryRate}` : null,
    p?.spO2 ? `SpO₂ ${p.spO2} %` : null,
    p?.temperature ? `${L.temp} ${p.temperature} °C` : null,
  ].filter(Boolean).join(" · ")

  const consultedAt = p?.updatedAt ? printGeneratedDate(new Date(p.updatedAt), locale, zone) : null
  const consultant = personName(data.createdBy)
  const holder = personName(data.user)
  const handedOn = holder && holder !== consultant

  const findingsByParent = new Map<string | null, PreopSummaryFinding[]>()
  for (const finding of findings) {
    const key = finding.parentKey
    findingsByParent.set(key, [...(findingsByParent.get(key) ?? []), finding])
  }
  const findingText = (finding: PreopSummaryFinding) => {
    const label = finding.label[clinicalLocale]
    return finding.option ? `${label}: ${finding.option[clinicalLocale]}` : label
  }

  return (
    <div className="preop-summary-page bg-white text-slate-900 flex flex-col gap-2.5" data-testid="preop-summary-sheet">
      <header className="flex items-start justify-between gap-3 border-b-2 border-blue-900 dark:border-blue-500 pb-1.5">
        <div className="min-w-0">
          <div className="text-[10px] text-slate-500">{inst?.name}{inst?.city ? ` · ${inst.city}` : ""}</div>
          <h2 className="text-[15px] font-bold leading-tight">{L.title}</h2>
        </div>
        <div className="text-right text-[10px] text-slate-500 shrink-0">
          {data.caseCode ? <div className="font-bold text-slate-800">{L.caseLbl} {data.caseCode}</div> : null}
          {consultedAt ? <div>{consultedAt}</div> : null}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-4 text-[10px] text-slate-500">
        <div className="flex items-end gap-2 h-[7mm]"><span className="shrink-0">{L.name}</span><span className="flex-1 border-b border-slate-400 dark:border-slate-500" /></div>
        <div className="flex items-end gap-2 h-[7mm]"><span className="shrink-0">{L.id}</span><span className="flex-1 border-b border-slate-400 dark:border-slate-500" /></div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10.5px]">
        {ageText ? <Line label={L.age} value={ageText} /> : null}
        {p?.sex === "MALE" || p?.sex === "FEMALE" ? <Line label={L.sex} value={p.sex === "MALE" ? L.male : L.female} /> : null}
        {p?.heightCm ? <Line label={L.height} value={`${p.heightCm} cm`} /> : null}
        {p?.weightKg ? <Line label={L.weight} value={`${p.weightKg} kg`} /> : null}
        {p?.bmi ? <Line label={L.bmi} value={String(Math.round(p.bmi * 10) / 10)} /> : null}
        {bsa ? <Line label={L.bsa} value={`${Math.round(bsa * 100) / 100} m²`} /> : null}
        {p?.bloodType ? <Line label={L.bloodGroup} value={`${p.bloodType}${p.rhFactor === "POSITIVE" ? " Rh+" : p.rhFactor === "NEGATIVE" ? " Rh−" : ""}`} /> : null}
      </div>

      {diagnoses.length > 0 ? <Line label={L.diagnosis} value={diagnoses.map(tag => [tag.code, tag.label].filter(Boolean).join(" ")).join("; ")} /> : null}
      {procedures.length > 0 ? (
        <Line label={L.operation} value={[
          procedures.map(tag => tag.label).join("; "),
          p?.emergencySurgery ? L.emergency : p?.elective ? L.elective : null,
          p?.highRiskSurgery ? L.highRisk : null,
        ].filter(Boolean).join(" · ")} />
      ) : null}

      {p?.allergies || p?.latexAllergy ? (
        <div className="border-2 border-red-600 dark:border-red-500 rounded px-2 py-1 text-[11px] font-bold text-red-700 dark:text-red-400" data-testid="preop-summary-allergy">
          {L.allergy}: {[allergyText, p?.latexAllergy ? L.latex : null].filter(Boolean).join(" · ")}
        </div>
      ) : p?.allergies === false ? <p className="text-[10px] text-slate-500">{L.nkda}</p> : null}

      <div className="grid grid-cols-2 gap-x-5 gap-y-2.5">
        {findings.length > 0 || comorbidities.length > 0 ? (
          <Section title={L.findings} hint={L.findingsHint}>
            <ul className="text-[10.5px] leading-snug space-y-0.5" data-testid="preop-summary-findings">
              {comorbidities.map((tag, index) => <li key={`c-${index}`}>{[tag.label, tag.code ? `(${tag.code})` : null].filter(Boolean).join(" ")}</li>)}
              {(findingsByParent.get(null) ?? []).map(finding => (
                <li key={finding.stableKey}>
                  {findingText(finding)}
                  {(findingsByParent.get(finding.stableKey) ?? []).map(child => (
                    <div key={child.stableKey} className="pl-3 text-slate-600">– {findingText(child)}</div>
                  ))}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {medications.length > 0 ? (
          <Section title={L.medications}>
            <ul className="text-[10.5px] leading-snug space-y-0.5">
              {medications.map((tag, index) => <li key={index}>{tag.label}{tag.code ? <span className="text-slate-400"> ({tag.code})</span> : null}</li>)}
            </ul>
          </Section>
        ) : null}

        {vitals ? (
          <Section title={L.exam}><p className="text-[10.5px]">{vitals}</p></Section>
        ) : null}

        {p?.mallampati || p?.mouthOpeningCm || p?.thyromental || p?.neckMobility || p?.upperLipBiteTest || p?.difficultAirwayHistory === true || p?.anticipatedDifficultAirway === true ? (
        <Section title={L.airway}>
          <div className="space-y-0.5">
            {p?.mallampati ? <Line label="Mallampati" value={displayClinicalCode("option:MALLAMPATI", p.mallampati, locale)} /> : null}
            {p?.mouthOpeningCm ? <Line label={L.mouthOpening} value={`${p.mouthOpeningCm} cm`} /> : null}
            {p?.thyromental ? <Line label={L.thyromental} value={`${p.thyromental} cm`} /> : null}
            {p?.neckMobility ? <Line label={L.neck} value={displayClinicalCode("option:NECK_MOBILITY", p.neckMobility, locale)} /> : null}
            {p?.upperLipBiteTest ? <Line label={L.ulbt} value={displayClinicalCode("option:UPPER_LIP_BITE", p.upperLipBiteTest, locale)} /> : null}
            {p?.difficultAirwayHistory === true ? <p className="text-[10.5px] font-semibold text-red-700 dark:text-red-400">{L.difficultAirway}{p.difficultAirwayNotes ? `: ${p.difficultAirwayNotes}` : ""}</p> : null}
            {p?.anticipatedDifficultAirway === true ? <p className="text-[10.5px] font-semibold text-red-700 dark:text-red-400">{L.anticipatedDifficultAirway}</p> : null}
          </div>
        </Section>
        ) : null}

        {scores.length > 0 ? (
          <Section title={L.scores}>
            <ul className="text-[10.5px] leading-snug space-y-0.5" data-testid="preop-summary-scores">{scores.map(score => <li key={score}>{score}</li>)}</ul>
          </Section>
        ) : null}

        {labs.length > 0 ? (
          <Section title={L.labs}>
            <div className="grid grid-cols-2 gap-x-3 text-[10.5px] leading-snug">
              {labs.slice(0, 16).map((lab, index) => <div key={index}>{lab.test} <b>{lab.value}</b>{lab.unit ? ` ${lab.unit}` : ""}</div>)}
            </div>
          </Section>
        ) : null}

        {fasting.length > 0 ? (
          <Section title={L.npo}>
            <ul className="text-[10.5px] leading-snug space-y-0.5">
              {fasting.map(row => (
                <li key={row.category}>{L.fastingCategories[row.category] ?? row.category}: {L.npoHours.replace("{hours}", String(row.hoursBefore))}</li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>

      <Section title={L.plan}>
        <PenLine label={L.planAnaesthesia} />
        <PenLine label={L.planFasting} />
        <PenLine label={L.planMedications} />
        <PenLine label={L.planProphylaxis} />
        <PenLine label={L.conclusion} />
      </Section>

      <footer className="mt-auto pt-2 border-t border-slate-300 text-[10.5px] space-y-1.5">
        <div className="flex items-end gap-3">
          <span className="text-slate-500">{L.consultedBy}:</span>
          <span className="font-semibold">{consultant ?? ""}</span>
          {consultedAt ? <span className="text-slate-500">{consultedAt}</span> : null}
          <span className="ml-auto text-slate-500">{L.signature}</span>
          <span className="w-[40mm] border-b border-slate-400 dark:border-slate-500" />
        </div>
        <div className="flex items-end gap-3">
          <span className="text-slate-500">{L.handedTo}:</span>
          {handedOn ? <span className="font-semibold">{holder}</span> : <span className="flex-1 border-b border-dotted border-slate-400 dark:border-slate-500 h-[5mm]" />}
        </div>
        <div className="text-[9px] text-slate-400">LOSPOR{data.caseCode ? ` · ${L.caseLbl} ${data.caseCode}` : ""} · {L.printed} {printGeneratedDate(printedAt, locale, zone)}</div>
      </footer>
    </div>
  )
}
