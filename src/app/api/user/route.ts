import { NextRequest, NextResponse } from "next/server"
import { corsHeaders } from "@/lib/cors"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"

const CORS = (req: NextRequest) => corsHeaders(req, "GET, PATCH, OPTIONS")

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: CORS(req) })
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS(req) })
  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true, firstName: true, lastName: true, title: true, role: true,
      preferences: true,
      institutionId: true, institution: { select: { id: true, name: true, city: true } },
    },
  })
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS(req) })
  return NextResponse.json(record, { headers: CORS(req) })
}

const patchSchema = z.object({
  institutionId: z.union([z.string().cuid(), z.literal(""), z.null()]).optional(),
  preferences: z.object({
    intraopFavouriteDrugs: z.array(z.string().min(1)).max(8).optional(),
    intraopFavouriteInfusions: z.array(z.string().min(1)).max(8).optional(),
  }).optional(),
})

function uniqueList(values: string[] | undefined) {
  return values ? Array.from(new Set(values.map(v => v.trim()).filter(Boolean))).slice(0, 8) : undefined
}

function asPreferenceObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export async function PATCH(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = user.id

  try {
    const body = patchSchema.parse(await req.json())
    const existing = body.preferences ? await prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    }) : null
    const currentPreferences = asPreferenceObject(existing?.preferences)
    const nextPreferences = body.preferences ? {
      ...currentPreferences,
      ...(body.preferences.intraopFavouriteDrugs !== undefined
        ? { intraopFavouriteDrugs: uniqueList(body.preferences.intraopFavouriteDrugs) }
        : {}),
      ...(body.preferences.intraopFavouriteInfusions !== undefined
        ? { intraopFavouriteInfusions: uniqueList(body.preferences.intraopFavouriteInfusions) }
        : {}),
    } : undefined

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(body.institutionId !== undefined ? { institutionId: body.institutionId === "" ? null : body.institutionId } : {}),
        ...(nextPreferences ? { preferences: nextPreferences as Prisma.InputJsonValue } : {}),
      },
      select: {
        preferences: true,
        institution: { select: { id: true, name: true, city: true } },
      },
    })
    return NextResponse.json({ ok: true, institution: updated.institution, preferences: updated.preferences }, { headers: CORS(req) })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: CORS(req) })
    console.error("[PATCH /api/user]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: CORS(req) })
  }
}
