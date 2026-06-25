import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { mergeIcd10Results, type Icd10SearchRow } from "@/lib/icd10-search"

export async function GET(req: NextRequest) {
  if (!await getAuthUser(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const q = req.nextUrl.searchParams.get("q")?.trim()
  const locale = req.nextUrl.searchParams.get("locale") ?? "en"
  if (!q || q.length < 2) return NextResponse.json([])

  const useBg = locale === "bg"
  const term = q.toLowerCase()

  const [byBgLabel, byCode, byEnLabel, bySynonym] = await Promise.all([
    useBg
      ? prisma.icd10Code.findMany({
          where: { labelBg: { contains: term, mode: "insensitive" } },
          take: 15,
        })
      : Promise.resolve([] as Icd10SearchRow[]),
    prisma.icd10Code.findMany({
      where: { code: { startsWith: q.toUpperCase() } },
      take: 10,
    }),
    prisma.icd10Code.findMany({
      where: { labelEn: { contains: term, mode: "insensitive" } },
      take: 15,
    }),
    prisma.icd10Synonym.findMany({
      where: { synonym: { contains: term, mode: "insensitive" } },
      include: { icd10: true },
      take: 10,
    }),
  ])

  return NextResponse.json(mergeIcd10Results([
    byBgLabel,
    byCode,
    byEnLabel,
    bySynonym.map((row) => row.icd10),
  ], useBg))
}
