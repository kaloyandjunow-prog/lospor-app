import { NextResponse } from "next/server"
import { auth, signOut } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { revokeToken } from "@/lib/token-blocklist"
import { logAudit } from "@/lib/audit"

export async function POST() {
  const session = await auth()
  const userId  = session?.user?.id
  const jti     = (session?.user as any)?.jti
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Soft-delete: mark account as deleted; hard-delete is manual after 30 days
  await prisma.user.update({
    where: { id: userId },
    data:  { deletedAt: new Date() },
  })

  logAudit(userId, "ACCOUNT_DELETE_REQUEST", userId)

  // Revoke current session immediately
  if (jti) {
    await revokeToken(jti, new Date(Date.now() + 8 * 60 * 60 * 1000))
  }

  // Sign out — clears the cookie
  await signOut({ redirect: false })

  return NextResponse.json({ ok: true })
}
