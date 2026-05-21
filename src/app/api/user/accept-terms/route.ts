import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PATCH() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await prisma.user.update({
    where: { id: userId },
    data: {
      acceptedTermsAt: new Date(),
      termsVersion:    "1.0",
    },
  })

  return NextResponse.json({ ok: true })
}
