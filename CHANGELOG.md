# Changelog

All notable changes to LOSPOR are documented here.

---

## [0.3.0] — 2026-05-21

### GDPR — Data minimisation
- **Removed staff names** — `surgeonName`, `anesthesiologistName`, `anesthesiaNurseName` dropped from `PreoperativeAssessment`; replaced by a single free-text `teamNotes` field with a GuardedTextarea warning.
- **Removed exact surgery date** — `date DateTime` removed from `IntraoperativeRecord`; replaced by `monthYear String?` (e.g. `"2026-05"`) entered by the clinician. No calendar date is stored.
- **Anonymous case codes** — caseCode format changed from `DDMMYYYY-NN` (date-prefixed) to `YYYY-NNNN` (enrollment year + per-user sequence, e.g. `2026-0001`).
- **Institution decoupled from Case** — `institutionId` removed from `Case`; institution lives on `User` only. Registration now accepts a single optional institution.
- **Patient identity never stored** — printable protocol now leaves identity fields blank for hand-writing after printing; the print-time name/ID prompt has been removed.

### GDPR — Consent and transparency
- **OnboardingModal** — shown on first login; requires explicit checkbox consent before accessing the app. Acceptance recorded as `acceptedTermsAt` + `termsVersion` on `User`.
- **Terms checkbox on registration** — new accounts must accept the Terms of Use and Medical Disclaimer before submitting.
- **Privacy Policy page** (`/privacy`) — accessible without login; covers what is processed, legal basis, sub-processors (Mistral EU, Supabase EU, Vercel EU), retention, and GDPR rights.
- **Terms of Service page** (`/terms`) — accessible without login; defines permitted use, what must never be entered, liability, and AGPL-3.0 obligation.
- **Footer links** — Terms · Privacy · Open source · AGPL-3.0 added to app footer, login page, and register page.

### GDPR — Rights (Articles 15 & 17)
- **Data export** (`GET /api/user/export`) — downloads a JSON file containing the user account (no password hash), all cases with preop/intraop/postop, and the audit log. Accessible from Settings → Privacy & Data.
- **Account deletion** (`POST /api/user/delete`) — soft-deletes the account immediately (blocks future login), permanently deleted within 30 days. Requires typing `DELETE` in a confirmation input. Accessible from Settings → Privacy & Data.

### Security
- **DB-backed JWT revocation** — `RevokedToken` table replaces the in-memory `Set`; revoked JTIs survive server restarts. Lazy prune of expired tokens on each revoke.
- **Constant-time check-pending** — `GET /api/auth/check-pending` now waits a minimum of 200 ms regardless of DB hit/miss, preventing email enumeration via timing.
- **Last login tracking** — `lastLoginAt DateTime?` added to `User`; updated on each successful login; shown in Settings → Privacy & Data.
- **Soft-delete blocks login** — `deletedAt DateTime?` on `User`; deleted accounts cannot authenticate.
- **Server-side PII detection** — all free-text PATCH/POST fields are checked for: Bulgarian EGN (10-digit with checksum validation), 7+ digit sequences, DD.MM.YYYY date patterns, email addresses, two consecutive capitalised words (name pattern). Returns 400 with a descriptive message; logs `PII_BLOCKED` to the audit log.

### AI advisor
- **Migrated from Groq (US) to Mistral La Plateforme (EU)** — EU-hosted inference with GDPR DPA available; `groq-sdk` removed.
- **Free-text fields stripped** — `teamNotes`, `difficultAirwayNotes`, `familyAnesthesiaDetails`, `complications`, `airwayNotes`, and the case-level `notes` field are never forwarded to the AI provider. The summary is built from structured fields only.
- **Opt-in per case** — AI advisor is disabled by default; clinicians must enable it via a toggle in the preop form. Consent is recorded in the audit log.

### Features
- **Settings → Privacy & Data section** — shows last login time, data export button, and account deletion with confirmation.
- **GuardedTextarea component** — wraps free-text inputs with a live character counter and a client-side blur warning when EGN or MRN-like patterns are detected.
- **Admin / HOD case access** — ADMIN and HEAD_OF_DEPT roles can now view and edit cases owned by any member.

### Fixes
- **Timetable timezone** — `getHours()`/`getMinutes()` replaced with `getUTCHours()`/`getUTCMinutes()` in all functions that read DB-stored `startTime`/`endTime` values. Times were being shifted by the local UTC offset on every reload.
- **Autosave schema coercion** — API schemas now use `z.preprocess` to accept both strings (from HTML inputs) and numbers; previously mid-typing values (e.g. `"5"` before completing `"36.5"`) caused Zod 400 errors and autosave failures.
- **Autosave no longer locks cases** — postop autosave no longer auto-promotes case status to COMPLETE; only the explicit submit button does.
- **PDF empty 3rd page** — footer text in the printable PDF was too long for the `flexDirection: row` layout, causing Page 2 content to overflow onto a blank 3rd page.
- **check-pending checks deletedAt** — soft-deleted accounts no longer appear as "pending approval" on the login page.

---

## [0.2.0] — 2026-05-20

### Security
- **Admin approval for new registrations** — new accounts are now pending until an admin approves them. The admin panel shows a "Pending registrations" section with Approve / Reject buttons. Pending users see a clear message when they try to log in.
- **Completed cases locked** — the API now blocks any edit to a case with status COMPLETE (returns 403). Previously only deletion was blocked.
- **Rate limiting** — in-memory sliding window limits applied to: registration (5/hr per IP), login (10/15 min per email), AI advice (20/hr per user), ICD search (120/min per user), custom term creation (30/hr per user).
- **AI endpoint hardening** — payload capped at 16 KB; incoming data validated with Zod; confirmed no patient name, ID, or case code is forwarded to the Groq API.
- **Security headers** — all responses now include `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, and a `Content-Security-Policy`.
- **Session invalidation on logout** — JWT tokens are added to an in-memory blocklist on sign-out and expire automatically after 8 hours.
- **Supabase PostgREST API disabled** — the direct HTTP database API was exposed without row-level security; it has been disabled since the app uses Prisma over a direct connection only.

### Features
- **Audit log** — all case create / update / delete and AI advice events are recorded in a new `AuditLog` table. Admins can view and filter the log in the admin panel.
- **Institution-scoped custom terms** — custom procedures, diagnoses, medications, and allergies are now scoped to the creating user's institution. Legacy global terms remain visible to all.

### Validation
- **Full Zod schemas for preop / intraop / postop** — all API routes now validate incoming case data with precise per-field schemas (types, enum values, numeric ranges). Invalid payloads return 400 instead of silently saving corrupt data.

### Fixes
- Broken characters (`В·`, `вЂ"`, `в‚‚`, `В°`, etc.) fixed across the app — caused by UTF-8 content being stored or edited as Windows-1252.
- Browser tab title was unparseable due to smart quotes introduced during editing.
- Register page institution picker and country / title dropdowns now work correctly when accessed from the local network IP (added `allowedDevOrigins`).
- CSP in development mode now permits `unsafe-eval` required by the webpack dev bundle.
- `public/logo.png` (1.5 MB) removed — `public/logo.webp` (26 KB) is used everywhere.
- `dev.log` removed from working tree.

---

## [0.1.0] — 2026-04-01

Initial release. Preoperative, intraoperative, and postoperative data entry. PDF export. ICD-11 diagnosis search with Bulgarian translation. AI pre-operative advisor. Guided tour. Dark mode. Bilingual (English / Bulgarian).
