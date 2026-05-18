import "server-only"
import Groq from "groq-sdk"

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })

function hasCyrillic(text: string): boolean {
  return /[Ѐ-ӿ]/.test(text)
}

// Translate a short Bulgarian medical query to English for WHO API search
export async function translateQueryToEnglish(query: string): Promise<string> {
  if (!hasCyrillic(query)) return query

  const resp = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: "You are a medical translator. Translate the given medical search term from Bulgarian to English. Return ONLY the English translation, nothing else — no explanation, no punctuation beyond what is in the term itself.",
      },
      { role: "user", content: query },
    ],
    max_tokens: 60,
    temperature: 0,
  })

  return resp.choices[0]?.message?.content?.trim() ?? query
}

// Translate an array of English ICD-11 titles to Bulgarian in one batch
export async function translateToBulgarian(titles: string[]): Promise<string[]> {
  if (titles.length === 0) return []

  const resp = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content:
          "You are a medical translator specialising in Bulgarian. Translate the following ICD-11 diagnostic terms from English to precise Bulgarian medical terminology. " +
          "Return ONLY a valid JSON array of translated strings, in exactly the same order as the input. No explanation, no markdown, no code block — just the raw JSON array.",
      },
      {
        role: "user",
        content: JSON.stringify(titles),
      },
    ],
    max_tokens: 3000,
    temperature: 0,
  })

  const raw = resp.choices[0]?.message?.content?.trim() ?? "[]"
  try {
    const match = raw.match(/\[[\s\S]*\]/)
    const parsed: unknown = JSON.parse(match ? match[0] : raw)
    if (Array.isArray(parsed) && parsed.length === titles.length) {
      return parsed.map((v: unknown) => String(v))
    }
  } catch {
    // fall through
  }

  console.error("[groq-translate] unexpected response:", raw)
  return titles // fallback: return English titles
}
