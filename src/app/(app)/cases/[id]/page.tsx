import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
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

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return null

  const { id } = await params
  const me     = session.user as any
  const role   = me.role
  const userId = me.id

  // ADMIN: any case. HOD: cases within their institution. MEMBER: own cases only.
  const where = role === "ADMIN"
    ? { id }
    : role === "HEAD_OF_DEPT"
      ? { id, user: { institutionId: me.institutionId } }
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
      {/* Header — constrained width, screen only */}
      <div className="no-print max-w-4xl mx-auto mb-6">
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

      {/* Case summary — rendered OUTSIDE the max-width container so print CSS can make it full-width */}
      <CaseSummary caseId={id} />
    </>
  )
}
