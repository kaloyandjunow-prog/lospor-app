import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { z } from "zod"
import { rateLimit } from "@/lib/rate-limit"
import { logAudit } from "@/lib/audit"

const dataSchema = z.record(z.string(), z.unknown())

const SYSTEM_PROMPT = `You are a board-certified anesthesiologist providing pre-operative clinical decision support. You receive structured patient data and produce a concise, actionable clinical analysis. You write for fellow anesthesiologists — use correct medical terminology, be direct, and do not over-explain basics.

Your analysis must cover EXACTLY these sections in order, using these exact headers:

## ASA Physical Status
State the recommended ASA class (I–V with E suffix if emergency) and give 2–3 bullet points justifying the classification based on the specific data provided. If the user-selected ASA differs from your recommendation, note the discrepancy.

## Anaesthesia Technique
Recommend the preferred technique(s) (GA, regional — specify neuraxial vs. peripheral nerve block, combined, or sedation). Give brief rationale. Note contraindications or cautions specific to this patient. If regional is preferred or feasible, name the specific block or neuraxial technique appropriate for the surgery.

## Airway Management
Classify the anticipated airway (anticipated difficult/easy/cannot rule out difficult). Summarise the risk factors present. Recommend the primary airway strategy (RSI, awake fibreoptic, video laryngoscopy, standard DL + ETT, SGA, etc.) and a backup plan. Note specific equipment or preparation needed.

## Pre-operative Preparation
List only the relevant, patient-specific preparations — investigations, optimisation targets, medications to hold or continue, blood product orders, special equipment. Do not list generic standard protocols that apply to every patient.

## Intraoperative Considerations
Highlight 3–5 specific intraoperative risks or management points for this patient (not generic monitoring that every anaesthetic includes). Include positioning, haemodynamic targets, fluid strategy, PONV risk, temperature management if relevant.

## Drug and Allergy Considerations
Review known medications and allergies. Note interactions, drugs to avoid, dose adjustments. If latex allergy is present, emphasise latex-free environment. If no relevant issues, state "No specific drug concerns identified."

Tone: precise, colleague-to-colleague. Format: markdown with the section headers above. No preamble, no closing pleasantries. If data is missing that would materially change your recommendation, note the specific gap in the relevant section rather than refusing to advise.`

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
  }

  const contentLength = Number(req.headers.get("content-length") ?? 0)
  if (contentLength > 16_384) {
    return new Response(JSON.stringify({ error: "Payload too large" }), { status: 413 })
  }

  const rl = rateLimit(`ai:${session.user.id}`, 20, 60 * 60 * 1000)
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429, headers: { "Retry-After": String(rl.retryAfter) },
    })
  }

  const apiKey = process.env.MISTRAL_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "AI advisor not configured" }), { status: 503 })
  }

  let parsed: z.infer<typeof dataSchema>
  try {
    const body = await req.json()
    parsed = dataSchema.parse(body)
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400 })
  }

  // Opt-in consent check — user must explicitly enable AI advice for this case
  if (!parsed.aiOptIn) {
    return new Response(JSON.stringify({ error: "AI advice not enabled for this case" }), { status: 403 })
  }

  // GDPR: Only structured fields are sent to the AI provider.
  // Free-text fields that may contain PHI are explicitly excluded.
  const patientSummary = buildPatientSummary(parsed)
  logAudit(session.user.id, "AI_ADVISE", session.user.id, { optIn: true })

  let mistralRes: Response
  try {
    mistralRes = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mistral-small-latest",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Please analyse this patient's pre-operative data:\n\n${patientSummary}` },
        ],
        temperature: 0.3,
        max_tokens: 2000,
        stream: true,
      }),
    })
  } catch (err) {
    console.error("[ai/advise] Mistral fetch error:", err)
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 })
  }

  if (!mistralRes.ok) {
    const errText = await mistralRes.text().catch(() => "")
    console.error("[ai/advise] Mistral error:", mistralRes.status, errText)
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 })
  }

  // Stream SSE from Mistral, extract text deltas, forward as plain text
  const reader = mistralRes.body?.getReader()
  if (!reader) {
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 })
  }

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const decoder = new TextDecoder()
      const encoder = new TextEncoder()
      let buffer = ""
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const data = line.slice(6).trim()
            if (data === "[DONE]") continue
            try {
              const json = JSON.parse(data)
              const text = json.choices?.[0]?.delta?.content
              if (text) controller.enqueue(encoder.encode(text))
            } catch { /* skip malformed chunks */ }
          }
        }
        controller.close()
      } catch (err) {
        controller.error(err)
      }
    },
  })

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  })
}

