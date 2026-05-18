/**
 * Scrape NHIF hospital registry and replace all institutions in DB.
 * Source: https://www.nhif.bg/bg/mapdata/lzbp/2026/02
 * Run: npx tsx prisma/scrape-institutions.ts
 */

import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter } as any)

// РЗОК code → city name
const RZOK: Record<string, string> = {
  "01": "Благоевград",
  "02": "Бургас",
  "03": "Варна",
  "04": "Велико Търново",
  "05": "Видин",
  "06": "Враца",
  "07": "Габрово",
  "08": "Добрич",
  "09": "Кърджали",
  "10": "Кюстендил",
  "11": "Ловеч",
  "12": "Монтана",
  "13": "Пазарджик",
  "14": "Перник",
  "15": "Плевен",
  "16": "Пловдив",
  "17": "Разград",
  "18": "Русе",
  "19": "Силистра",
  "20": "Сливен",
  "21": "Смолян",
  "22": "София",
  "23": "София (Окръг)",
  "24": "Стара Загора",
  "25": "Търговище",
  "26": "Хасково",
  "27": "Шумен",
  "28": "Ямбол",
}

async function scrape(): Promise<{ name: string; city: string }[]> {
  const url = "https://www.nhif.bg/bg/mapdata/lzbp/2026/02"
  console.log(`Fetching ${url}…`)

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; LOSPOR/1.0)" },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()

  // Parse table rows with a simple regex — avoids cheerio ESM issues
  const results: { name: string; city: string }[] = []
  const rowRe  = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi

  let rowMatch: RegExpExecArray | null
  while ((rowMatch = rowRe.exec(html)) !== null) {
    const rowHtml = rowMatch[1]
    const cells: string[] = []
    let cellMatch: RegExpExecArray | null
    while ((cellMatch = cellRe.exec(rowHtml)) !== null) {
      // Strip HTML tags and decode basic entities
      const text = cellMatch[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/&ldquo;/g, '"')
        .replace(/&rdquo;/g, '"')
        .trim()
      cells.push(text)
    }

    if (cells.length < 2) continue

    const rzok = cells[0].replace(/\D/g, "").padStart(2, "0")
    const name = cells[1].trim()

    // Skip summary rows ("Общо за областта:", "Общо за страната:", etc.)
    if (!name || /общо/i.test(name)) continue
    // Skip if not a recognisable RZOK code
    const city = RZOK[rzok] ?? "България"

    results.push({ name, city })
  }

  return results
}

async function main() {
  const institutions = await scrape()

  if (institutions.length === 0) {
    console.error("No institutions found — check the page structure.")
    await prisma.$disconnect()
    return
  }

  console.log(`Scraped ${institutions.length} institutions.`)

  // Delete all existing institutions (cascades safely — users keep their institutionId FK;
  // if you want to preserve that, comment out the deleteMany and switch to upsert below)
  // 1. Ensure a fallback "Друго" institution exists so users can be re-pointed
  let fallback = await (prisma as any).institution.findFirst({ where: { name: "Друго" } })
  if (!fallback) {
    fallback = await (prisma as any).institution.create({
      data: { name: "Друго", city: "България", country: "България" },
    })
  }

  // 2. Move all existing users and cases to the fallback so no FK blocks the delete
  await (prisma as any).user.updateMany({ data: { institutionId: fallback.id } })
  await (prisma as any).case.updateMany({ data: { institutionId: fallback.id } })

  // 3. Delete all institutions except the fallback
  await (prisma as any).institution.deleteMany({ where: { id: { not: fallback.id } } })

  // 4. Insert all new institutions (add "Друго" to the list if not already there)
  const hasOther = institutions.some(i => i.name === "Друго")
  if (!hasOther) institutions.push({ name: "Друго", city: "България" })

  console.log(`Inserting ${institutions.length} institutions…`)
  await (prisma as any).institution.createMany({
    data: institutions.map(i => ({
      name:    i.name,
      city:    i.city,
      country: "България",
    })),
    skipDuplicates: true,
  })

  // 5. Update the fallback record to now be the real "Друго" entry
  const newOther = await (prisma as any).institution.findFirst({ where: { name: "Друго", id: { not: fallback.id } } })
  if (newOther) {
    await (prisma as any).user.updateMany({ where: { institutionId: fallback.id }, data: { institutionId: newOther.id } })
    await (prisma as any).case.updateMany({ where: { institutionId: fallback.id }, data: { institutionId: newOther.id } })
    await (prisma as any).institution.delete({ where: { id: fallback.id } })
  }

  console.log(`Done. ${institutions.length} institutions loaded.`)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
