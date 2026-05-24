import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const colleagues = await prisma.user.findMany({
    where:   { institutionId: user.institutionId, id: { not: user.id } },
    select:  { id: true, name: true, title: true, role: true },
    orderBy: { name: "asc" },
  })

  return NextResponse.json(colleagues)
}
