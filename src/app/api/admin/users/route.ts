import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const pending = req.nextUrl.searchParams.get("pending") === "true"

  const users = await prisma.user.findMany({
    where: pending ? { approvedAt: null } : { approvedAt: { not: null } },
    select: {
      id: true, email: true, name: true, firstName: true, lastName: true,
      title: true, role: true, createdAt: true,
      institution: { select: { name: true, city: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(users)
}
