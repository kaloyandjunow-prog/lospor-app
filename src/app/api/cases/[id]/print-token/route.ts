import { NextRequest, NextResponse } from "next/server"
import { SignJWT } from "jose"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"

function secret() {
  return new TextEncoder().encode(process.env.NEXTAUTH_SECRET!)
}

// POST /api/cases/:id/print-token
// Issues a short-lived (5 min) signed token that lets the holder view and
// print the case protocol page without a full web session.  Used by the
// mobile app so "Print PDF" works without the user being logged in on the
// device browser.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  // Verify the user actually has access to this case
  const isAdmin = user.role === "ADMIN"
  const isHOD   = user.role === "HEAD_OF_DEPT"
  const record  = await prisma.case.findFirst({
    where: isAdmin
      ? { id }
      : isHOD && user.institutionId
        ? { id, user: { institutionId: user.institutionId } }
        : { id, userId: user.id },
    select: { id: true },
  })
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Sign a 5-minute print token
  const token = await new SignJWT({ caseId: id, userId: user.id, type: "print" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret())

  const base = process.env.NEXTAUTH_URL ?? `https://${req.headers.get("host")}`
  const url  = `${base}/cases/${id}?print_token=${token}`

  return NextResponse.json({ token, url })
}
