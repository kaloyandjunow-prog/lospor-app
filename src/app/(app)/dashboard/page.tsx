import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FilePlus, FileText, Activity, Users, UserCheck } from "lucide-react"
import { DeleteDraftButton } from "@/components/DeleteDraftButton"
import { HandoverButton } from "@/components/HandoverButton"
import { PendingHandovers } from "@/components/PendingHandovers"
import { format } from "date-fns"
import { getTranslations } from "next-intl/server"
import type React from "react"

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
type DashboardScope = "all" | "today" | "month" | "active" | "drafts" | "awaiting-postop" | "complete" | "handovers" | "icu"

async function fetchCases(userId: string, role: string, institutionId: string | null) {
  const where =
    role === "ADMIN" || role === "HEAD_OF_DEPT" ? {}
    : { userId }

  return prisma.case.findMany({
    where,
    include: {
      preop:     { select: { diagnosis: true, plannedProcedure: true, ageYears: true, sex: true, asaScore: true } },
      intraop:   { select: { monthYear: true, durationMinutes: true, endTime: true } },
      postop:    { select: { disposition: true, aldreteTotal: true } },
      user:      { select: { name: true } },
      transfers: { where: { status: "PENDING" }, select: { id: true }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  })
}

type StatusKey = "finished" | "awaitingPostop" | "inTheatre" | "awaitingAllocation" | "inConsultation" | "draft"

function computeStatus(c: CaseRow): { key: StatusKey; cls: string } {
  if (c.status === "COMPLETE") {
    return { key: "finished",           cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" }
  }
  if (c.intraop?.endTime != null) {
    return { key: "awaitingPostop",     cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" }
  }
  if (c.intraop != null) {
    return { key: "inTheatre",          cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" }
  }
  const preopComplete = !!(c.preop?.diagnosis && c.preop?.plannedProcedure && c.preop?.asaScore)
  if (preopComplete) {
    return { key: "awaitingAllocation", cls: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300" }
  }
  if (c.preop?.diagnosis) {
    return { key: "inConsultation",     cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" }
  }
  return   { key: "draft",             cls: "bg-slate-100 text-slate-500 dark:bg-slate-700/50 dark:text-slate-400" }
}

function isToday(date: Date) {
  const now = new Date()
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
}

function isThisMonthCase(c: CaseRow) {
  const now = new Date()
  const my = c.intraop?.monthYear
  if (my) {
    const [y, m] = my.split("-").map(Number)
    return y === now.getFullYear() && m === now.getMonth() + 1
  }
  return c.createdAt.getMonth() === now.getMonth() && c.createdAt.getFullYear() === now.getFullYear()
}

function scopeHref(scope: DashboardScope) {
  return scope === "all" ? "/dashboard" : `/dashboard?scope=${scope}`
}

function StatCard({
  href,
  active,
  icon,
  value,
  label,
}: {
  href: string
  active: boolean
  icon: React.ReactNode
  value: number
  label: string
}) {
  return (
    <Link href={href} className="block">
      <Card className={active ? "ring-2 ring-blue-500/70 dark:ring-blue-400/70" : ""}>
        <CardContent className="pt-6 flex items-center gap-4">
          {icon}
          <div>
            <p className="text-3xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
            <p className="text-sm text-slate-500">{label}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

export default async function DashboardPage({ searchParams }: { searchParams?: Promise<{ scope?: string }> }) {
  const session = await auth()
  if (!session) return null
  const t = await getTranslations()
  const params = await searchParams
  const requestedScope = params?.scope
  const scope: DashboardScope = requestedScope === "today" || requestedScope === "month" || requestedScope === "active" || requestedScope === "drafts" || requestedScope === "awaiting-postop" || requestedScope === "complete" || requestedScope === "handovers" || requestedScope === "icu"
    ? requestedScope
    : "all"

  const role          = (session.user as any).role ?? "MEMBER"
  const institutionId = (session.user as any).institutionId ?? ""
  const userId        = session.user!.id
  const cases = await fetchCases(userId, role, institutionId)

  const totalCases = cases.length
  const todayCases = cases.filter((c: CaseRow) => isToday(c.createdAt))
  const thisMonth = cases.filter(isThisMonthCase).length
  const icuCount = cases.filter((c: CaseRow) => c.postop?.disposition === "ICU").length
  const activeCount = cases.filter((c: CaseRow) => c.status !== "COMPLETE").length
  const draftCount = cases.filter((c: CaseRow) => c.status === "DRAFT").length
  const awaitingPostopCount = cases.filter((c: CaseRow) => c.status !== "COMPLETE" && c.intraop?.endTime != null).length
  const completeCount = cases.filter((c: CaseRow) => c.status === "COMPLETE").length
  const handoverCount = cases.filter((c: CaseRow) => c.transfers.length > 0).length
  const filteredCases = cases.filter((c: CaseRow) => {
    if (scope === "all") return true
    if (scope === "today") return isToday(c.createdAt)
    if (scope === "month") return isThisMonthCase(c)
    if (scope === "active") return c.status !== "COMPLETE"
    if (scope === "drafts") return c.status === "DRAFT"
    if (scope === "awaiting-postop") return c.status !== "COMPLETE" && c.intraop?.endTime != null
    if (scope === "complete") return c.status === "COMPLETE"
    if (scope === "handovers") return c.transfers.length > 0
    if (scope === "icu") return c.postop?.disposition === "ICU"
    return true
  })
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
        <StatCard
          href={scopeHref("all")}
          active={scope === "all"}
          icon={
            <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
          }
          value={totalCases}
          label={t("dashboard.totalCases")}
        />
        <StatCard
          href={scopeHref("month")}
          active={scope === "month"}
          icon={
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
              <Activity className="h-6 w-6 text-green-600" />
            </div>
          }
          value={thisMonth}
          label={t("dashboard.thisMonth")}
        />
        <StatCard
          href={scopeHref("icu")}
          active={scope === "icu"}
          icon={
            <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
              <Users className="h-6 w-6 text-red-600" />
            </div>
          }
          value={icuCount}
          label={t("dashboard.icuAdmissions")}
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          ["all", "All", totalCases],
          ["today", "Today", todayCases.length],
          ["month", "Month", thisMonth],
          ["active", "Active", activeCount],
          ["drafts", "Drafts", draftCount],
          ["awaiting-postop", "Awaiting postop", awaitingPostopCount],
          ["complete", "Complete", completeCount],
          ["handovers", "Handovers", handoverCount],
        ].map(([key, label, count]) => (
          <Link
            key={key}
            href={scopeHref(key as DashboardScope)}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
              scope === key
                ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
            }`}
          >
            {label} <span className="tabular-nums">{count}</span>
          </Link>
        ))}
      </div>

      {/* Pending incoming handovers */}
      <PendingHandovers />

      {/* Case list */}
      <Card data-tour="case-list">
        <CardHeader>
          <CardTitle className="text-base">{t("dashboard.recentCases")}</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredCases.length === 0 ? (
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
              {filteredCases.map((c: CaseRow) => {
                const { key, cls } = computeStatus(c)
                const isComplete = c.status === "COMPLETE"
                const href = isComplete ? `/cases/${c.id}` : `/cases/new?continue=${c.id}`
                return (
                  <Link key={c.id} href={href} className="flex items-center justify-between py-3 px-2 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] rounded-lg transition-colors group">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-800 dark:text-slate-100 truncate">
                          {c.preop?.plannedProcedure || t("status.untitled")}
                        </p>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${cls}`}>
                          {t(`status.${key}`)}
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
                      <HandoverButton
                        caseId={c.id}
                        caseOwnerId={c.userId}
                        sessionUserId={userId}
                        sessionRole={role}
                        hasPendingTransfer={c.transfers.length > 0}
                      />
                      <span className="text-xs text-slate-400">
                        {c.intraop?.monthYear
                          ? (() => { const [y, m] = c.intraop!.monthYear!.split("-"); const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; return `${months[parseInt(m,10)-1]} ${y}` })()
                          : format(c.createdAt, "dd MMM yyyy")}
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
