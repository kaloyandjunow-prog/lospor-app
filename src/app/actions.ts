"use server"

import { signOut, auth } from "@/lib/auth"
import { revokeToken } from "@/lib/token-blocklist"

export async function handleSignOut() {
  const session = await auth()
  const jti = (session?.user as any)?.jti
  if (jti) {
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000)
    await revokeToken(jti, expiresAt)
  }
  await signOut({ redirectTo: "/login" })
}
