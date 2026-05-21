import "server-only"

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY ?? ""

async function mistralChat(system: string, user: string, maxTokens = 60): Promise<string> {
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${MISTRAL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "open-mistral-7b",
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      max_tokens: maxTokens,
      temperature: 0,
    }),
  })
  const json = await res.json()
  return json.choices?.[0]?.message?.content?.trim() ?? ""
}

function hasCyrillic(text: string): boolean {
  return /[Ѐ-ӿ]/.test(text)
}

export async function translateQueryToEnglish(query: string): Promise<string> {
  if (!hasCyrillic(query)) return query
  const result = await mistralChat(
    "You are a medical translator. Translate the given medical search term from Bulgarian to English. Return ONLY the English translation, nothing else.",
    query,
    60,
  )
  return result || query
}

export async function translateToBulgarian(titles: string[]): Promise<string[]> {
  if (titles.length === 0) return []
  const raw = await mistralChat(
    "You are a medical translator specialising in Bulgarian. Translate the following ICD-11 diagnostic terms from English to precise Bulgarian medical terminology. Return ONLY a valid JSON array of translated strings, in exactly the same order as the input. No explanation, no markdown, no code block — just the raw JSON array.",
    JSON.stringify(titles),
    3000,
  )
  try {
    const match = raw.match(/\[[\s\S]*\]/)
    const parsed: unknown = JSON.parse(match ? match[0] : raw)
    if (Array.isArray(parsed) && parsed.length === titles.length) {
      return parsed.map((v: unknown) => String(v))
    }
  } catch { /* fall through */ }
  console.error("[translate] unexpected response:", raw)
  return titles
}
