// In-memory JWT blocklist. Cleared on server restart — primary protection is the 8-hour maxAge.
// DB-backed blocklist is v0.3.0.
const revoked = new Set<string>()

export const tokenBlocklist = {
  add: (jti: string) => revoked.add(jti),
  has: (jti: string) => revoked.has(jti),
}
