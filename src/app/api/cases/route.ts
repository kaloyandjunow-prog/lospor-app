import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { mapPreop, mapIntraop, mapPostop } from "./_mappers"
import { logAudit } from "@/lib/audit"
import { preopSchema, intraopSchema, postopSchema } from "@/lib/schemas/case"
import { checkPII } from "@/lib/pii-check"
import { z } from "zod"

async function generateCaseCode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } })
  const year = user!.createdAt.getFullYear()
  const count = await prisma.case.count({ where: { userId } })
  return `${year}-${String(count + 1).padStart(4, "0")}`
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = user.id

  try {
    const body = await req.json()
    if (!body.preop) return NextResponse.json({ error: "preop required" }, { status: 400 })

    const preop   = preopSchema.parse(body.preop)
    const intraop = body.intraop ? intraopSchema.parse(body.intraop) : undefined
    const postop  = body.postop  ? postopSchema.parse(body.postop)   : undefined

    const piiError = checkPII({
      teamNotes:              preop.teamNotes as string | null,
      difficultAirwayNotes:  preop.difficultAirwayNotes as string | null,
      familyAnesthesiaDetails: preop.familyAnesthesiaDetails as string | null,
      complications:         intraop?.complications as string | null,
    })
    if (piiError) {
      logAudit(userId, "PII_BLOCKED", "new", { error: piiError })
      return NextResponse.json({ error: `${piiError} Please remove identifying information before saving.` }, { status: 400 })
    }

    const status = postop ? "COMPLETE" : intraop ? "IN_PROGRESS" : "DRAFT"

    const caseRecord = await prisma.case.create({
      data: {
        userId,
        status,
        caseCode: await generateCaseCode(userId),
        preop: { create: mapPreop(preop) },
        ...(intraop ? { intraop: { create: mapIntraop(intraop) } } : {}),
        ...(postop  ? { postop:  { create: mapPostop(postop)  } } : {}),
      },
    })

    logAudit(userId, "CASE_CREATE", caseRecord.id)
    return NextResponse.json({ id: caseRecord.id, caseCode: caseRecord.caseCode }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    console.error(err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const where =
    user.role === "ADMIN" ? {}
    : user.role === "HEAD_OF_DEPT" && user.institutionId ? { user: { institutionId: user.institutionId } }
    : { userId: user.id }

  // Item 28: Pagination — accept optional ?skip and ?take; cap take at 200 per request
  const url = new URL(req.url)
  const skip = Math.max(0, Number(url.searchParams.get("skip") ?? "0"))
  const take = Math.min(200, Math.max(1, Number(url.searchParams.get("take") ?? "50")))

  const [cases, total] = await Promise.all([
    prisma.case.findMany({
      where,
      include: {
        preop:  { select: { diagnosis: true, plannedProcedure: true, ageYears: true, sex: true, asaScore: true } },
        postop: { select: { disposition: true, aldreteTotal: true } },
        intraop: { select: { monthYear: true, durationMinutes: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.case.count({ where }),
  ])

  return NextResponse.json({ cases, total, skip, take })
}
