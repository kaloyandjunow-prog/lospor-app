import type { DefaultSession, DefaultUser } from "next-auth"
import type { DefaultJWT } from "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: string
      institutionId: string
      institutionName: string
      firstName: string
      lastName: string
      title: string
      jti?: string
      lastLoginAt?: string | null
    } & DefaultSession["user"]
  }

  // Shape returned by the credentials provider's authorize() (src/lib/auth.ts)
  interface User extends DefaultUser {
    jti?: string
    role?: string
    institutionId?: string | null
    institutionName?: string
    firstName?: string
    lastName?: string
    title?: string
    lastLoginAt?: string | null
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id?: string
    role?: string
    institutionId?: string | null
    institutionName?: string
    firstName?: string
    lastName?: string
    title?: string
    jti?: string
    lastLoginAt?: string | null
  }
}
