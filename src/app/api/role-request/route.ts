import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const request = await prisma.roleRequest.findFirst({
    where:   { userId: user.id },
    orderBy: { requestedAt: "desc" },
  })

  return NextResponse.json(request ?? null)
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (user.role !== "MEMBER" && user.role !== "CLINICIAN" && user.role !== "RESEARCHER") {
    return NextResponse.json({ error: "Only members can submit this request" }, { status: 403 })
  }

  const existing = await prisma.roleRequest.findFirst({
    where: { userId: user.id, status: "PENDING" },
  })
  if (existing) return NextResponse.json({ error: "Request already pending" }, { status: 409 })

  const request = await prisma.roleRequest.create({
    data: { userId: user.id },
  })

  return NextResponse.json(request, { status: 201 })
}
