import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { rateLimit } from "@/lib/rate-limit"

const MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const
const MAX_BYTES = 10_485_760 // 10 MB

const STANDARD_NAMES = [
  "Hb","Hct","RBC","WBC","Neutrophils","Lymphocytes","Monocytes","Eosinophils","Basophils",
  "Platelets","MCV","MCH","MCHC","RDW","Reticulocytes",
  "PT/INR","PT","aPTT","Fibrinogen","D-dimer","Thrombin time","Anti-Xa",
  "Na⁺","K⁺","Cl⁻","HCO₃⁻","Ca²⁺ (total)","Ca²⁺ (ionised)","Mg²⁺","Phosphate",
  "Creatinine","Urea","eGFR","Glucose","HbA1c","Uric acid","Lactate","Osmolality",
  "Total protein","Albumin","Amylase","Lipase",
  "ALT","AST","ALP","GGT","Bilirubin (total)","Bilirubin (direct)","LDH",
  "Troponin I","Troponin T","hsTroponin","CK","CK-MB","BNP","NT-proBNP","Myoglobin",
  "pH","PaO₂","PaCO₂","HCO₃⁻ (ABG)","BE","SaO₂","Lactate (ABG)","FiO₂",
  "TSH","Free T4","Free T3","Total T4",
  "CRP","ESR","Ferritin","Procalcitonin","β-hCG","PSA","Vitamin B12","Folate",
].join(", ")

const EXTRACT_PROMPT = `You are processing a laboratory report image.

Standard test names — use EXACTLY these strings when a match exists:
${STANDARD_NAMES}

Instructions:
1. Extract every laboratory test result visible in the image.
2. For each test, find the closest match in the standard name list above — considering all languages, abbreviations, and alternate spellings (e.g. "Хемоглобин", "HGB", "Haemoglobin" all map to "Hb"). Use the EXACT standard name string including special characters like ⁺ and ₃.
3. If no standard name matches, use the name as printed on the report.
4. Return ONLY a valid JSON array. Each element: { "test": string, "value": string, "unit": string }.
5. No markdown, no explanation — only the raw JSON array. If no results found, return [].`

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const contentLength = Number(req.headers.get("content-length") ?? 0)
  if (contentLength > MAX_BYTES * 1.4) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 })
  }

  const rl = rateLimit(`ai-labs:${user.id}`, 10, 60 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, {
      status: 429, headers: { "Retry-After": String(rl.retryAfter) },
    })
  }

  const apiKey = process.env.MISTRAL_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 })
  }

  let imageBase64: string
  let mimeType: string
  try {
    const body = await req.json()
    imageBase64 = body.imageBase64
    mimeType = body.mimeType
    if (typeof imageBase64 !== "string" || !imageBase64) throw new Error("missing imageBase64")
    if (!MIME_TYPES.includes(mimeType as any)) throw new Error("invalid mimeType")
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  let mistralRes: Response
  try {
    const base = (process.env.MISTRAL_API_BASE ?? "https://api.mistral.ai/v1").replace(/\/$/, "")
    mistralRes = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "pixtral-12b-2409",
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            { type: "text", text: EXTRACT_PROMPT },
          ],
        }],
        temperature: 0.1,
        max_tokens: 2000,
        stream: false,
      }),
    })
  } catch (err) {
    console.error("[ai/read-labs] Mistral fetch error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }

  if (!mistralRes.ok) {
    const errText = await mistralRes.text().catch(() => "")
    console.error("[ai/read-labs] Mistral error:", mistralRes.status, errText)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }

  const json = await mistralRes.json()
  const content: string = json.choices?.[0]?.message?.content ?? ""

  let results: { test: string; value: string; unit: string }[] = []
  try {
    const clean = content.replace(/^```[^\n]*\n?/, "").replace(/\n?```$/, "").trim()
    const parsed = JSON.parse(clean)
    if (Array.isArray(parsed)) {
      results = parsed
        .filter((r: any) => r && typeof r.test === "string" && typeof r.value === "string")
        .map((r: any) => ({ test: String(r.test), value: String(r.value), unit: String(r.unit ?? "") }))
    }
  } catch {
    console.warn("[ai/read-labs] Could not parse model output:", content.slice(0, 200))
  }

  return NextResponse.json({ results })
}
