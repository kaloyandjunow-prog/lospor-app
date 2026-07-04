import "server-only"
import { createHash, randomBytes } from "crypto"

export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000

export function createAuthToken(): string {
  return randomBytes(32).toString("base64url")
}

export function hashAuthToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function tokenExpiry(ttlMs: number): Date {
  return new Date(Date.now() + ttlMs)
}

