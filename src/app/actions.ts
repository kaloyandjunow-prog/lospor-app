"use server"

import { signOut, auth } from "@/lib/auth"
import { tokenBlocklist } from "@/lib/token-blocklist"

export async function handleSignOut() {
  const session = await auth()
  const jti = (session?.user as any)?.jti
  if (jti) tokenBlocklist.add(jti)
  await signOut({ redirectTo: "/login" })
}
