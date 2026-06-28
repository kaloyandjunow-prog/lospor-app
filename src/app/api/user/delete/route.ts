import { NextRequest, NextResponse, after } from "next/server"
import { signOut } from "@/lib/auth"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { revokeToken } from "@/lib/token-blocklist"
import { logAudit } from "@/lib/audit"
import { corsHeaders } from "@/lib/cors"

const CORS = corsHeaders()

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await prisma.user.update({
    where: { id: user.id },
    data:  { deletedAt: new Date() },
  })

  after(() => logAudit(user.id, "ACCOUNT_DELETE_REQUEST", user.id))

  if (user.jti) {
    await revokeToken(user.jti, new Date(Date.now() + 8 * 60 * 60 * 1000))
  }

  // Clears the web cookie — no-op for mobile bearer token clients
  await signOut({ redirect: false })

  return NextResponse.json({ ok: true })
}
