import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FilePlus, FileText, Activity, Users, UserCheck } from "lucide-react"
import { ShareCaseButton } from "@/components/ShareCaseButton"
import { DeleteDraftButton } from "@/components/DeleteDraftButton"
import { HandoverButton } from "@/components/HandoverButton"
import { PendingHandovers } from "@/components/PendingHandovers"
import { format } from "date-fns"
import { getTranslations } from "next-intl/server"

function dispositionBadge(d: string | null) {
  if (!d) return null
  const map: Record<string, string> = { WARD: "bg-green-100 text-green-800", PACU: "bg-amber-100 text-amber-800", ICU: "bg-red-100 text-red-800" }
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[d] ?? ""}`}>{d}</span>
}

function asaBadge(asa: string | null) {
  if (!asa) return null
  const map: Record<string, string> = { I: "bg-green-100 text-green-800", II: "bg-blue-100 text-blue-800", III: "bg-amber-100 text-amber-800", IV: "bg-red-100 text-red-800", V: "bg-red-200 text-red-900", VI: "bg-slate-200 text-slate-700" }
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[asa] ?? ""}`}>ASA {asa}</span>
}

type CaseRow = Awaited<ReturnType<typeof fetchCases>>[number]

async function fetchCases(userId: string, role: string, institutionId: string) {
  const where =
    role === "ADMIN"        ? {}
    : role === "HEAD_OF_DEPT" ? { institutionId }
    : { userId }

  return prisma.case.findMany({
    where,
    include: {
      preop:       { select: { diagnosis: true, plannedProcedure: true, ageYears: true, sex: true, asaScore: true } },
      intraop:     { select: { date: true, endTime: true } },
      postop:      { select: { disposition: true, aldreteTotal: true } },
      user:        { select: { name: true } },
      institution: { select: { name: true } },
      transfers:   { where: { status: "PENDING" }, select: { id: true }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  })
}

function computeStatus(c: CaseRow): { label: string; cls: string } {
  // Fully completed
  if (c.status === "COMPLETE") {
    return { label: "Case finished", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" }
  }

  // Intraop ended — awaiting post-op documentation
  if (c.intraop?.endTime != null) {
    return { label: "Awaiting post-op", cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" }
  }

  // Intraop record exists — procedure in progress
  if (c.intraop != null) {
    return { label: "In theatre", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" }
  }

  // Preop is substantively complete (diagnosis + procedure + ASA set)
  const preopComplete = !!(c.preop?.diagnosis && c.preop?.plannedProcedure && c.preop?.asaScore)
  if (preopComplete) {
    return { label: "Awaiting allocation", cls: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300" }
  }

  // Preop record exists with at least a diagnosis entered
  if (c.preop?.diagnosis) {
    return { label: "In consultation", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" }
  }

  // Case created but nothing meaningful entered yet
  return { label: "Draft", cls: "bg-slate-100 text-slate-500 dark:bg-slate-700/50 dark:text-slate-400" }
}

export default async function DashboardPage() {
  const session = await auth()
  if (!session) return null
  const t = await getTranslations()

  const role          = (session.user as any).role ?? "MEMBER"
  const institutionId = (session.user as any).institutionId ?? ""
  const userId        = session.user!.id
  const cases = await fetchCases(userId, role, institutionId)

  const totalCases = cases.length
  const thisMonth = cases.filter((c: CaseRow) => {
    const d = c.intraop?.date ?? c.createdAt
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length

  const icuCount = cases.filter((c: CaseRow) => c.postop?.disposition === "ICU").length
  const asaDist = cases.reduce<Record<string, number>>((acc: Record<string, number>, c: CaseRow) => {
    const a = c.preop?.asaScore ?? "Unknown"
    acc[a] = (acc[a] ?? 0) + 1
    return acc
  }, {})
  void asaDist

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{t("dashboard.title")}</h1>
        <p className="text-slate-500 text-sm mt-1">{t("dashboard.welcome")}, {session.user?.name}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" data-tour="dashboard-stats">
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-3xl font-bold text-slate-800">{totalCases}</p>
              <p className="text-sm text-slate-500">{t("dashboard.totalCases")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
              <Activity className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-3xl font-bold text-slate-800">{thisMonth}</p>
              <p className="text-sm text-slate-500">{t("dashboard.thisMonth")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
              <Users className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <p className="text-3xl font-bold text-slate-800">{icuCount}</p>
              <p className="text-sm text-slate-500">{t("dashboard.icuAdmissions")}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending incoming handovers */}
      <PendingHandovers />

      {/* Case list */}
      <Card data-tour="case-list">
        <CardHeader>
          <CardTitle className="text-base">{t("dashboard.recentCases")}</CardTitle>
        </CardHeader>
        <CardContent>
          {cases.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">{t("dashboard.noCases")}</p>
              <p className="text-sm mt-1">{t("dashboard.noCasesDesc")}</p>
              <Link href="/cases/new" className="mt-4 inline-block">
                <Button size="sm" className="gap-2 mt-4">
                  <FilePlus className="h-4 w-4" /> {t("dashboard.newCase")}
                </Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-[#2a2a2a]">
              {cases.map((c: CaseRow) => {
                const { label, cls } = computeStatus(c)
                const isComplete = c.status === "COMPLETE"
                const href = isComplete ? `/cases/${c.id}` : `/cases/new?continue=${c.id}`
                return (
                  <Link key={c.id} href={href} className="flex items-center justify-between py-3 px-2 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] rounded-lg transition-colors group">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-800 dark:text-slate-100 truncate">
                          {c.preop?.plannedProcedure || "Untitled case"}
                        </p>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${cls}`}>
                          {label}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500 truncate mt-0.5">
                        {c.preop?.diagnosis ?? "—"} · {c.preop?.ageYears ? `${c.preop.ageYears}y` : ""} {c.preop?.sex === "MALE" ? "M" : c.preop?.sex === "FEMALE" ? "F" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-4 shrink-0">
                      {asaBadge(c.preop?.asaScore ?? null)}
                      {dispositionBadge(c.postop?.disposition ?? null)}
                      {c.caseCode && (
                        <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-[#2a2a2a] px-1.5 py-0.5 rounded">
                          {c.caseCode}
                        </span>
                      )}
                      {!isComplete && <DeleteDraftButton caseId={c.id} />}
                      <ShareCaseButton caseId={c.id} />
                      <HandoverButton
                        caseId={c.id}
                        caseOwnerId={c.userId}
                        sessionUserId={userId}
                        sessionRole={role}
                        hasPendingTransfer={c.transfers.length > 0}
                      />
                      <span className="text-xs text-slate-400">
                        {c.intraop?.date ? format(new Date(c.intraop.date), "dd MMM yyyy") : format(c.createdAt, "dd MMM yyyy")}
                      </span>
                      <FileText className="h-4 w-4 text-slate-300" />
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
