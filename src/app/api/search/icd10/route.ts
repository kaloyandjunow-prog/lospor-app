import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  if (!await getAuthUser(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const q = req.nextUrl.searchParams.get("q")?.trim()
  const locale = req.nextUrl.searchParams.get("locale") ?? "en"
  if (!q || q.length < 2) return NextResponse.json([])

  const useBg = locale === "bg"
  const term = q.toLowerCase()

  // Search Icd10Code labels + Icd10Synonym terms. Priority:
  //   1. code starts with query (e.g. "I21")
  //   2. BG label contains query (if locale=bg)
  //   3. EN label contains query
  //   4. synonym contains query
  const [byCode, byLabel, bySynonym] = await Promise.all([
    prisma.icd10Code.findMany({
      where: { code: { startsWith: q.toUpperCase() } },
      take: 10,
    }),
    prisma.icd10Code.findMany({
      where: useBg
        ? { OR: [{ labelBg: { contains: term, mode: "insensitive" } }, { labelEn: { contains: term, mode: "insensitive" } }] }
        : { labelEn: { contains: term, mode: "insensitive" } },
      take: 15,
    }),
    prisma.icd10Synonym.findMany({
      where: { synonym: { contains: term, mode: "insensitive" } },
      include: { icd10: true },
      take: 10,
    }),
  ])

  // Merge + deduplicate by code, preserving priority order
  const seen = new Set<string>()
  const results: { code: string; description: string; descriptionBg?: string }[] = []

  const add = (row: { code: string; labelEn: string; labelBg?: string | null }) => {
    if (seen.has(row.code)) return
    seen.add(row.code)
    results.push({
      code: row.code,
      description: row.labelEn,
      ...(row.labelBg ? { descriptionBg: row.labelBg } : {}),
    })
  }

  byCode.forEach(add)
  byLabel.forEach(add)
  bySynonym.forEach(r => add(r.icd10))

  return NextResponse.json(results.slice(0, 20))
}
