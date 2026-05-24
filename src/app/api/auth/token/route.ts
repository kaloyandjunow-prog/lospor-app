import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { rateLimit } from "@/lib/rate-limit"
import { signMobileToken } from "@/lib/mobile-auth"

const schema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
})

// Mobile login — returns a signed JWT as { access_token, token_type, expires_in }.
// Web sessions continue to use NextAuth cookie auth; this endpoint is for the React Native app only.
export async function POST(req: NextRequest) {
  let body: z.infer<typeof schema>
  try {
    body = schema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const rl = rateLimit(`login:${body.email}`, 10, 15 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const user = await prisma.user.findUnique({
    where:   { email: body.email },
    include: { institution: true },
  })

  // Always run bcrypt to prevent email-enumeration via timing
  const DUMMY = "$2b$12$dummy.hash.prevents.timing.attacks.on.email.existence.x"
  const hash  = user?.passwordHash ?? DUMMY
  const valid = await bcrypt.compare(body.password, hash)

  if (!user || !valid || !user.approvedAt || user.deletedAt) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
  }

  const jti = crypto.randomUUID()
  prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => {})

  const token = await signMobileToken({
    id:              user.id,
    jti,
    role:            user.role,
    institutionId:   user.institutionId,
    institutionName: user.institution?.name ?? null,
    firstName:       user.firstName,
    lastName:        user.lastName,
    title:           user.title,
    lastLoginAt:     user.lastLoginAt?.toISOString() ?? null,
  })

  return NextResponse.json({
    access_token: token,
    token_type:   "Bearer",
    expires_in:   8 * 60 * 60,
  })
}
