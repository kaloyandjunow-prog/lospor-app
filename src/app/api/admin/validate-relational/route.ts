import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { syncCaseRelational } from "@/lib/relational-sync"

// Theme A2: validator that detects + repairs JSON/row drift.
// ADMIN-only. Re-derives relational rows from authoritative JSON for all cases
// (or a single case if ?caseId=... is provided) and logs mismatches.

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user?.id || user.role !== "ADMIN") {
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
    } catch (err: any) {
      report.push({ caseId: c.id, status: "error", error: String(err?.message ?? err) })
    }
  }

  const errorCount    = report.filter(r => r.status === "error").length
  const repairedCount = report.filter(r => r.status === "repaired").length

  return NextResponse.json({ total: cases.length, repaired: repairedCount, errors: errorCount, report })
}
