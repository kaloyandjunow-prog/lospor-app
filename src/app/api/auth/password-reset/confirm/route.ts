import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { hashAuthToken } from "@/lib/auth-email-tokens"

const schema = z.object({
  token: z.string().min(20),
  password: z.string()
    .min(8, "At least 8 characters")
    .regex(/[A-Z]/, "At least one uppercase letter")
    .regex(/[0-9]/, "At least one number")
    .regex(/[^A-Za-z0-9]/, "At least one special character"),
})

export async function POST(req: NextRequest) {
  let data: z.infer<typeof schema>
  try {
    data = schema.parse(await req.json())
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0]?.message : "Invalid request"
    return NextResponse.json({ error: message ?? "Invalid request" }, { status: 400 })
  }

  const now = new Date()
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashAuthToken(data.token) },
    include: { user: true },
  })

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < now || resetToken.user.deletedAt) {
    return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(data.password, 12)
  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: now },
    }),
    prisma.passwordResetToken.updateMany({
      where: { userId: resetToken.userId, usedAt: null, id: { not: resetToken.id } },
      data: { usedAt: now },
    }),
  ])

  return NextResponse.json({ ok: true })
}

