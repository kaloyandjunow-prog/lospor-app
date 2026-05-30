import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let colleagues: { id: string; name: string; title: string; role: string }[] = []

  if (user.role === "ADMIN") {
    colleagues = await prisma.user.findMany({
      where:   { id: { not: user.id }, approvedAt: { not: null } },
      select:  { id: true, name: true, title: true, role: true },
      orderBy: { name: "asc" },
    })
  } else if (user.role === "HEAD_OF_DEPT") {
    colleagues = await prisma.user.findMany({
      where:   { institutionId: user.institutionId, id: { not: user.id }, role: "MEMBER" },
      select:  { id: true, name: true, title: true, role: true },
      orderBy: { name: "asc" },
    })
  }

  return NextResponse.json(colleagues)
}
