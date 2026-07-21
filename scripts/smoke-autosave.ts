/**
 * Autosave smoke test — exercises the real HTTP path against a running server.
 *
 *   npm run smoke:autosave                  # defaults to http://localhost:3000
 *   BASE_URL=http://192.168.0.105:3000 npm run smoke:autosave
 *
 * Unit tests cover the parser and the mapper in isolation; this covers the wire:
 * auth → create → PATCH → read back. It guards the two failures that shipped
 * together in v5.2.0:
 *
 *   1. one out-of-range value 400'd the whole request, discarding every other
 *      edit in that autosave;
 *   2. a field-level PATCH nulled every field it did not mention.
 *
 * Exits non-zero on the first failure so it can gate a release.
 */
import { E2E_EMAIL, E2E_PASSWORD } from "../e2e/credentials"

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "")

let failures = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`  PASS  ${name}`)
  } else {
    failures++
    console.error(`  FAIL  ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`)
  }
}

async function main() {
  console.log(`Autosave smoke test against ${BASE}\n`)

  const tokenRes = await fetch(`${BASE}/api/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD }),
  })
  if (!tokenRes.ok) {
    console.error(`Could not authenticate (${tokenRes.status}). Run: npx tsx scripts/seed-e2e-user.ts`)
    process.exit(1)
  }
  const { access_token: token } = await tokenRes.json() as { access_token: string }
  const auth = { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }

  const created = await fetch(`${BASE}/api/cases`, {
    method: "POST", headers: auth,
    body: JSON.stringify({ preop: { ageYears: 40, sex: "MALE", heightCm: 176, weightKg: 70 } }),
  })
  const { id } = await created.json() as { id: string }
  if (!id) { console.error("Could not create a test case"); process.exit(1) }
  console.log(`test case ${id}\n`)

  const patch = async (preop: Record<string, unknown>) => {
    const res = await fetch(`${BASE}/api/cases/${id}`, {
      method: "PATCH", headers: auth, body: JSON.stringify({ preop }),
    })
    return { status: res.status, body: await res.json().catch(() => ({})) as Record<string, unknown> }
  }
  const read = async () => {
    const res = await fetch(`${BASE}/api/cases/${id}`, { headers: auth })
    const j = await res.json() as { preop?: Record<string, unknown> }
    return j.preop ?? {}
  }

  // ── 1. a value the API rejects must not sink the rest of the save ─────────
  console.log("A partially-invalid save keeps the valid fields")
  const bad = await patch({ heightCm: 17, weightKg: 82, ageYears: 51 })
  check("returns 200, not 400", bad.status === 200, bad.status)
  check("names the rejected field", JSON.stringify(bad.body.rejectedFields ?? "").includes("heightCm"), bad.body.rejectedFields)
  let preop = await read()
  check("valid weight persisted", preop.weightKg === 82, preop.weightKg)
  check("valid age persisted", preop.ageYears === 51, preop.ageYears)
  check("rejected height did NOT overwrite the stored value", preop.heightCm === 176, preop.heightCm)

  // ── 2. a diff patch must not erase what it does not mention ───────────────
  console.log("\nA field-level patch leaves unmentioned fields alone")
  await patch({ heightCm: 180, weightKg: 75, ageYears: 44 })
  const onlyWeight = await patch({ weightKg: 99 })
  check("returns 200", onlyWeight.status === 200, onlyWeight.status)
  preop = await read()
  check("weight updated", preop.weightKg === 99, preop.weightKg)
  check("height preserved", preop.heightCm === 180, preop.heightCm)
  check("age preserved", preop.ageYears === 44, preop.ageYears)

  // ── 3. clearing a field on purpose must still work ────────────────────────
  console.log("\nExplicitly clearing a field still stores null")
  await patch({ heightCm: null })
  preop = await read()
  check("height cleared to null", preop.heightCm === null, preop.heightCm)
  check("weight untouched by the clear", preop.weightKg === 99, preop.weightKg)

  // ── 4. a clean save reports nothing ───────────────────────────────────────
  console.log("\nA fully valid save reports no rejections")
  const good = await patch({ heightCm: 181, weightKg: 83 })
  check("returns 200", good.status === 200, good.status)
  check("no rejectedFields key", good.body.rejectedFields === undefined, good.body.rejectedFields)

  await fetch(`${BASE}/api/cases/${id}`, { method: "DELETE", headers: auth }).catch(() => {})

  console.log(failures === 0 ? "\nAll autosave smoke checks passed." : `\n${failures} check(s) FAILED.`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(err => { console.error(err); process.exit(1) })
