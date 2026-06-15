# Email confirmation system — plan (v1.0.1)

Status: **plan only, not implemented, not pushed**. Scope agreed with the user:
**full auth email suite** (email verification at signup + account-approved
notification + password reset), using **Resend** (EU region) as the email
provider.

This complements the pending-approval notice fix already made this session
(register CORS fix + mobile "pending approval" login message).

---

## 1. Provider setup (user action, before any code lands)

Resend offers EU data residency by region-pinning the *sending domain*
(Dublin, `eu-west-1`), independent of the API endpoint used.

1. Create a Resend account, add a sending domain (e.g. `lospor.org` or a
   subdomain like `mail.lospor.org`), and when adding the domain choose the
   **EU (Dublin)** region.
2. Add the DNS records Resend gives you (SPF/DKIM, and ideally DMARC) to the
   domain's DNS zone. Verification can take a few minutes to a day.
3. Generate an API key (scoped to "Sending" only is enough).
4. New env vars (added to `.env.example` and the real `.env`):
   ```
   RESEND_API_KEY=""
   EMAIL_FROM="LOSPOR <noreply@lospor.org>"
   ```
   `NEXTAUTH_URL` (already present) is reused as the base URL for links in
   emails (`${NEXTAUTH_URL}/verify-email?token=...` etc.).

No code changes depend on this being done first, but verification/reset
emails will silently fail (logged, not thrown — see §6) until the domain is
verified and the key is set.

---

## 2. Data model changes (Prisma)

Add one field to `User` and one new model + enum:

```prisma
model User {
  // ...existing fields...
  emailVerifiedAt DateTime?
  verificationTokens VerificationToken[]
}

model VerificationToken {
  id        String                @id @default(cuid())
  userId    String
  user      User                  @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String                @unique
  type      VerificationTokenType
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime              @default(now())

  @@index([userId, type])
}

enum VerificationTokenType {
  EMAIL_VERIFY
  PASSWORD_RESET
}
```

- Tokens are generated as `crypto.randomBytes(32).toString("base64url")`
  (sent in the email link) and stored **hashed** (`sha256`) in `tokenHash` —
  same pattern as password hashing, so a DB leak doesn't hand out usable
  tokens.
- Expiry: `EMAIL_VERIFY` = 24h, `PASSWORD_RESET` = 1h.
- `usedAt` makes tokens single-use; a new request invalidates older
  unused tokens of the same type for that user (delete-then-create).
- New migration: `prisma/migrations/<ts>_email_verification_and_reset/`.
  Existing users get `emailVerifiedAt = NULL` — see §7 for how that's
  handled for accounts that pre-date this feature.

---

## 3. Backend routes

All new routes follow the existing patterns in
`src/app/api/auth/register/route.ts` and `check-pending/route.ts`
(zod validation, `rateLimit()`, generic responses to avoid enumeration,
CORS `OPTIONS` handler where mobile calls them directly).

| Route | Method | Calls from | CORS needed? |
|---|---|---|---|
| `/api/auth/verify-email` | `POST { token }` | Web `verify-email` page (same-origin fetch after opening the emailed link) | No |
| `/api/auth/resend-verification` | `POST { email }` | Mobile + web (button on "check your inbox" screen) | Yes |
| `/api/auth/forgot-password` | `POST { email }` | Mobile + web | Yes |
| `/api/auth/reset-password` | `POST { token, password }` | Web `reset-password` page only | No |

### `register/route.ts` (extend existing, already has CORS)
- After `prisma.user.create(...)`, create a `VerificationToken`
  (`EMAIL_VERIFY`, 24h) and call `sendVerificationEmail(user, token)`.
- Response stays `{ id, email, pending: true }` — no behaviour change for
  existing callers, just an email side-effect.

### `admin/users/[id]/approve/route.ts` (extend existing)
- After `prisma.user.update({ approvedAt: ... })`, call
  `sendApprovalEmail(updated)`. Fire-and-forget with `.catch()` logging
  (an email failure must never block the approval itself — same
  fire-and-forget pattern already used for `lastLoginAt` in `auth.ts`).

### `verify-email/route.ts` (new)
- Look up `VerificationToken` by `sha256(token)`, type `EMAIL_VERIFY`,
  `usedAt: null`, `expiresAt > now`.
- Not found/expired → `400 { error: "Invalid or expired link" }`.
- Found → set `user.emailVerifiedAt = now`, `token.usedAt = now`.
- Return `{ ok: true, alreadyVerified: boolean }` so the page can show a
  friendly message either way (handles double-clicks / stale tabs).

### `resend-verification/route.ts` (new)
- Rate-limited per-email (e.g. 3/hour) like `register`.
- Generic `{ ok: true }` response regardless of whether the email exists or
  is already verified (anti-enumeration, same constant-time-floor pattern as
  `check-pending`).
