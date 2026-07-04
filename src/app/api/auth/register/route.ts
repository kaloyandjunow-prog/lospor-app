import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { rateLimit } from "@/lib/rate-limit"
import { corsHeaders } from "@/lib/cors"
import { createAuthToken, EMAIL_VERIFICATION_TTL_MS, hashAuthToken, tokenExpiry } from "@/lib/auth-email-tokens"
import { appUrl, sendVerificationEmail } from "@/lib/transactional-email"

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders("POST, OPTIONS", "Content-Type, Authorization") })
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
  const rl = await rateLimit(`register:${ip}`, 5, 60 * 60 * 1000)
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

    const token = createAuthToken()
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
        emailVerifiedAt: null,
        acceptedTermsAt: new Date(),
        termsVersion:    "4.0",
        emailVerificationTokens: {
          create: {
            tokenHash: hashAuthToken(token),
            expiresAt: tokenExpiry(EMAIL_VERIFICATION_TTL_MS),
          },
        },
      },
    })

    const verifyUrl = appUrl(`/verify-email?token=${encodeURIComponent(token)}`)
    let emailSent = false
    try {
      const result = await sendVerificationEmail({ email: user.email, name: user.name }, verifyUrl)
      emailSent = result.sent
    } catch (err) {
      console.error("[register.verify-email]", err)
    }

    const exposeTestLink = process.env.NODE_ENV !== "production" && (process.env.AUTH_EMAIL_TEST_LINKS === "true" || !process.env.BREVO_API_KEY)
    return NextResponse.json({
      id: user.id,
      email: user.email,
      pending: false,
      verificationRequired: true,
      emailSent,
      ...(exposeTestLink ? { devVerifyUrl: verifyUrl } : {}),
    }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 })
    }
    console.error("[register]", err)
    const msg = "Internal server error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
