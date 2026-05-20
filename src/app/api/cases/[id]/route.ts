import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { mapPreop, mapIntraop, mapPostop } from "../_mappers"
import { z } from "zod"
import { logAudit } from "@/lib/audit"
import { preopSchema, intraopSchema, postopSchema } from "@/lib/schemas/case"

const patchBodySchema = z.object({
  status:  z.enum(["DRAFT", "IN_PROGRESS", "COMPLETE"]).optional(),
  notes:   z.string().max(2000).nullable().optional(),
  preop:   preopSchema.optional(),
  intraop: intraopSchema.optional(),
  postop:  postopSchema.optional(),
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const record = await prisma.case.findFirst({
    where: { id, userId },
    include: { preop: true, intraop: true, postop: true },
  })
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(record)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const existing = await prisma.case.findUnique({
    where: { id },
    select: { userId: true, status: true, intraop: { select: { id: true } }, postop: { select: { id: true } } },
  })
  if (!existing)                      return NextResponse.json({ error: "Not found"  }, { status: 404 })
  if (existing.userId !== userId)     return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (existing.status === "COMPLETE") return NextResponse.json({ error: "Case is finalised" }, { status: 403 })

  try {
    const body = patchBodySchema.parse(await req.json())
    const { preop, intraop, postop, status, notes } = body

    await prisma.$transaction(async tx => {
      if (preop) {
        await tx.case.update({ where: { id }, data: { preop: { update: mapPreop(preop) } } })
      }
      if (intraop) {
        const op = existing.intraop ? { update: mapIntraop(intraop) } : { create: mapIntraop(intraop) }
        await tx.case.update({ where: { id }, data: { intraop: op } })
      }
      if (postop) {
        const op = existing.postop ? { update: mapPostop(postop) } : { create: mapPostop(postop) }
        await tx.case.update({ where: { id }, data: { postop: op } })
      }
      const newStatus = status ?? (postop ? "COMPLETE" : intraop ? "IN_PROGRESS" : undefined)
      if (newStatus) {
        await tx.case.update({ where: { id }, data: { status: newStatus } })
      }
      if (notes !== undefined) {
        await tx.case.update({ where: { id }, data: { notes } })
      }
    })

    const newStatus = status ?? (postop ? "COMPLETE" : intraop ? "IN_PROGRESS" : undefined)
    logAudit(userId, "CASE_UPDATE", id, newStatus ? { from: existing.status, to: newStatus } : undefined)

    return NextResponse.json({ id })
  } catch (err: any) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    console.error("[PATCH /api/cases/:id]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const existing = await prisma.case.findUnique({
    where: { id },
    select: { userId: true, status: true },
  })
  if (!existing)                  return NextResponse.json({ error: "Not found" },  { status: 404 })
  if (existing.userId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (existing.status === "COMPLETE") return NextResponse.json({ error: "Cannot delete a completed case" }, { status: 400 })

  await prisma.case.delete({ where: { id } })
  logAudit(userId, "CASE_DELETE", id)
  return NextResponse.json({ ok: true })
}
