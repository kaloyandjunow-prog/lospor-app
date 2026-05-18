import "server-only"

const TOKEN_URL  = "https://icdaccessmanagement.who.int/connect/token"
const SEARCH_URL = "https://id.who.int/icd/release/11/2024-01/mms/search"

let cached: { token: string; expiresAt: number } | null = null

async function getToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt - 30_000) return cached.token

  const res = await fetch(TOKEN_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      client_id:     process.env.WHO_ICD_CLIENT_ID!,
      client_secret: process.env.WHO_ICD_CLIENT_SECRET!,
      grant_type:    "client_credentials",
      scope:         "icdapi_access",
    }),
    cache: "no-store",
  })

  if (!res.ok) throw new Error(`WHO token fetch failed: ${res.status}`)

  const data = await res.json()
  cached = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
  return cached.token
}

export async function searchIcd11En(q: string): Promise<{ code: string; description: string }[]> {
  const token = await getToken()

  const url = `${SEARCH_URL}?q=${encodeURIComponent(q)}&highlightingEnabled=false&medicalCodingMode=true&useFlexisearch=true`
  const res = await fetch(url, {
    headers: {
      Authorization:    `Bearer ${token}`,
      "Accept-Language": "en",
      "API-Version":    "v2",
    },
    cache: "no-store",
  })

  if (!res.ok) throw new Error(`WHO ICD search failed: ${res.status}`)

  const data = await res.json()
  return (data.destinationEntities ?? [])
    .filter((e: any) => e.theCode)
    .map((e: any) => ({
      code:        e.theCode as string,
      description: (e.title as string).replace(/<[^>]+>/g, "").trim(),
    }))
}
