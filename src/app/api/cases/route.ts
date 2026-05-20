import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { mapPreop, mapIntraop, mapPostop } from "./_mappers"
import { logAudit } from "@/lib/audit"
import { preopSchema, intraopSchema, postopSchema } from "@/lib/schemas/case"
import { z } from "zod"

async function generateCaseCode(): Promise<string> {
  const now = new Date()
  const dd   = String(now.getDate()).padStart(2, "0")
  const mm   = String(now.getMonth() + 1).padStart(2, "0")
  const yyyy = String(now.getFullYear())
  const prefix = `${dd}${mm}${yyyy}`
  const count = await prisma.case.count({ where: { caseCode: { startsWith: prefix } } })
  return `${prefix}-${String(count + 1).padStart(2, "0")}`
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId = session?.user?.id
  const institutionId = session?.user?.institutionId
  if (!userId || !institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await req.json()
    if (!body.preop) return NextResponse.json({ error: "preop required" }, { status: 400 })

    const preop   = preopSchema.parse(body.preop)
    const intraop = body.intraop ? intraopSchema.parse(body.intraop) : undefined
    const postop  = body.postop  ? postopSchema.parse(body.postop)   : undefined

    const status = postop ? "COMPLETE" : intraop ? "IN_PROGRESS" : "DRAFT"

    const caseRecord = await prisma.case.create({
      data: {
        userId,
        institutionId,
        status,
        caseCode: await generateCaseCode(),
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

export async function GET() {
  const session = await auth()
  const sessionUserId = session?.user?.id
  if (!sessionUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const cases = await prisma.case.findMany({
    where: { userId: sessionUserId },
    include: {
      preop:  { select: { diagnosis: true, plannedProcedure: true, ageYears: true, sex: true, asaScore: true } },
      postop: { select: { disposition: true, aldreteTotal: true } },
      intraop: { select: { date: true, endTime: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  return NextResponse.json(cases)
}
