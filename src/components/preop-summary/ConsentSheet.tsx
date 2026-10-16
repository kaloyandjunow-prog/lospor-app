import {
  CONSENT_SIGNER_LABELS,
  consentSigners,
  parseConsentText,
  type ConsentFieldValues,
  type ConsentInline,
  type ConsentTemplateVersionView,
} from "@lospor/core/preop-documents"
import { preopSummaryLabels } from "./labels"

function Inline({ parts }: { parts: ConsentInline[] }) {
  return <>{parts.map((part, index) => part.bold ? <b key={index}>{part.text}</b> : <span key={index}>{part.text}</span>)}</>
}

/**
 * The written consent, printed after the summary and signed by hand. The
 * text is the hospital's (or the bundled one), printed as written in two
 * columns; the fields it names are filled from the case. Who signs follows
 * the patient's age (Закон за здравето чл. 87), and the anaesthetist always
 * signs. Name and ID stay blank lines: the patient's name is never stored.
 */
export function ConsentSheet({ template, values, ageYears, locale, caseCode }: {
  template: ConsentTemplateVersionView
  values: ConsentFieldValues
  ageYears: number | null
  locale: string
  caseCode?: string | null
}) {
  const L = preopSummaryLabels(locale)
  const roles = CONSENT_SIGNER_LABELS[locale === "bg" ? "bg" : "en"]
  const blocks = parseConsentText(template.body, values)
  const signers = consentSigners(ageYears)
  const parentMaybe = ageYears == null

  return (
    <div className="consent-pages bg-white text-slate-900" data-testid="consent-sheet" data-consent-version={template.version}>
      <header className="border-b-2 border-blue-900 dark:border-blue-500 pb-1.5 mb-2">
        <div className="text-[10px] text-slate-500">{values.hospital}</div>
        <h2 className="text-[15px] font-bold leading-tight">{template.title}</h2>
      </header>

      <div className="grid grid-cols-2 gap-4 text-[10px] text-slate-500 mb-1">
        <div className="flex items-end gap-2 h-[7mm]"><span className="shrink-0">{L.name}</span><span className="flex-1 border-b border-slate-400 dark:border-slate-500" /></div>
        <div className="flex items-end gap-2 h-[7mm]"><span className="shrink-0">{L.id}</span><span className="flex-1 border-b border-slate-400 dark:border-slate-500" /></div>
      </div>
      <div className="text-[10.5px] mb-1"><span className="text-slate-500">{L.plannedProcedure}: </span><b>{values.procedure || "…………………………………………"}</b></div>
      <div className="flex items-end gap-2 text-[10.5px] h-[7mm] mb-2">
        <span className="text-slate-500 shrink-0">{L.plannedAnaesthesia}:</span>
        <span className="flex-1 border-b border-dotted border-slate-400 dark:border-slate-500" />
      </div>

      <div className="consent-body text-[9.5px] leading-[1.38] columns-2 gap-5 text-justify">
        {blocks.map((block, index) => {
          if (block.kind === "heading") return <h4 key={index} className="text-[10.5px] font-bold mt-2 mb-0.5 break-after-avoid"><Inline parts={block.text} /></h4>
          if (block.kind === "list") return (
            <ul key={index} className="list-disc pl-4 mb-1.5">
              {block.items.map((item, itemIndex) => <li key={itemIndex}><Inline parts={item} /></li>)}
            </ul>
          )
          return <p key={index} className="mb-1.5"><Inline parts={block.text} /></p>
        })}
      </div>

      <div className="mt-4 space-y-3 break-inside-avoid" data-testid="consent-signers">
        {signers.map(role => (
          <div key={role} className="grid grid-cols-[48mm_1fr_1fr_28mm] gap-3 items-end text-[10px]">
            <span className="font-semibold">
              {roles[role]}
              {role === "PARENT" && parentMaybe ? <span className="block font-normal text-[9px] text-slate-500">{L.under18}</span> : null}
            </span>
            <span className="border-b border-slate-500 h-[7mm] relative"><span className="absolute -bottom-3.5 left-0 text-[8px] text-slate-400">{L.signerName}</span></span>
            <span className="border-b border-slate-500 h-[7mm] relative"><span className="absolute -bottom-3.5 left-0 text-[8px] text-slate-400">{L.signerSignature}</span></span>
            <span className="border-b border-slate-500 h-[7mm] relative"><span className="absolute -bottom-3.5 left-0 text-[8px] text-slate-400">{L.signerDate}</span></span>
          </div>
        ))}
      </div>

      <footer className="mt-6 pt-1 border-t border-slate-200 text-[8.5px] text-slate-400">
        LOSPOR{caseCode ? ` · ${L.caseLbl} ${caseCode}` : ""} · {L.consentText}: „{template.title}“, {template.version === 0 ? L.bundled : `${L.version} ${template.version}`} · {template.sha256.slice(0, 12)}
      </footer>
    </div>
  )
}
