import { auth } from "@/lib/auth"
import { jwtVerify } from "jose"
import { prisma } from "@/lib/prisma"
import { LiveCaseUpdater } from "@/components/LiveCaseUpdater"
import { notFound } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { CaseSummary } from "@/components/CaseSummary"
import { CaseMeta } from "@/components/CaseMeta"
import { format } from "date-fns"
import { apfelRiskLabel, rcriRiskLabel, stopBangRiskLabel } from "@/lib/scores"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

function secret() {
  return new TextEncoder().encode(process.env.NEXTAUTH_SECRET!)
}

// Verify a short-lived print token issued by POST /api/cases/:id/print-token.
// Returns the userId from the token if valid, null otherwise.
async function verifyPrintToken(token: string, caseId: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    if (payload.type !== "print") return null
    if (payload.caseId !== caseId) return null
    return (payload.userId as string) ?? null
  } catch {
    return null
  }
}

function Row({ label, value }: { label: string; value?: string | number | boolean | null }) {
  if (value === null || value === undefined || value === "") return null
  const display = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-sm text-slate-500 shrink-0">{label}</span>
      <span className="text-sm text-slate-800 text-right font-medium">{display}</span>
    </div>
  )
}

function YesRow({ label, value }: { label: string; value?: boolean | null }) {
  if (!value) return null
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full mr-1 mb-1">
      {label}
    </span>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-600 uppercase tracking-wide">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export default async function CasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ print_token?: string }>
}) {
  const { id } = await params
  const sp     = await searchParams

  // ── Auth path 1: short-lived print token (mobile "Print PDF" flow) ─────────
  // If a valid print_token is in the query string, bypass the web session check
  // so the user can print directly from their phone browser without logging in.
  const printToken   = sp?.print_token
  const printUserId  = printToken ? await verifyPrintToken(printToken, id) : null
  const isPrintMode  = !!printUserId

  // ── Auth path 2: normal web session ───────────────────────────────────────
  let userId: string
  let role:   string
  let institutionId: string | null = null

  if (isPrintMode) {
    userId = printUserId!
    role   = "MEMBER"  // print tokens are always member-scoped to the case owner
  } else {
    const session = await auth()
    if (!session) return null
    const me  = session.user as any
    userId    = me.id
    role      = me.role
    institutionId = me.institutionId ?? null
  }

  // ADMIN: any case. HOD: cases within their institution. MEMBER: own cases only.
  const where = role === "ADMIN"
    ? { id }
    : role === "HEAD_OF_DEPT" && institutionId
      ? { id, user: { institutionId } }
      : { id, userId }

  const record = await prisma.case.findFirst({
    where,
    include: { preop: true, intraop: true, postop: true, user: { include: { institution: true } } },
  })

  if (!record) notFound()

  const p = record.preop
  const i = record.intraop
  const o = record.postop

  return (
    <>
      {/* Auto-trigger print dialog when opened via a print token from mobile */}
      {isPrintMode && (
        <script
          dangerouslySetInnerHTML={{
            __html: `if (typeof window !== "undefined") { window.addEventListener("load", function(){ setTimeout(function(){ window.print() }, 800) }) }`,
          }}
        />
      )}

      {/* Header — constrained width, screen only */}
      <div className={`no-print max-w-4xl mx-auto mb-6 ${isPrintMode ? "hidden" : ""}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" className="gap-1 mb-2 -ml-2 text-slate-500">
                <ArrowLeft className="h-4 w-4" /> Dashboard
              </Button>
            </Link>
            <h1 className="text-xl font-bold text-slate-800">{p?.plannedProcedure ?? "Anaesthesia case"}</h1>
            <p className="text-slate-500 text-sm mt-1">
              {p?.diagnosis} · {p?.ageYears}y {p?.sex === "MALE" ? "M" : p?.sex === "FEMALE" ? "F" : ""} ·{" "}
              {i?.monthYear
                ? (() => { const [y, m] = i.monthYear!.split("-"); const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; return `${months[parseInt(m,10)-1]} ${y}` })()
                : format(record.createdAt, "dd MMM yyyy")}{" "}
              {record.user.institution ? `· ${record.user.institution.name}` : ""}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {record.caseCode && (
              <CaseMeta caseId={id} caseCode={record.caseCode} initialNotes={record.notes} />
            )}
          </div>
        </div>
      </div>

      {/* Live sync — receives SSE events from mobile and refreshes the page */}
      <LiveCaseUpdater caseId={id} />

      {/* Case summary — rendered OUTSIDE the max-width container so print CSS can make it full-width */}
      <CaseSummary caseId={id} />
    </>
  )
}
