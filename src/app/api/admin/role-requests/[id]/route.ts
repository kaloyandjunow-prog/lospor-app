import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const schema = z.object({ action: z.enum(["approve", "reject"]) })

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const { action } = schema.parse(await req.json())

  const roleRequest = await prisma.roleRequest.findUnique({ where: { id } })
  if (!roleRequest) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const now = new Date()

  if (action === "approve") {
    await prisma.user.update({
      where: { id: roleRequest.userId },
      data:  { role: "HEAD_OF_DEPT" },
    })
  }

  const updated = await prisma.roleRequest.update({
    where: { id },
    data:  { status: action === "approve" ? "APPROVED" : "REJECTED", resolvedAt: now },
  })

  return NextResponse.json(updated)
}
