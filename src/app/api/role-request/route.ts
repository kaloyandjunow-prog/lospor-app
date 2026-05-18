import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET — return the current user's latest role request
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userId = session.user!.id
  const req = await prisma.roleRequest.findFirst({
    where:   { userId },
    orderBy: { requestedAt: "desc" },
  })

  return NextResponse.json(req ?? null)
}

// POST — submit a new Head of Department request
export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userId = session.user!.id
  const role   = (session.user as any).role

  if (role !== "MEMBER" && role !== "CLINICIAN" && role !== "RESEARCHER") {
    return NextResponse.json({ error: "Only members can submit this request" }, { status: 403 })
  }

  // Block if a PENDING request already exists
  const existing = await prisma.roleRequest.findFirst({
    where: { userId, status: "PENDING" },
  })
  if (existing) return NextResponse.json({ error: "Request already pending" }, { status: 409 })

  const request = await prisma.roleRequest.create({
    data: { userId },
  })

  return NextResponse.json(request, { status: 201 })
}
