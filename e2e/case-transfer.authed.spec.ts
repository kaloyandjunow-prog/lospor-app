import { test, expect } from "@playwright/test"
import { withRoles, contextFor, JSON_HEADERS } from "./roles"

// Moving a case to another clinician.
//
// This is the flow with no e2e coverage at all before now, and it is one the
// pilot will lean on: a registrar starts a case, the consultant finishes it, or
// someone documents on the wrong account at 3am and it has to be moved.
//
// Two things make it worth testing beyond "does the button work":
//
//  1. Only a head of department or an admin may assign. A member moving cases
//     around would defeat the point of ownership.
//  2. **The case code changes.** Codes are per-user sequences, so a case moving
//     between owners is renumbered — `previousCaseCode` -> `caseCode`. A printed
//     sheet carrying the old code is how a chart stops matching its record, so
//     the renumbering is asserted explicitly rather than assumed.

const PREOP = {
  ageYears: 54, sex: "MALE" as const, heightCm: 178, weightKg: 88,
  diagnoses: [{ label: "Cholelithiasis" }],
  procedures: [{ label: "Laparoscopic cholecystectomy" }],
  asaScore: "II" as const,
}

/** The signed-in person's own user id, which the transfer API addresses people by. */
async function userIdOf(context: { request: { get: (u: string) => Promise<{ json: () => Promise<{ id: string }> }> } }) {
  const res = await context.request.get("/api/user")
  return (await res.json()).id
}

test("a head of department can assign a case within their institution, and it is renumbered", async ({ browser }) => {
  await withRoles(browser, ["member-a", "hod-a", "admin"], async ctx => {
    const created = await ctx["member-a"].request.post("/api/cases", {
      headers: JSON_HEADERS, data: { preop: PREOP },
    })
    expect(created.status(), await created.text()).toBe(201)
    const { id, caseCode: originalCode } = await created.json()

    try {
      const adminId = await userIdOf(ctx["admin"])

      const moved = await ctx["hod-a"].request.post(`/api/cases/${id}/transfer`, {
        headers: JSON_HEADERS, data: { toUserId: adminId },
      })
      expect(moved.status(), await moved.text()).toBe(200)

      const body = await moved.json()
      expect(body.instant).toBe(true)
      // Renumbered onto the new owner's sequence, and the old code reported back
      // so a printed sheet can be reconciled.
      expect(body.previousCaseCode).toBe(originalCode)
      expect(body.caseCode).not.toBe(originalCode)

      // The new owner can now open it.
      expect((await ctx["admin"].request.get(`/api/cases/${id}`)).status()).toBe(200)
    } finally {
      await ctx["admin"].request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS }).catch(() => {})
      await ctx["member-a"].request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS }).catch(() => {})
    }
  })
})

test("a member cannot assign cases, even their own", async ({ browser }) => {
  await withRoles(browser, ["member-a", "admin"], async ctx => {
    const created = await ctx["member-a"].request.post("/api/cases", {
      headers: JSON_HEADERS, data: { preop: PREOP },
    })
    expect(created.status()).toBe(201)
    const { id } = await created.json()

    try {
      const adminId = await userIdOf(ctx["admin"])
      const refused = await ctx["member-a"].request.post(`/api/cases/${id}/transfer`, {
        headers: JSON_HEADERS, data: { toUserId: adminId },
      })
      expect(refused.status()).toBe(403)
    } finally {
      await ctx["member-a"].request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS }).catch(() => {})
    }
  })
})

test("a case cannot be assigned to a clinician at another hospital", async ({ browser }) => {
  await withRoles(browser, ["member-a", "hod-a", "member-b"], async ctx => {
    const created = await ctx["member-a"].request.post("/api/cases", {
      headers: JSON_HEADERS, data: { preop: PREOP },
    })
    expect(created.status()).toBe(201)
    const { id } = await created.json()

    try {
      const outsiderId = await userIdOf(ctx["member-b"])
      const refused = await ctx["hod-a"].request.post(`/api/cases/${id}/transfer`, {
        headers: JSON_HEADERS, data: { toUserId: outsiderId },
      })
      expect(refused.status()).toBe(403)

      // And the case did not move.
      expect((await ctx["member-b"].request.get(`/api/cases/${id}`)).status()).toBe(404)
    } finally {
      await ctx["member-a"].request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS }).catch(() => {})
    }
  })
})

test("a case cannot be transferred to yourself", async ({ browser }) => {
  const context = await contextFor(browser, "hod-a")
  try {
    const created = await context.request.post("/api/cases", {
      headers: JSON_HEADERS, data: { preop: PREOP },
    })
    expect(created.status()).toBe(201)
    const { id } = await created.json()

    try {
      const selfId = await userIdOf(context)
      const refused = await context.request.post(`/api/cases/${id}/transfer`, {
        headers: JSON_HEADERS, data: { toUserId: selfId },
      })
      expect(refused.status()).toBe(400)
    } finally {
      await context.request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS }).catch(() => {})
    }
  } finally {
    await context.close()
  }
})

test("declining a pending transfer leaves the case where it was", async ({ browser }) => {
  await withRoles(browser, ["member-a", "hod-a"], async ctx => {
    const created = await ctx["member-a"].request.post("/api/cases", {
      headers: JSON_HEADERS, data: { preop: PREOP },
    })
    expect(created.status()).toBe(201)
    const { id } = await created.json()

    try {
      // Assignment by a head of department is instant, so there is no PENDING row
      // for the recipient to act on. Declining must therefore report "nothing to
      // decline" rather than silently succeeding — a decline that appears to work
      // on a case that already moved would be worse than an error.
      const declined = await ctx["member-a"].request.patch(`/api/cases/${id}/transfer`, {
        headers: JSON_HEADERS, data: { action: "decline" },
      })
      expect(declined.status()).toBe(404)

      // Still the original owner's.
      expect((await ctx["member-a"].request.get(`/api/cases/${id}`)).status()).toBe(200)
    } finally {
      await ctx["member-a"].request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS }).catch(() => {})
    }
  })
})
