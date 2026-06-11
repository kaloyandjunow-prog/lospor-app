import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const CORS = {
  "Access-Control-Allow-Origin":  process.env.CORS_ALLOW_ORIGIN ?? "*",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS })
  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true, firstName: true, lastName: true, title: true, role: true,
      institutionId: true, institution: { select: { id: true, name: true, city: true } },
    },
  })
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS })
  return NextResponse.json(record, { headers: CORS })
}

const patchSchema = z.object({
  institutionId: z.union([z.string().cuid(), z.literal(""), z.null()]).optional(),
})

export async function PATCH(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = user.id

  try {
    const body = patchSchema.parse(await req.json())
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { institutionId: body.institutionId === "" ? null : body.institutionId },
      select: { institution: { select: { id: true, name: true, city: true } } },
    })
    return NextResponse.json({ ok: true, institution: updated.institution }, { headers: CORS })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: CORS })
    console.error("[PATCH /api/user]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: CORS })
  }
}
