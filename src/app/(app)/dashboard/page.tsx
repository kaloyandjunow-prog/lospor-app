import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FilePlus, FileText, Activity, Users } from "lucide-react"
import { PendingHandovers } from "@/components/PendingHandovers"
import { DashboardSearch } from "@/components/DashboardSearch"
import { getTranslations } from "next-intl/server"
import type React from "react"

type CaseRow = Awaited<ReturnType<typeof fetchCases>>[number]
type DashboardScope = "all" | "today" | "month" | "active" | "drafts" | "awaiting-postop" | "complete" | "handovers" | "icu"

const CASE_INCLUDE = {
  preop:     { select: { diagnosis: true, plannedProcedure: true, ageYears: true, sex: true, asaScore: true } },
  intraop:   { select: { monthYear: true, durationMinutes: true, endTime: true } },
  postop:    { select: { disposition: true, aldreteTotal: true } },
  user:      { select: { name: true } },
  transfers: { where: { status: "PENDING" as const }, select: { id: true }, take: 1 },
} as const

function baseWhere(userId: string, role: string) {
  return role === "ADMIN" || role === "HEAD_OF_DEPT" ? {} : { userId }
}

// Full fetch (max 200) — used to derive stat counts for all scope chips
async function fetchCases(userId: string, role: string) {
  return prisma.case.findMany({
    where: baseWhere(userId, role),
    include: CASE_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: 200,
  })
}

// Scoped fetch — pushes non-"all" filters into the DB query so only relevant
// rows are loaded when a specific scope tab is selected.
async function fetchScopedCases(userId: string, role: string, scope: string, now: Date) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const scopeWhere: Record<string, unknown> =
    scope === "drafts"          ? { status: "DRAFT" }
    : scope === "active"        ? { status: { not: "COMPLETE" } }
    : scope === "complete"      ? { status: "COMPLETE" }
    : scope === "today"         ? { createdAt: { gte: startOfToday } }
    : scope === "month"         ? { createdAt: { gte: startOfMonth } }
    : {}
  return prisma.case.findMany({
    where: { ...baseWhere(userId, role), ...scopeWhere },
    include: CASE_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: 200,
  })
}

function isToday(date: Date, now: Date) {
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
}

function isThisMonthCase(c: CaseRow, now: Date) {
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
  const userId        = session.user!.id
  const now           = new Date()

  // Fetch full list for stat counts + scoped list for display in parallel
  const [cases, scopedCases] = await Promise.all([
    fetchCases(userId, role),
    scope !== "all" ? fetchScopedCases(userId, role, scope, now) : Promise.resolve(null),
  ])

  const totalCases = cases.length
  const todayCases = cases.filter((c: CaseRow) => isToday(c.createdAt, now))
  const thisMonth = cases.filter((c: CaseRow) => isThisMonthCase(c, now)).length
  const icuCount = cases.filter((c: CaseRow) => c.postop?.disposition === "ICU").length
  const activeCount = cases.filter((c: CaseRow) => c.status !== "COMPLETE").length
  const draftCount = cases.filter((c: CaseRow) => c.status === "DRAFT").length
  const awaitingPostopCount = cases.filter((c: CaseRow) => c.status !== "COMPLETE" && c.intraop?.endTime != null).length
  const completeCount = cases.filter((c: CaseRow) => c.status === "COMPLETE").length
  const handoverCount = cases.filter((c: CaseRow) => c.transfers.length > 0).length
  // Use DB-scoped result for status/date scopes; fall back to JS filter for
  // the remaining scopes (awaiting-postop, handovers, icu) that require
  // joined-field predicates not easily expressed as a simple WHERE clause.
  const filteredCases = scopedCases ?? cases.filter((c: CaseRow) => {
    if (scope === "all") return true
    if (scope === "today") return isToday(c.createdAt, now)
    if (scope === "month") return isThisMonthCase(c, now)
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

      {/* Case list with search */}
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
            <DashboardSearch cases={filteredCases} userId={userId} role={role} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
