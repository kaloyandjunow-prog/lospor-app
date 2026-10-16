"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, FileDown, Printer } from "lucide-react"
import { useLocale } from "next-intl"
import { toast } from "sonner"
import { consentPopulationForAge, preopAgeInYears } from "@lospor/core/preop-documents"
import { printGeneratedDate } from "@/components/case-summary/print-format"
import { ConsentSheet } from "./ConsentSheet"
import { PreopSummarySheet, type PreopSummaryData } from "./PreopSummarySheet"

const TXT = {
  en: {
    back: "Back to the summary", print: "Print", pdf: "Download PDF",
    hint: "Print settings: A4 · portrait · background graphics ON. Patient name and ID stay blank — fill them in by hand.",
    recordFailed: "The print could not be recorded on the case. Print again when you are back online.",
  },
  bg: {
    back: "Към обобщението", print: "Печат", pdf: "Изтегли PDF",
    hint: "Настройки за печат: A4 · портрет · включени фонови графики. Името и ИД на пациента остават празни — попълват се на ръка.",
    recordFailed: "Отпечатването не можа да бъде отбелязано в случая. Отпечатайте отново, когато връзката се възстанови.",
  },
}

/**
 * The preop summary (page one) and, when the hospital has switched it on,
 * the written consent after it, as A4 portrait paper. Printing the consent
 * records which text was on the sheet (version and fingerprint). Headless
 * Chrome renders this page for the PDF with a print token and records
 * nothing: the button that asked for the PDF already did.
 */
export function PreopSummaryPrintClient({ caseId, data, printToken, pdfMode }: {
  caseId: string
  data: PreopSummaryData
  printToken?: string
  pdfMode?: boolean
}) {
  const locale = useLocale()
  const T = locale === "bg" ? TXT.bg : TXT.en
  const [printedAt] = useState(() => new Date())

  useEffect(() => {
    const root = document.documentElement
    const hadDark = root.classList.contains("dark")
    root.classList.remove("dark")
    return () => { if (hadDark) root.classList.add("dark") }
  }, [])

  const documents = data.preopDocuments
  const ageYears = preopAgeInYears(data.preop)
  const template = documents?.consentEnabled && documents.templates
    ? documents.templates[consentPopulationForAge(ageYears)]
    : null
  const p = data.preop
  const consentValues = useMemo(() => ({
    hospital: [data.institution?.name, data.institution?.city].filter(Boolean).join(", ") || null,
    diagnosis: p?.diagnosis ?? null,
    procedure: p?.plannedProcedure ?? null,
    date: printGeneratedDate(printedAt, locale, data.intraop?.timezone ?? null),
    anaesthetist: data.createdBy ? [data.createdBy.title, data.createdBy.name].filter(Boolean).join(" ") : null,
  }), [data, p, printedAt, locale])

  async function recordPrint(): Promise<void> {
    if (!template || printToken) return
    const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/consent-prints`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ population: template.population, version: template.version, sha256: template.sha256 }),
    }).catch(() => null)
    if (!response?.ok) toast.error(T.recordFailed)
  }

  const pdfHref = `/api/cases/${caseId}/pdf?doc=preop-summary&lang=${locale === "bg" ? "bg" : "en"}${printToken ? `&print_token=${printToken}` : ""}`

  // Server-rendered with its data: ready for headless Chrome as soon as it loads.
  return (
    <div className="preop-print-shell min-h-screen bg-slate-100 px-3 py-4" data-preop-summary-ready="">
      <style>{`
        :root { color-scheme: only light; }
        @page { size: A4 portrait; margin: 12mm 13mm 14mm; }
        @media print {
          .preop-print-shell { padding: 0 !important; background: #ffffff !important; min-height: 0 !important; }
          .preop-print-chrome { display: none !important; }
          .preop-paper { box-shadow: none !important; border: 0 !important; padding: 0 !important; margin: 0 !important; width: auto !important; min-height: 0 !important; }
          .preop-summary-page { min-height: 268mm; }
          .consent-pages { break-before: page; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      <div className="max-w-[820px] mx-auto">
        {!pdfMode ? (
          <div className="preop-print-chrome flex flex-wrap items-center gap-2 mb-3">
            <Link href={`/cases/${caseId}/preop-summary`} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
              <ArrowLeft className="h-4 w-4" /> {T.back}
            </Link>
            <div className="ml-auto flex gap-2">
              <a href={pdfHref} onClick={() => { void recordPrint() }} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700" data-testid="preop-summary-pdf">
                <FileDown className="h-4 w-4" /> {T.pdf}
              </a>
              <button type="button" onClick={() => { void recordPrint().finally(() => window.print()) }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" data-testid="preop-summary-print">
                <Printer className="h-4 w-4" /> {T.print}
              </button>
            </div>
            <p className="w-full text-xs text-slate-500">{T.hint}</p>
          </div>
        ) : null}
        <div className="preop-paper bg-white shadow-sm border border-slate-200 rounded-lg mx-auto w-[210mm] min-h-[297mm] p-[12mm] mb-4">
          <PreopSummarySheet data={data} locale={locale} printedAt={printedAt} />
        </div>
        {template ? (
          <div className="preop-paper bg-white shadow-sm border border-slate-200 rounded-lg mx-auto w-[210mm] min-h-[297mm] p-[12mm]">
            <ConsentSheet template={template} values={consentValues} ageYears={ageYears} locale={locale} caseCode={data.caseCode} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
