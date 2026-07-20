import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { LiveCaseUpdater } from "@/components/LiveCaseUpdater"
import { notFound, redirect } from "next/navigation"
import { CaseSummary } from "@/components/CaseSummary"
import { CaseMeta } from "@/components/CaseMeta"
import { format } from "date-fns"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default async function CasePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Handle legacy browser URLs where the new-case page used path-encoded IDs
  // instead of query params. Redirect to the actual case summary.
  if (id.startsWith("new-continue=")) {
    const realId = id.slice("new-continue=".length).split("&")[0]
    redirect(`/cases/${realId}`)
  }

  // Printing moved to /cases/[id]/print (which also handles the mobile
  // print-token flow) — this page is the live summary and needs a session.
  const session = await auth()
  if (!session) redirect(`/login?callbackUrl=/cases/${id}`)
  const me  = session.user
  const userId = me.id
  const role   = me.role
  const institutionId: string | null = me.institutionId ?? null

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

  return (
    <>
      {/* Header — constrained width */}
      <div className="max-w-4xl mx-auto mb-6">
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

      {/* Live case summary (printing lives on /cases/[id]/print) */}
      <CaseSummary caseId={id} mode="summary" />
    </>
  )
}
