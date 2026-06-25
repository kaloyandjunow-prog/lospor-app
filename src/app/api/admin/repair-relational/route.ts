import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { requireRole } from "@/lib/access-control"
import { prisma } from "@/lib/prisma"
import { syncCaseRelational } from "@/lib/relational-sync"

// Repair tool, not a read-only check: re-derives relational rows from the
// authoritative JSON (delete + recreate, in a transaction) for all cases (or
// a single case if ?caseId=... is provided). Renamed from
// "validate-relational" — the old name implied this only inspects for drift,
// but it actively rewrites the relational mirror every time it runs.
// ADMIN-only.

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!requireRole(user, ["ADMIN"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const caseId = req.nextUrl.searchParams.get("caseId")

  const cases = caseId
    ? await prisma.case.findMany({ where: { id: caseId }, select: { id: true } })
    : await prisma.case.findMany({ select: { id: true } })

  const report: { caseId: string; status: "ok" | "repaired" | "error"; error?: string }[] = []

  for (const c of cases) {
    try {
      await syncCaseRelational(prisma, c.id)
      report.push({ caseId: c.id, status: "repaired" })
    } catch (err: unknown) {
      report.push({ caseId: c.id, status: "error", error: String(err instanceof Error ? err.message : err) })
    }
  }

  const errorCount    = report.filter(r => r.status === "error").length
  const repairedCount = report.filter(r => r.status === "repaired").length

  return NextResponse.json({ total: cases.length, repaired: repairedCount, errors: errorCount, report })
}
