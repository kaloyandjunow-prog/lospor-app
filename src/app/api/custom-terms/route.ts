import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/mobile-auth"
import { rateLimit } from "@/lib/rate-limit"

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const q    = req.nextUrl.searchParams.get("q")?.trim().toLowerCase()
  const type = req.nextUrl.searchParams.get("type")?.trim()
  if (!q || q.length < 3) return NextResponse.json([])

  const institutionId = user.institutionId

  const where: any = {
    term: { contains: q, mode: "insensitive" },
    OR: [{ institutionId }, { institutionId: null }],
  }
  if (type) where.termType = type

  const terms = await prisma.customTerm.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: 20,
  })

  return NextResponse.json(terms.map(t => ({ code: t.code, term: t.term, termType: t.termType })))
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const rl = rateLimit(`custom-terms:${user.id}`, 30, 60 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, {
      status: 429, headers: { "Retry-After": String(rl.retryAfter) },
    })
  }

  const { term, termType } = await req.json()
  if (!term?.trim() || !termType) return NextResponse.json({ error: "Missing fields" }, { status: 400 })

  const institutionId = user.institutionId

  // Check if this exact term already exists for this institution or as a global term (case-insensitive)
  const existing = await prisma.customTerm.findFirst({
    where: {
      term: { equals: term.trim(), mode: "insensitive" },
      termType,
      OR: [{ institutionId }, { institutionId: null }],
    },
  })
  if (existing) return NextResponse.json({ code: existing.code, term: existing.term })

  const last = await prisma.customTerm.findFirst({ orderBy: { code: "desc" } })
  const nextNum = last ? parseInt(last.code, 10) + 1 : 0
  const code = String(nextNum).padStart(7, "0")

  const created = await prisma.customTerm.create({
    data: { code, term: term.trim(), termType, institutionId },
  })

  return NextResponse.json({ code: created.code, term: created.term }, { status: 201 })
}
