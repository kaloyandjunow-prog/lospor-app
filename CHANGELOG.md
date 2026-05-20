# Changelog

All notable changes to LOSPOR are documented here.

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
