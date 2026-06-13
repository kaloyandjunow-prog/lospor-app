import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { rateLimit } from "@/lib/rate-limit"

const CORS = {
  "Access-Control-Allow-Origin":  process.env.CORS_ALLOW_ORIGIN ?? "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age":       "86400",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

const schema = z.object({
  title:          z.string().optional(),
  firstName:      z.string().min(1, "First name required"),
  lastName:       z.string().min(1, "Last name required"),
  email:          z.string().email(),
  institutionId:  z.union([z.string().cuid(), z.literal(""), z.undefined()]).optional(),
  acceptedTerms:  z.boolean().refine(v => v === true, "You must accept the terms"),
  password: z.string()
    .min(8, "At least 8 characters")
    .regex(/[A-Z]/, "At least one uppercase letter")
    .regex(/[0-9]/, "At least one number")
    .regex(/[^A-Za-z0-9]/, "At least one special character"),
})

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown"
  const rl = rateLimit(`register:${ip}`, 5, 60 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, {
      status: 429, headers: { "Retry-After": String(rl.retryAfter) },
    })
  }

  try {
    const body = await req.json()
    const data = schema.parse(body)

    const existing = await prisma.user.findUnique({ where: { email: data.email } })
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 })
    }

    if (data.institutionId) {
      const institution = await prisma.institution.findUnique({ where: { id: data.institutionId } })
      if (!institution) {
        return NextResponse.json({ error: "Institution not found" }, { status: 404 })
      }
    }

    const passwordHash = await bcrypt.hash(data.password, 12)
    const name = [data.title, data.firstName, data.lastName].filter(Boolean).join(" ")

    const user = await prisma.user.create({
      data: {
        name,
        firstName:       data.firstName,
        lastName:        data.lastName,
        title:           data.title ?? "",
        email:           data.email,
        passwordHash,
        institutionId:   data.institutionId || null,
        role:            "MEMBER",
        approvedAt:      null,
        acceptedTermsAt: new Date(),
        termsVersion:    "1.0",
      },
    })

    return NextResponse.json({ id: user.id, email: user.email, pending: true }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 })
    }
    console.error("[register]", err)
    const msg = "Internal server error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