// GDPR: builds patient summary from structured fields ONLY.
// The following free-text fields are intentionally excluded:
//   difficultAirwayNotes, familyAnesthesiaDetails, teamNotes, notes,
//   allergyDetails (free-text), complications, airwayNotes
function buildPatientSummary(data: any): string {
  const lines: string[] = []

  const demo: string[] = []
  if (data.ageYears != null) demo.push(`Age: ${data.ageYears} years`)
  if (data.sex) demo.push(`Sex: ${data.sex}`)
  if (data.heightCm) demo.push(`Height: ${data.heightCm} cm`)
  if (data.weightKg) demo.push(`Weight: ${data.weightKg} kg`)
  if (data.heightCm && data.weightKg) {
    const bmi = data.weightKg / ((data.heightCm / 100) ** 2)
    demo.push(`BMI: ${bmi.toFixed(1)}`)
    if (bmi >= 35) demo.push(`(Class ${bmi >= 40 ? "III" : "II"} obesity)`)
  }
  if (data.bloodType) demo.push(`Blood type: ${data.bloodType}${data.rhFactor === "NEGATIVE" ? "−" : data.rhFactor === "POSITIVE" ? "+" : ""}`)
  if (demo.length) lines.push("**Demographics:** " + demo.join(", "))

  const surgery: string[] = []
  if (data.diagnoses?.length) surgery.push(`Diagnoses: ${data.diagnoses.map((t: any) => t.label).join("; ")}`)
  if (data.procedures?.length) surgery.push(`Planned procedure: ${data.procedures.map((t: any) => t.label).join("; ")}`)
  if (data.emergencySurgery) surgery.push("**EMERGENCY SURGERY**")
  if (data.highRiskSurgery) surgery.push("High-risk surgery")
  if (surgery.length) lines.push("\n**Surgical:** " + surgery.join(" | "))

  if (data.comorbidities?.length)
    lines.push("\n**Comorbidities:** " + data.comorbidities.map((t: any) => t.label).join("; "))

  if (data.asaScore) {
    const label = (data.emergencySurgery && data.asaScore !== "VI") ? `${data.asaScore}E` : data.asaScore
    lines.push(`\n**ASA score (clinician-assigned):** ${label}`)
  }

  const safety: string[] = []
  if (data.allergies) safety.push(`Allergies: ${Array.isArray(data.allergyDetails) ? data.allergyDetails.map((t: any) => t.label).join(", ") : "unspecified"}`)
  if (data.latexAllergy) safety.push("LATEX ALLERGY")
  if (data.currentMedications?.length) safety.push(`Current medications: ${data.currentMedications.map((t: any) => t.label).join(", ")}`)
  // familyAnesthesiaDetails omitted (free-text, may contain names)
  if (data.familyAnesthesiaProblems) safety.push("Family anaesthesia problems: yes (details withheld)")
  if (data.dentalProsthetics) safety.push("Dental prosthetics present")
  if (data.looseTeeth) safety.push("Loose teeth")
  if (data.smoking) safety.push("Smoker")
  if (data.substanceAbuse) safety.push("Substance use")
  if (safety.length) lines.push("\n**Safety flags:** " + safety.join(" | "))

  const vitals: string[] = []
  if (data.bpSystolic && data.bpDiastolic) vitals.push(`BP ${data.bpSystolic}/${data.bpDiastolic} mmHg`)
  if (data.heartRate) vitals.push(`HR ${data.heartRate} bpm`)
  if (data.heartArrhythmia) vitals.push("arrhythmia present")
  if (data.spO2) vitals.push(`SpO₂ ${data.spO2}%`)
  if (data.temperature) vitals.push(`Temp ${data.temperature}°C`)
  if (data.respiratoryRate) vitals.push(`RR ${data.respiratoryRate}/min`)
  if (vitals.length) lines.push("\n**Pre-op vitals:** " + vitals.join(", "))

  const airway: string[] = []
  if (data.mallampati) airway.push(`Mallampati ${data.mallampati}`)
  if (data.mouthOpeningCm) airway.push(`Mouth opening ${data.mouthOpeningCm} cm`)
  if (data.thyromental) airway.push(`Thyromental ${data.thyromental} cm`)
  if (data.neckMobility) airway.push(`Neck mobility: ${data.neckMobility.toLowerCase()}`)
  if (data.upperLipBiteTest) airway.push(`Upper lip bite test: ${data.upperLipBiteTest.replace("CLASS_", "class ")}`)
  if (data.retrognathia) airway.push("retrognathia")
  if (data.prominentIncisors) airway.push("prominent incisors")
  if (data.facialHair) airway.push("facial hair")
  if (data.cormackLehane) airway.push(`Previous Cormack-Lehane grade ${data.cormackLehane}`)
  // difficultAirwayNotes omitted (free-text); surface boolean only
  if (data.difficultAirwayHistory) airway.push("Difficult airway history: yes (details withheld)")
  if (airway.length) lines.push("\n**Airway assessment:** " + airway.join("; "))
  else lines.push("\n**Airway assessment:** Not performed / not recorded")

  const scores: string[] = []
  if (data.rcriScore != null)   scores.push(`RCRI ${data.rcriScore}`)
  if (data.apfelScore != null)  scores.push(`Apfel ${data.apfelScore}`)
  if (data.stopBangScore != null) scores.push(`STOP-BANG ${data.stopBangScore}`)
  if (scores.length) lines.push("\n**Risk scores:** " + scores.join(", "))

  return lines.join("\n")
}
