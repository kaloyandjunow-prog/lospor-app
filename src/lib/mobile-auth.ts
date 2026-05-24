import "server-only"
import { SignJWT, jwtVerify } from "jose"
import { auth } from "@/lib/auth"
import { isRevoked } from "@/lib/token-blocklist"

// Shape returned by getAuthUser — same fields that route files pull from session.user
export type AuthUser = {
  id: string
  role: string
  institutionId: string | null
  institutionName: string | null
  firstName: string | null
  lastName: string | null
  title: string | null
  jti: string | null
}

function secret() {
  return new TextEncoder().encode(process.env.NEXTAUTH_SECRET!)
}

export async function signMobileToken(claims: {
  id: string
  jti: string
  role: string
  institutionId: string | null
  institutionName: string | null
  firstName: string | null
  lastName: string | null
  title: string | null
  lastLoginAt: string | null
}): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setJti(claims.jti)
    .setExpirationTime("8h")
    .sign(secret())
}

// Checks Authorization: Bearer <token> first, falls back to cookie session.
// Works for both the React Native mobile app (bearer) and the web app (cookie).
export async function getAuthUser(req: Request): Promise<AuthUser | null> {
  const authHeader = req.headers.get("authorization")
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const { payload } = await jwtVerify(authHeader.slice(7), secret())
      const jti = payload.jti as string | undefined
      if (jti && isRevoked(jti)) return null
      if (!payload.id) return null
      return {
        id:              payload.id as string,
        role:            payload.role as string,
        institutionId:   (payload.institutionId as string) ?? null,
        institutionName: (payload.institutionName as string) ?? null,
        firstName:       (payload.firstName as string) ?? null,
        lastName:        (payload.lastName as string) ?? null,
        title:           (payload.title as string) ?? null,
        jti:             jti ?? null,
      }
    } catch {
      return null
    }
  }

  // Cookie path — web browser
  const session = await auth()
  if (!session?.user?.id) return null
  const u = session.user as any
  return {
    id:              u.id,
    role:            u.role ?? "USER",
    institutionId:   u.institutionId ?? null,
    institutionName: u.institutionName ?? null,
    firstName:       u.firstName ?? null,
    lastName:        u.lastName ?? null,
    title:           u.title ?? null,
    jti:             u.jti ?? null,
  }
}
