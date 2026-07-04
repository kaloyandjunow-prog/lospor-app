import { NextRequest, NextResponse, after } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { mapPreop, mapIntraop, mapPostop } from "./_mappers"
import { logAudit } from "@/lib/audit"
import { preopSchema, intraopSchema, postopSchema } from "@/lib/schemas/case"
import { checkClinicalPayloadPII } from "@/lib/clinical-pii"
import { syncCaseRelationalSafe } from "@/lib/relational-sync"
import { caseWhereForUser } from "@/lib/access-control"
import { corsHeaders } from "@/lib/cors"
import { z } from "zod"

const CORS = (req: NextRequest) => corsHeaders(req)

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: CORS(req) })
}

async function generateCaseCode(userId: string): Promise<string> {
  // Yearly numbering: codes reset each calendar year, per user. Uniqueness is
  // (userId, caseCode), so two users both holding e.g. 2026-0001 is fine.
  const prefix = `${new Date().getFullYear()}-`
  // Base the next code on the highest existing one (not a row count) so a gap
  // left by a deleted draft can't collide with a still-existing higher code.
  const last = await prisma.case.findFirst({
    where: { userId, caseCode: { startsWith: prefix } },
    orderBy: { caseCode: "desc" },
    select: { caseCode: true },
  })
  const lastN = last?.caseCode ? Number(last.caseCode.slice(prefix.length)) : 0
  const next = (Number.isFinite(lastN) ? lastN : 0) + 1
  return `${prefix}${String(next).padStart(4, "0")}`
}

async function findIdempotentCase(userId: string, idempotencyKey: string) {
  return prisma.case.findFirst({
    where: { userId, clientDraftId: idempotencyKey },
    select: { id: true, caseCode: true, preop: { select: { updatedAt: true } } },
  })
}

function isPrismaUniqueError(err: unknown, field?: string): boolean {
  if (!err || typeof err !== "object" || !("code" in err) || err.code !== "P2002") return false
  if (!field) return true
  const target = "meta" in err && err.meta && typeof err.meta === "object" && "target" in err.meta
    ? err.meta.target
    : undefined
  return Array.isArray(target) ? target.includes(field) : false
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = user.id

  try {
    const body = await req.json()
    if (!body.preop) return NextResponse.json({ error: "preop required" }, { status: 400 })

    // Idempotency: mobile sends X-Idempotency-Key (= localDraftId) on case creation.
    // If we find an existing case with this key, return it without creating a duplicate.
    const idempotencyKey = req.headers.get("x-idempotency-key")
    if (idempotencyKey) {
      const existing = await findIdempotentCase(userId, idempotencyKey)
      if (existing) {
        return NextResponse.json({
          id: existing.id,
          caseCode: existing.caseCode,
          preopUpdatedAt: existing.preop?.updatedAt,
        }, { status: 200 })
      }
    }

    const preop   = preopSchema.parse(body.preop)
    const intraop = body.intraop ? intraopSchema.parse(body.intraop) : undefined
    const postop  = body.postop  ? postopSchema.parse(body.postop)   : undefined

    const piiError = checkClinicalPayloadPII({ preop, intraop, postop, notes: body.notes })
    if (piiError) {
      after(() => logAudit(userId, "PII_BLOCKED", "new", { error: piiError }))
      return NextResponse.json({ error: `${piiError} Please remove identifying information before saving.` }, { status: 400 })
    }

    const status = postop ? "AWAITING_REVIEW" : intraop ? "IN_PROGRESS" : "DRAFT"

    let caseRecord
    for (let attempt = 0; ; attempt++) {
      try {
        caseRecord = await prisma.case.create({
          data: {
            userId,
            status,
            institutionId: user.institutionId ?? null,
            caseCode: await generateCaseCode(userId),
            ...(idempotencyKey ? { clientDraftId: idempotencyKey } : {}),
            preop: { create: mapPreop(preop) },
            ...(intraop ? { intraop: { create: mapIntraop(intraop) } } : {}),
            ...(postop  ? { postop:  { create: mapPostop(postop)  } } : {}),
          },
          include: {
            preop: { select: { updatedAt: true } },
          },
        })
        break
      } catch (e: unknown) {
        if (idempotencyKey && isPrismaUniqueError(e, "clientDraftId")) {
          const existing = await findIdempotentCase(userId, idempotencyKey)
          if (existing) {
            return NextResponse.json({
              id: existing.id,
              caseCode: existing.caseCode,
              preopUpdatedAt: existing.preop?.updatedAt,
            }, { status: 200 })
          }
        }
        // Concurrent requests can compute the same next caseCode — retry with a
        // freshly-generated one rather than failing the whole create.
        if (isPrismaUniqueError(e, "caseCode") && attempt < 4) continue
        throw e
      }
    }

    after(() => logAudit(userId, "CASE_CREATE", caseRecord.id))
    after(() => syncCaseRelationalSafe(prisma, caseRecord.id, userId))
    return NextResponse.json({
      id: caseRecord.id,
      caseCode: caseRecord.caseCode,
      preopUpdatedAt: caseRecord.preop?.updatedAt,
    }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    console.error(err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const where = caseWhereForUser(user)

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
        intraop: { select: { monthYear: true, durationMinutes: true, endTime: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.case.count({ where }),
  ])

  return NextResponse.json({ cases, total, skip, take })
}
