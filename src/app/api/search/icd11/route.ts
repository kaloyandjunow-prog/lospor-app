import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { searchIcd11En } from "@/lib/who-icd"
import { translateQueryToEnglish, translateToBulgarian } from "@/lib/mistral-translate"
import { rateLimit } from "@/lib/rate-limit"

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const rl = rateLimit(`icd:${user.id}`, 120, 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, {
      status: 429, headers: { "Retry-After": String(rl.retryAfter) },
    })
  }

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
    const [cached, aliasRow] = await Promise.all([
      prisma.icd11Code.findMany({
        where: { labelBg: { contains: q, mode: "insensitive" } },
        take: 20,
      }),
      /[Ѐ-ӿ]/.test(q) ? prisma.icd11Alias.findUnique({ where: { bgTerm: q.toLowerCase() } }) : null,
    ])

    // 2. Translate query to English, using alias cache to avoid repeated Mistral calls
    let enQuery: string
    if (aliasRow) {
      enQuery = aliasRow.enTerm
    } else {
      enQuery = await translateQueryToEnglish(q)
      if (/[Ѐ-ӿ]/.test(q) && enQuery !== q) {
        await prisma.icd11Alias.upsert({
          where:  { bgTerm: q.toLowerCase() },
          update: { enTerm: enQuery },
          create: { bgTerm: q.toLowerCase(), enTerm: enQuery },
        }).catch(() => {/* ignore race condition on concurrent identical queries */})
      }
    }
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
