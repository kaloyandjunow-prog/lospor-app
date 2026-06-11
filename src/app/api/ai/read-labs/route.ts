import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { rateLimit } from "@/lib/rate-limit"

const MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const
const MAX_BYTES = 10_485_760 // 10 MB

// ─── Canonical lab library ────────────────────────────────────────────────────
// Single source of truth: name must match libs.ts in lospor-mobile exactly.
// The AI is given this table and must use these exact name strings.
const LIBRARY: { name: string; unit: string }[] = [
  // Haematology
  { name: "Haemoglobin (Hb)",          unit: "g/L" },
  { name: "Haematocrit (Hct)",          unit: "%" },
  { name: "Erythrocytes (RBC)",         unit: "×10¹²/L" },
  { name: "Leucocytes (WBC)",           unit: "×10⁹/L" },
  { name: "Platelets",                  unit: "×10⁹/L" },
  { name: "MCV",                        unit: "fL" },
  { name: "MCH",                        unit: "pg" },
  { name: "MCHC",                       unit: "g/dL" },
  { name: "Neutrophils",                unit: "%" },
  { name: "Lymphocytes",                unit: "%" },
  { name: "Monocytes",                  unit: "%" },
  { name: "Eosinophils",                unit: "%" },
  { name: "Reticulocytes",              unit: "%" },
  // Coagulation
  { name: "PT (Prothrombin time)",      unit: "s" },
  { name: "INR",                        unit: "" },
  { name: "aPTT",                       unit: "s" },
  { name: "Fibrinogen",                 unit: "g/L" },
  { name: "D-dimer",                    unit: "mg/L FEU" },
  { name: "Thrombin time (TT)",         unit: "s" },
  { name: "Anti-Xa",                    unit: "IU/mL" },
  // Electrolytes
  { name: "Sodium (Na⁺)",              unit: "mmol/L" },
  { name: "Potassium (K⁺)",            unit: "mmol/L" },
  { name: "Chloride (Cl⁻)",            unit: "mmol/L" },
  { name: "Bicarbonate (HCO₃⁻)",       unit: "mmol/L" },
  { name: "Calcium (Ca²⁺)",            unit: "mmol/L" },
  { name: "Ionised Ca²⁺",              unit: "mmol/L" },
  { name: "Magnesium (Mg²⁺)",          unit: "mmol/L" },
  { name: "Phosphate",                  unit: "mmol/L" },
  // Biochemistry
  { name: "Creatinine",                 unit: "μmol/L" },
  { name: "eGFR",                       unit: "mL/min/1.73m²" },
  { name: "Urea (BUN)",                 unit: "mmol/L" },
  { name: "Glucose",                    unit: "mmol/L" },
  { name: "HbA1c",                      unit: "%" },
  { name: "Lactate",                    unit: "mmol/L" },
  { name: "Uric acid",                  unit: "μmol/L" },
  { name: "Total protein",              unit: "g/L" },
  { name: "Albumin",                    unit: "g/L" },
  // Liver
  { name: "ALT (SGPT)",                 unit: "U/L" },
  { name: "AST (SGOT)",                 unit: "U/L" },
  { name: "ALP",                        unit: "U/L" },
  { name: "GGT",                        unit: "U/L" },
  { name: "Total bilirubin",            unit: "μmol/L" },
  { name: "Direct bilirubin",           unit: "μmol/L" },
  { name: "Total bile acids",           unit: "μmol/L" },
  // Cardiac
  { name: "Troponin I (hs-cTnI)",       unit: "ng/L" },
  { name: "Troponin T (hs-cTnT)",       unit: "ng/L" },
  { name: "CK (Creatine kinase)",       unit: "U/L" },
  { name: "CK-MB",                      unit: "U/L" },
  { name: "BNP",                        unit: "pg/mL" },
  { name: "NT-proBNP",                  unit: "pg/mL" },
  { name: "Myoglobin",                  unit: "μg/L" },
  // Blood Gas
  { name: "pH",                         unit: "" },
  { name: "PaO₂",                       unit: "mmHg" },
  { name: "PaCO₂",                      unit: "mmHg" },
  { name: "HCO₃⁻ (ABG)",               unit: "mmol/L" },
  { name: "Base excess (BE)",           unit: "mmol/L" },
  { name: "SaO₂",                       unit: "%" },
  { name: "Lactate (ABG)",              unit: "mmol/L" },
  // Thyroid
  { name: "TSH",                        unit: "mIU/L" },
  { name: "Free T4 (fT4)",              unit: "pmol/L" },
  { name: "Free T3 (fT3)",              unit: "pmol/L" },
  // Inflammatory
  { name: "CRP",                        unit: "mg/L" },
  { name: "ESR",                        unit: "mm/h" },
  { name: "Ferritin",                   unit: "μg/L" },
  { name: "Procalcitonin (PCT)",        unit: "μg/L" },
  { name: "IL-6",                       unit: "pg/mL" },
]

