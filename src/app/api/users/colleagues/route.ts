import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const me = session.user as any

  const colleagues = await prisma.user.findMany({
    where: {
      institutionId: me.institutionId,
      id: { not: me.id },
    },
    select: { id: true, name: true, title: true, role: true },
    orderBy: { name: "asc" },
  })

  return NextResponse.json(colleagues)
}
