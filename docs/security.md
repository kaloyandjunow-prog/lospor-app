# LOSPOR Security Model

## Authentication

- Web app: NextAuth.js session cookie (httpOnly, sameSite=strict).
- Mobile / PWA: short-lived JWT (8h) issued by `/api/auth/token`, stored in `expo-secure-store` (Keychain on iOS, Keystore on Android, localStorage on PWA).
- All API routes check `getAuthUser`, which accepts Bearer token first and cookie session as fallback.
- Revoked JWTs are tracked in the `RevokedToken` table with in-memory cache (5-minute refresh).

## GDPR / Patient Identifiers

By design, no patient names or national IDs are collected or stored.
- Patient identity fields (name, DOB, national ID) are intentionally absent from all forms and schemas.
- Printed protocols leave patient-identity lines blank for hand-written completion — keeping the database free of directly identifying data.
- All free-text fields (team notes, airway notes) are scanned server-side by `checkPII` before persistence.
  `checkPII` rejects entries containing email addresses, long numeric strings (≥7 digits), common date patterns, EGN (Bulgarian personal ID), and two consecutive capitalised words (likely a name).

## Data Storage

| Surface | What is stored | Technology |
|---------|---------------|------------|
| Server DB | Clinical case data (no patient names) | PostgreSQL via Prisma |
| Mobile native | Bearer token, offline patch queue | expo-secure-store (Keychain/Keystore) |
| Mobile PWA | Bearer token, offline patch queue | localStorage (plain HTTP dev; HTTPS prod) |

**localStorage security note (PWA):** The bearer token and offline clinical drafts are stored in `localStorage` on the PWA. This is an intentional trade-off: tokens are short-lived (8h), contain no patient data, and the app is served over HTTPS in production. `localStorage` does not persist across browser data wipes and is isolated by origin. iOS Safari may evict storage under memory pressure — this is acceptable because all data is eventually server-persisted and offline drafts are clearly labelled "Saved locally — syncs when online."

## CORS

All `/api/*` routes include CORS headers.
- Development: `Access-Control-Allow-Origin: *` (allows the local PWA dev server at `:3001`).
- Production: set `CORS_ALLOW_ORIGIN=https://mobile.lospor.org` (or wherever the PWA is deployed) in Vercel environment variables to restrict the allowed origin.
- All mutating routes (`POST`, `PATCH`, `PUT`, `DELETE`) require `Authorization: Bearer <token>`, so wildcard CORS does not allow unauthenticated state-changing requests.

## CSRF

`src/proxy.ts` enforces origin-check CSRF protection on all web-app routes.
- Requests with `Authorization: Bearer` are exempt (mobile/PWA path).
- Requests without a matching `Origin` or `Referer` header are rejected with 403.
- API routes (`/api/*`) are excluded from the proxy matcher — they rely on Bearer auth.

## Content Security Policy

`next.config.ts` sets CSP headers on all responses:
- `script-src 'self' 'unsafe-inline'` (dev adds `'unsafe-eval'` for source maps).
- `connect-src 'self'` (dev adds WebSocket endpoints for HMR).
- No external script sources, no `data:` scripts.

## AI Provider

Mistral AI (EU-hosted) is the only permitted AI provider. All clinical data sent for AI analysis stays within EU infrastructure. Groq and other US-based AI providers are banned.

## Recommended production checklist

- [ ] `CORS_ALLOW_ORIGIN` set to the production PWA domain in Vercel.
- [ ] `NEXTAUTH_SECRET` is a random 32+ byte secret, not the default.
- [ ] `DATABASE_URL` uses SSL (`?sslmode=require`).
- [ ] Database backups enabled (automated daily minimum).
- [ ] Error monitoring configured (Sentry EU region recommended).
- [ ] Audit logs reviewed periodically — all case mutations are logged.
- [ ] Token expiry reviewed: current 8h. Adjust to match institutional policy.