// Fast lookup: name → canonical unit (also used for validation)
const LIBRARY_MAP = new Map(LIBRARY.map(e => [e.name, e.unit]))

const LIBRARY_TABLE = LIBRARY.map(e => `${e.name} | ${e.unit || "—"}`).join("\n")

const EXTRACT_PROMPT = `You are processing a laboratory report image.

CANONICAL LAB LIBRARY (exact name | canonical unit):
${LIBRARY_TABLE}

INSTRUCTIONS:
1. Extract every numerical laboratory test result visible in the image.
2. For each result, match it to the closest entry in the library above — considering all languages, abbreviations, and alternate spellings. Examples:
   - "Хемоглобин", "HGB", "Haemoglobin", "Hb" → Haemoglobin (Hb)
   - "Лев.", "Leuk.", "WBC", "Leucocytes" → Leucocytes (WBC)
   - "Тромбоцити", "Thrombozyten", "PLT" → Platelets
   - "Креатинин", "CREA" → Creatinine
   - "Глюкоза" → Glucose
3. Use the EXACT name string from the library including all parentheses, subscripts, and special characters (e.g. ⁺, ²⁺, ⁻, ₃).
4. DISCARD any result that does not match a library entry — do not guess, do not use the printed name.
5. Convert the numeric value to the canonical unit shown in the library if the report uses a different unit:
   - Haemoglobin (Hb): g/dL × 10 → g/L (e.g. 13.5 g/dL → 135 g/L)
   - Haematocrit (Hct): decimal ratio × 100 → % (e.g. 0.42 → 42)
   - Creatinine: mg/dL × 88.4 → μmol/L
   - Glucose: mg/dL ÷ 18.0 → mmol/L
   - Urea (BUN): BUN mg/dL ÷ 2.8 → mmol/L
   - Total bilirubin / Direct bilirubin: mg/dL × 17.1 → μmol/L
   - CRP: mg/dL × 10 → mg/L
   - Calcium (Ca²⁺): mg/dL × 0.25 → mmol/L
6. Return ONLY a valid JSON array. Each element: { "test": string, "value": string, "unit": string }.
   - "test" must be an exact name from the library.
   - "unit" must be the canonical unit from the library.
   - "value" is the converted numeric value as a string.
7. No markdown, no explanation — only the raw JSON array. If no matching results are found, return [].`

// ─── Server-side unit normalisation (safety net) ─────────────────────────────
// Applied after AI parsing in case the model returns a value without converting.
function normaliseValue(name: string, raw: string): string {
  const n = parseFloat(raw.replace(",", "."))
  if (!isFinite(n)) return raw
  switch (name) {
    case "Haemoglobin (Hb)":
      // If value looks like g/dL range (5–25) rather than g/L range (50–250), convert
      if (n >= 5 && n <= 25) return String(Math.round(n * 10))
      break
    case "Haematocrit (Hct)":
      // Decimal ratio (0–1) → percentage
      if (n > 0 && n < 1) return String(Math.round(n * 100 * 10) / 10)
      break
    case "Creatinine":
      // mg/dL range (0.4–15) → μmol/L
      if (n >= 0.3 && n <= 15) return String(Math.round(n * 88.4))
      break
    case "Glucose":
      // mg/dL range (50–600) → mmol/L
      if (n >= 50) return String(Math.round(n / 18.0 * 10) / 10)
      break
    case "Urea (BUN)":
      // BUN mg/dL range (5–200) → mmol/L
      if (n >= 5 && n <= 200) return String(Math.round(n / 2.8 * 10) / 10)
      break
    case "Total bilirubin":
    case "Direct bilirubin":
      // mg/dL range (0.1–30) → μmol/L
      if (n >= 0.1 && n <= 30) return String(Math.round(n * 17.1 * 10) / 10)
      break
    case "CRP":
      // mg/dL range (0.01–30) → mg/L
      if (n >= 0.01 && n <= 30) return String(Math.round(n * 10 * 10) / 10)
      break
    case "Calcium (Ca²⁺)":
      // mg/dL range (5–15) → mmol/L
      if (n >= 5 && n <= 15) return String(Math.round(n * 0.25 * 100) / 100)
      break
  }
  return raw
}

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
        // Discard anything not in the canonical library
        .filter((r: any) => LIBRARY_MAP.has(r.test))
        .map((r: any) => {
          const canonicalUnit = LIBRARY_MAP.get(r.test)!
          const normalisedValue = normaliseValue(r.test, String(r.value))
          return { test: String(r.test), value: normalisedValue, unit: canonicalUnit }
        })
    }
  } catch {
    console.warn("[ai/read-labs] Could not parse model output:", content.slice(0, 200))
  }

  return NextResponse.json({ results })
}
