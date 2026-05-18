import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const schema = z.object({
  role: z.enum(["MEMBER", "HEAD_OF_DEPT"]),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const body   = await req.json()
  const data   = schema.parse(body)

  const user = await prisma.user.update({
    where: { id },
    data:  { role: data.role },
    select: { id: true, role: true },
  })

  return NextResponse.json(user)
}
