import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const requests = await prisma.roleRequest.findMany({
    where:   { status: "PENDING" },
    include: {
      user: {
        select: {
          id: true, email: true, name: true, firstName: true,
          lastName: true, title: true,
          institution: { select: { name: true, city: true } },
        },
      },
    },
    orderBy: { requestedAt: "asc" },
  })

  return NextResponse.json(requests)
}