- If user exists and `!emailVerifiedAt` and `!deletedAt`: invalidate old
  `EMAIL_VERIFY` tokens, issue a new one, send the email.

### `forgot-password/route.ts` (new)
- Rate-limited per-email and per-IP (e.g. 3/hour).
- Generic `{ ok: true }` response always (classic anti-enumeration —
  "if an account exists, we've sent a reset link").
- If user exists and `!deletedAt`: invalidate old `PASSWORD_RESET` tokens,
  issue a new one (1h expiry), send the email.

### `reset-password/route.ts` (new)
- Look up `VerificationToken` by `sha256(token)`, type `PASSWORD_RESET`,
  `usedAt: null`, `expiresAt > now`. Not found/expired →
  `400 { error: "Invalid or expired link" }`.
- Validate new password with the **same zod rules** already in
  `register/route.ts` (≥8 chars, upper, digit, special).
- `bcrypt.hash` the new password, update `user.passwordHash`, mark token
  `usedAt = now`.
- **Session invalidation**: this is the one place that touches
  `token-blocklist.ts`. NextAuth JWTs carry a `jti` (see `auth.ts:43`), but
  the DB doesn't currently store a user→jti mapping, so we can't revoke
  *existing* sessions surgically. For v1, accept that existing sessions
  remain valid until they expire naturally — call this out in the PR
  description as a known limitation. (A future "store last-issued jti per
  user and revoke on password change" change is a separate, larger piece of
  work and out of scope here.)

---

## 4. Auth gating (`src/lib/auth.ts`)

Add an email-verified check alongside the existing approval check:

```ts
if (!user.emailVerifiedAt) return null   // email not yet confirmed
if (!user.approvedAt)      return null   // pending admin approval
if (user.deletedAt)        return null   // soft-deleted account
```

Order matters for messaging (next section): verification is something the
*user* controls (click the email link), approval is something an *admin*
controls — surfacing "verify your email" first gives the user something
actionable.

---

## 5. `check-pending` → richer status for login screens

Both web and mobile login currently call `/api/auth/check-pending?email=...`
on a 401 to decide whether to show "pending approval" vs "invalid
credentials". Extend the response (backwards compatible — `pending` stays):

```ts
// before
{ pending: boolean }

// after
{ pending: boolean, reason: "unverified" | "unapproved" | null }
```

- `reason: "unverified"` when `!emailVerifiedAt`
- `reason: "unapproved"` when `emailVerifiedAt && !approvedAt`
- `pending = reason !== null` (preserves old field for any caller that
  ignores `reason`)

**Web** (`(auth)/login/page.tsx`) and **mobile** (`src/lib/api.ts` `login()`,
already edited this session) both switch on `reason`:

- `unverified` → "Please check your email and click the verification link
  before signing in." + a "Resend email" action calling
  `resend-verification`.
