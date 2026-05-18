import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"

export async function GET(req: NextRequest) {
  const q    = req.nextUrl.searchParams.get("q")?.trim().toLowerCase()
  const type = req.nextUrl.searchParams.get("type")?.trim()
  if (!q || q.length < 3) return NextResponse.json([])

  const where: any = { term: { contains: q, mode: "insensitive" } }
  if (type) where.termType = type

  const terms = await prisma.customTerm.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: 20,
  })

  return NextResponse.json(terms.map(t => ({
    code:        t.code,
    term:        t.term,
    termType:    t.termType,
  })))
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { term, termType } = await req.json()
  if (!term?.trim() || !termType) return NextResponse.json({ error: "Missing fields" }, { status: 400 })

  // Check if this exact term already exists (case-insensitive)
  const existing = await prisma.customTerm.findFirst({
    where: { term: { equals: term.trim(), mode: "insensitive" }, termType },
  })
  if (existing) return NextResponse.json({ code: existing.code, term: existing.term })

  // Generate next sequential code
  const last = await prisma.customTerm.findFirst({ orderBy: { code: "desc" } })
  const nextNum = last ? parseInt(last.code, 10) + 1 : 0
  const code = String(nextNum).padStart(7, "0")

  const created = await prisma.customTerm.create({
    data: { code, term: term.trim(), termType },
  })

  return NextResponse.json({ code: created.code, term: created.term }, { status: 201 })
}
