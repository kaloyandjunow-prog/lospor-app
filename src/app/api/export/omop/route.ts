import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { CaseStatus } from "@/generated/prisma/client"
import { mapCasesToOmop } from "@/lib/omop-mapper"

const CASE_SELECT = {
  id: true, caseCode: true, createdAt: true, status: true,
  user: { select: { institution: { select: { name: true } } } },
  preop: {
    select: {
      ageYears: true, sex: true, heightCm: true, weightKg: true,
      bpSystolic: true, bpDiastolic: true, heartRate: true, spO2: true,
      temperature: true, respiratoryRate: true,
      diagnosis: true, diagnosesJson: true, plannedProcedure: true, proceduresJson: true,
      comorbidities: true, asaScore: true, emergencySurgery: true, highRiskSurgery: true,
      allergies: true, allergyDetails: true, smoking: true, substanceAbuse: true,
      currentMedications: true, rcriScore: true, apfelScore: true, stopBangScore: true,
      difficultAirwayHistory: true, mallampati: true, labResults: true,
    },
  },
  intraop: {
    select: {
      startTime: true, endTime: true, durationMinutes: true, monthYear: true,
      techniques: true, keyEvents: true, airwayDevice: true,
      crystalloidsMl: true, colloidsMl: true, bloodMl: true, urineMl: true,
      complications: true, premedicationEvening: true, premedicationMorning: true,
    },
  },
  postop: {
    select: {
      aldreteTotal: true, painScoreNRS: true, ponv: true, disposition: true,
    },
  },
} as const

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  const caseId  = req.nextUrl.searchParams.get("caseId")
  const format  = req.nextUrl.searchParams.get("format") ?? "json"   // "json" | "csv"

  const where = caseId
    ? { id: caseId }
    : { status: { in: [CaseStatus.IN_PROGRESS, CaseStatus.AWAITING_REVIEW, CaseStatus.COMPLETE] } }

  const cases = await prisma.case.findMany({
    where,
    select: CASE_SELECT,
    orderBy: { createdAt: "asc" },
    take: 5000,
  })

  if (caseId && cases.length === 0) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 })
  }

  const bundle = mapCasesToOmop(cases as any)

  if (format === "csv") {
    const csv = bundleToCsv(bundle)
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="lospor_omop_${new Date().toISOString().substring(0,10)}.csv"`,
      },
    })
  }

  return NextResponse.json(bundle, {
    headers: {
      "Content-Disposition": `attachment; filename="lospor_omop_${new Date().toISOString().substring(0,10)}.json"`,
    },
  })
}

/** Flatten the OMOP bundle to a simple newline-delimited multi-table CSV */
function bundleToCsv(bundle: ReturnType<typeof mapCasesToOmop>): string {
  const sections: string[] = []

  const tables: [string, Record<string, unknown>[]][] = [
    ["visit_occurrence",     bundle.visit_occurrence     as any],
    ["condition_occurrence", bundle.condition_occurrence as any],
    ["drug_exposure",        bundle.drug_exposure        as any],
    ["measurement",          bundle.measurement          as any],
    ["procedure_occurrence", bundle.procedure_occurrence as any],
    ["observation",          bundle.observation          as any],
  ]

  for (const [tableName, rows] of tables) {
    if (rows.length === 0) continue
    sections.push(`## ${tableName}`)
    const headers = Object.keys(rows[0])
    sections.push(headers.join(","))
    for (const row of rows) {
      sections.push(
        headers.map(h => {
          const v = (row as any)[h]
          if (v == null) return ""
          const s = String(v)
          return s.includes(",") || s.includes('"') || s.includes("\n")
            ? `"${s.replace(/"/g, '""')}"`
            : s
        }).join(",")
      )
    }
    sections.push("")
  }

  return sections.join("\n")
}