- `unapproved` → existing "awaiting admin approval" copy (unchanged from
  this session's fix).

---

## 6. Email sending utility & templates

New file `src/lib/email.ts`:

```ts
import { Resend } from "resend"

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const FROM = process.env.EMAIL_FROM ?? "LOSPOR <noreply@lospor.org>"

async function send(to: string, subject: string, html: string) {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping send to", to)
    return
  }
  try {
    await resend.emails.send({ from: FROM, to, subject, html })
  } catch (err) {
    console.error("[email] send failed", err)
  }
}

export function sendVerificationEmail(user: { email: string; firstName: string }, token: string) { ... }
export function sendApprovalEmail(user: { email: string; firstName: string }) { ... }
export function sendPasswordResetEmail(user: { email: string; firstName: string }, token: string) { ... }
```

- **Never throws** — a Resend outage must not break registration, approval,
  or password-reset *requests* (the request itself still succeeds; only the
  notification is best-effort). This mirrors the existing fire-and-forget
  `lastLoginAt` update in `auth.ts:39`.
- Plain-HTML templates (inline styles, no `@react-email` dependency needed
  for three simple transactional emails) — small inline `<table>`-based
  layout matching LOSPOR's brand colour from `src/theme` / web header.
- **Language**: v1 ships **English-only** emails. LOSPOR already has en/bg
  UI strings, but the `User` model has no stored locale preference today.
  Bilingual emails are a clean follow-up once a `locale` field is added
  (could be captured from `Accept-Language` at registration) — flagged as
  out of scope for this pass to avoid scope creep on the first cut.

### The three emails

1. **Verify your email** (sent at registration)
   Subject: "Confirm your LOSPOR account"
   Body: greeting, "click to verify your email", button/link to
   `${NEXTAUTH_URL}/verify-email?token=...`, note it expires in 24h, note
   that an admin still needs to approve the account afterwards.

2. **Account approved** (sent when an admin approves)
   Subject: "Your LOSPOR account has been approved"
   Body: "You can now sign in", link to `${NEXTAUTH_URL}/login` (mobile
   users use the app).

3. **Reset your password** (sent on forgot-password request)
   Subject: "Reset your LOSPOR password"
   Body: link to `${NEXTAUTH_URL}/reset-password?token=...`, expires in 1h,
   "if you didn't request this, ignore this email".

---

## 7. Web pages (new)

- `src/app/(auth)/verify-email/page.tsx` — reads `?token=`, calls
  `POST /api/auth/verify-email`, shows success ("Email verified — an admin
  will review your account next" or "you can sign in now" if already
  approved) or error (expired/invalid + "resend" button).
- `src/app/(auth)/forgot-password/page.tsx` — single email field, calls
  `forgot-password`, always shows the generic "check your inbox" message.
- `src/app/(auth)/reset-password/page.tsx` — reads `?token=`, new-password
  field (reusing the same password-strength hint component as register),
  calls `reset-password`, redirects to `/login` on success.

`(auth)/login/page.tsx` gets a real `forgotPassword` link
(`href="/forgot-password"`) replacing the current static
`auth.forgotPassword` text ("Forgot your password? Contact your department
administrator.") in `messages/en.json:57` / `bg.json:57`.

### Existing accounts (pre-migration backfill)

Every current user has `emailVerifiedAt = NULL` after the migration, which
would lock all existing approved users out under the new gate in §4. Two
options:

- **Recommended**: one-time data migration sets
  `emailVerifiedAt = approvedAt` (or `createdAt`) for all rows where
  `approvedAt IS NOT NULL` at migration time — i.e. "already-approved users
  are grandfathered in as verified." Only *new* registrations after this
  ships go through the verify-email step.
- Alternative: backfill `emailVerifiedAt = createdAt` for *all* existing
  users (approved or not) — simpler, slightly less strict for the small
  number of currently-pending accounts (they'd still need approval, just
  not verification).

Either is a one-line `UPDATE` in the migration SQL; recommend the first.

---

## 8. Mobile changes (parity)

- `app/(auth)/register.tsx` `SuccessView()` copy gets a line about checking
  email for the verification link, in addition to the existing "pending
  admin approval" copy.
- `app/(auth)/login.tsx`: add a "Forgot password?" link below the sign-in
  button that opens `${API_BASE}/forgot-password` in the system browser via
  `Linking.openURL` (Expo) — password reset is inherently an email+web-link
  flow, no need for an in-app form.
- `src/lib/api.ts` `login()` (already touched this session): switch on the
  new `reason` field from `check-pending` instead of the boolean `pending`,
  to show the "verify your email" vs "awaiting admin approval" message
  correctly.

---

## 9. i18n

New keys in `messages/en.json` / `bg.json` under the `auth` namespace:

- `auth.verifyEmailSent` — "Check your inbox to confirm your email address."
- `auth.emailVerified` — "Email verified."
- `auth.emailNotVerified` — "Please verify your email before signing in."
- `auth.resendVerification` — "Resend verification email"
- `auth.forgotPasswordPrompt` / `auth.resetLinkSent` /
  `auth.resetPasswordTitle` / `auth.resetPasswordSuccess`

`auth.forgotPassword` (`messages/en.json:57`/`bg.json:57`) text changes from
"Contact your department administrator" to something like "Forgot your
password?" since it becomes a real link.

---

## 10. Rollout phases (for when this is approved)

1. **Schema + email plumbing**: migration (§2), `resend` dependency,
   `src/lib/email.ts` + 3 templates (§6), env vars (§1). No user-facing
   behaviour change yet — emails aren't triggered until phase 2/3.
2. **Email verification**: register-route hook, `verify-email` route+page,
   `auth.ts` gate, `check-pending` `reason` field, web + mobile login
   messaging, mobile register success copy, migration backfill (§7).
3. **Approval notification**: one-line hook in the approve route.
4. **Password reset**: forgot/reset routes + pages, login page link, mobile
   "Forgot password?" link, i18n strings.
5. **Verify**: `npx tsc --noEmit --pretty false` in both `lospor-app` and
   `lospor-mobile`; manual run-through of register → email → verify →
   (admin approves) → approval email → login, and forgot-password → email →
   reset → login, against a real Resend sandbox/test domain.

Each phase is independently shippable and small enough to review on its own;
recommend doing them in this order as separate commits/PRs once approved.

---

## 11. Open decisions for the user

- Confirm the sending domain/subdomain to verify in Resend (e.g.
  `lospor.org` vs `mail.lospor.org`) — affects DNS changes on a real domain
  the user controls.
- Confirm the existing-user backfill choice in §7 (recommended: grandfather
  already-approved users as verified).
- English-only emails for v1 (§6) — confirm that's acceptable for now, with
  bilingual templates as a fast-follow once a `locale` field exists.
