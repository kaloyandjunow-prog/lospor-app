import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { searchIcd11En } from "@/lib/who-icd"
import { translateQueryToEnglish, translateToBulgarian } from "@/lib/groq-translate"

export async function GET(req: NextRequest) {
  const q      = req.nextUrl.searchParams.get("q") ?? ""
  const locale = req.nextUrl.searchParams.get("locale") ?? "en"

  if (q.length < 2) return NextResponse.json([])

  try {
    // ── English ────────────────────────────────────────────────────────────
    if (locale !== "bg") {
      const results = await searchIcd11En(q)
      return NextResponse.json(results.slice(0, 40))
    }

    // ── Bulgarian ──────────────────────────────────────────────────────────
    // 1. Search local cache by Bulgarian label
    const cached = await prisma.icd11Code.findMany({
      where: { labelBg: { contains: q, mode: "insensitive" } },
      take: 20,
    })

    // 2. Translate query to English (if Cyrillic) and search WHO API
    const enQuery = await translateQueryToEnglish(q)
    const whoResults = await searchIcd11En(enQuery)

    // 3. Find which WHO results are not yet cached
    const cachedCodes = new Set(cached.map(r => r.code))
    const needsTranslation = whoResults.filter(r => !cachedCodes.has(r.code))

    // 4. Batch-translate uncached results and save to DB
    if (needsTranslation.length > 0) {
      const bgTitles = await translateToBulgarian(needsTranslation.map(r => r.description))

      await prisma.$transaction(
        needsTranslation.map((r, i) =>
          prisma.icd11Code.upsert({
            where:  { code: r.code },
            update: { labelBg: bgTitles[i] },
            create: { code: r.code, labelEn: r.description, labelBg: bgTitles[i] },
          })
        )
      )

      const newResults = needsTranslation.map((r, i) => ({
        code:        r.code,
        description: bgTitles[i],
      }))

      const seen = new Set<string>()
      const merged = [
        ...cached.map(r => ({ code: r.code, description: r.labelBg! })),
        ...newResults,
      ].filter(r => {
        if (seen.has(r.code)) return false
        seen.add(r.code)
        return true
      })

      return NextResponse.json(merged.slice(0, 40))
    }

    // 5. All results already cached
    const seen = new Set<string>()
    const merged = [
      ...cached.map(r => ({ code: r.code, description: r.labelBg! })),
      ...whoResults
        .filter(r => !cachedCodes.has(r.code))
        .map(r => ({ code: r.code, description: r.description })),
    ].filter(r => {
      if (seen.has(r.code)) return false
      seen.add(r.code)
      return true
    })

    return NextResponse.json(merged.slice(0, 40))

  } catch (err) {
    console.error("[icd11 search]", err)
    return NextResponse.json({ error: "Search failed" }, { status: 500 })
  }
}
