import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import fs from "fs"
import path from "path"

type Entry = { name: string; inn: string; form: string; strength: string; atc: string }

let cache: Entry[] | null = null

function loadData(): Entry[] {
  if (cache) return cache
  const filePath = path.join(process.cwd(), "src", "data", "drugs.json")
  cache = JSON.parse(fs.readFileSync(filePath, "utf8")) as Entry[]
  return cache
}

export async function GET(req: NextRequest) {
  if (!await auth()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase()
  if (!q || q.length < 2) return NextResponse.json([])

  const data    = loadData()
  const results: (Entry & { _score: number })[] = []

  for (const entry of data) {
    const nameMatch = entry.name.toLowerCase().includes(q)
    const innMatch  = entry.inn.toLowerCase().includes(q)
    if (!nameMatch && !innMatch) continue

    const score =
      (entry.name.toLowerCase().startsWith(q) ? 0 : nameMatch ? 1 : 2) +
      (entry.inn.toLowerCase().startsWith(q)  ? 0 : innMatch  ? 1 : 2)

    results.push({ ...entry, _score: score })
    if (results.length >= 50) break
  }

  results.sort((a, b) => a._score - b._score)
  return NextResponse.json(results.slice(0, 10).map(({ _score, ...e }) => e))
}
