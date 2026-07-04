import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { corsHeaders } from "@/lib/cors"

const CORS = corsHeaders()

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function PATCH(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await prisma.user.update({
    where: { id: user.id },
    data:  { acceptedTermsAt: new Date(), termsVersion: "4.0" },
  })

  return NextResponse.json({ ok: true })
}
