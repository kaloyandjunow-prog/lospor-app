import "server-only"
import { auth } from "@/lib/auth"
import { resolveAccount } from "@/lib/password-epoch"
import type { Session } from "next-auth"

export async function getLiveSession(): Promise<Session | null> {
  const session = await auth().catch(() => null)
  const userId = session?.user?.id
  if (!userId) return null

  const account = await resolveAccount(userId, session.user.iat)
  if (!account) return null

  session.user.role = account.role ?? session.user.role ?? "USER"
  session.user.institutionId = account.institutionId
  session.user.institutionName = account.institutionName ?? ""
  return session
}
