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

        const rl = await rateLimit(`login:${parsed.data.email}`, 10, 15 * 60 * 1000)
        if (!rl.allowed) return null

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
          include: { institution: true },
        })
        // Always run bcrypt — against a real dummy hash when the user is missing —
        // so login response time can't reveal whether an email exists.
        const DUMMY_HASH = "$2b$12$8Hgfmzh/eT3wO6GKKkEPoeC6rP9R5wI8M97v53FtBfe8chBgTrHpy"
        const valid = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH)

        // Single combined check (invalid credentials / pending approval / soft-deleted)
        if (!user || !valid || !user.approvedAt || user.deletedAt) return null

        // Fire-and-forget — never block login on a non-critical update
        prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => {})

        return {
          id:           user.id,
          jti:          crypto.randomUUID(),
          email:        user.email,
          name:         user.name,
          firstName:    user.firstName,
          lastName:     user.lastName,
          title:        user.title,
          role:         user.role as string,
          institutionId:   user.institutionId,
          institutionName: user.institution?.name ?? "",
          lastLoginAt:  user.lastLoginAt?.toISOString() ?? null,
        }
      },
    }),
  ],
})
