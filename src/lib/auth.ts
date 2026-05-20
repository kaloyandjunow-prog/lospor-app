import "server-only"
import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { authConfig } from "@/lib/auth.config"
import { rateLimit } from "@/lib/rate-limit"

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const rl = rateLimit(`login:${parsed.data.email}`, 10, 15 * 60 * 1000)
        if (!rl.allowed) return null

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
          include: { institution: true },
        })
        if (!user) return null

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash)
        if (!valid) return null

        if (!user.approvedAt) return null   // pending admin approval — login page detects via check-pending endpoint

        return {
          id:    user.id,
          jti:   crypto.randomUUID(),
          email: user.email,
          name: user.name,
          firstName: user.firstName,
          lastName: user.lastName,
          title: user.title,
          role: user.role as string,
          institutionId: user.institutionId,
          institutionName: user.institution.name,
        }
      },
    }),
  ],
})
