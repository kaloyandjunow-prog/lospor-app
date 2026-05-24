# Changelog

All notable changes to LOSPOR are documented here.

---

## [0.4.2] — 2026-05-24

### Features
- **Full Bulgarian UI translation** — all user-visible strings across the app now route through next-intl instead of being hardcoded in English. Components and pages converted: admin panel (including audit log section), app layout (nav and footer), case entry wizard (save status, countdown banner, navigation buttons), login page, register page (institution picker, medical disclaimer, footer), CaseSummary (loading/error states), TourButton (guides menu and demo prompt), PreopForm (safety section, vitals labels, airway section, lab section, emergency surgery button), and IntraopForm (preop summary banner). New translation keys added across the `preop`, `intraop`, `case`, `tour`, `auth`, `nav`, `admin`, and `status` namespaces in both `en.json` and `bg.json`.
- **Vercel Analytics** — page-view analytics via `@vercel/analytics/next` added to the root layout. Active on all routes when deployed to Vercel; no-op in local development.

### Security / compliance
- **AI wording corrected** — the AI advisor system prompt and UI disclaimer no longer claim "clinical decision support". Both now state clearly that the output is an informational summary, does not constitute clinical advice, and that the responsible anaesthesiologist retains full clinical responsibility.
- **Lab scan GDPR warning strengthened** — the upload notice now explicitly instructs users to crop out patient names, date of birth, ID/MRN numbers, and any other identifying information before uploading. Includes a clear instruction not to upload if identifiers cannot be removed.
- **PII detection best-effort notice** — the Privacy Policy now states that server-side PII pattern detection is best-effort and does not guarantee detection of all personal identifiers. Users remain responsible for not entering patient-identifiable data into free-text fields.
- **Unused AI SDKs removed** — `@anthropic-ai/sdk` and `@google/genai` were installed but unused. Both packages have been removed.

---

## [0.4.1] — 2026-05-24

### Fixes
- **Terms and Privacy links inaccessible when logged in** — clicking the Terms or Privacy links in the app footer (dashboard, preop, intraop, postop, summary) redirected back to the dashboard instead of opening the page. The auth guard treated `/terms` and `/privacy` as login-only pages and redirected authenticated users away. Fixed by splitting public pages (accessible to everyone) from login pages (which redirect logged-in users to the dashboard).

---

## [0.4.0] — 2026-05-24

### Features
- **30-minute graceful close window** — submitting postop no longer immediately finalises the case. A 30-minute review window opens with a countdown banner visible at every step (preop / intraop / postop). The user can navigate back to correct any data; the timer persists across navigation and page reloads via `localStorage`. The case auto-closes when the timer expires or the user clicks "Close Now". Status is promoted to `COMPLETE` only at that point.
- **HOD access now institution-scoped** — `HEAD_OF_DEPT` users can view and edit only cases belonging to clinicians in their own institution. Case transfers are also restricted to within-institution recipients. `ADMIN` retains global access (GET `/cases/[id]`, PATCH `/cases/[id]`, POST `/cases/[id]/transfer`, and the case view page all enforce this).
- **Expanded lab catalogue** — preop Labs section now has 100+ perioperative tests across 9 categories: Haematology (15 tests including full differential), Coagulation (7), Electrolytes (8), Biochemistry (12), Liver (9), Cardiac (8 including BNP/NT-proBNP), Blood Gas (7), Thyroid (4), Inflammatory / Other (8). Tests are shown in collapsible category rows.
- **Lab reference ranges** — each test in the results table shows a reference interval badge. Values within the normal range are shown in green; out-of-range values are flagged in amber with the value bolded. No range data → no badge.
- **Lab search / filter** — a search input above the category buttons filters the catalogue in real time; only matching tests and their categories are shown.
- **AI lab scan** — a "Scan lab report" button lets the user upload a photo of a printed lab result. Mistral AI extracts test names, values, and units from the image (multilingual, handles abbreviations and alternate spellings). Extracted results appear in a preview panel with per-row checkboxes; clicking "Add selected" merges checked rows into the existing results, skipping duplicates. A GDPR notice is displayed above the file picker at all times.
- **AI advisor: configurable base URL and model** — `MISTRAL_API_BASE` env var overrides the Mistral API endpoint (useful for self-hosted or compatible providers). `MISTRAL_MODEL` overrides the default model (`open-mistral-7b`).
- **AI advisor: 429 rate-limit handling** — when Mistral returns 429, the advisor now shows "AI service is busy — please try again in a moment" instead of a generic error.

### Fixes
- **Autosave ZodError on case reopen** — when continuing a case from the dashboard to the intraop step, `keyEvents` (a `TimetableData` object stored in the DB) was spread into `IntraopForm` default values. `getValues()` returned it and the autosave payload failed server Zod validation with 400. Fixed by a dedicated `dbIntraopToForm` mapper that strips all DB-only fields (`id`, `caseId`, `keyEvents`, `timeSeriesData`, `durationMinutes`, timestamps) before passing data to the form.
- **Postop data blank on reopen** — reopening a case that had been submitted through postop sent the user to the postop form with empty fields. All postop data is now restored via `dbPostopToForm`.
- **Countdown resets on dashboard navigation** — leaving the summary page and returning restarted the 30-minute window from scratch. The timer now uses a `localStorage` timestamp and resumes from the correct remaining time on every re-mount.
- **Parallel fluid row disappears after inline discontinuation** — when two same-category fluids ran in parallel and one was inline-discontinued, the discontinued fluid's lane row disappeared. Fixed by normalising `endCol` (guarding against `endCol < startCol`) and combining all discontinuation updates into a single `onChangeRef.current` call to avoid stale-closure overwrites.
- **Lab results print overflow** — entering more than ~12 lab results caused the print layout to clip. The summary now uses a multi-column layout (2 columns for 9–15 results, 3 for 16–29, 4 for 30+) with a compact 8 px print font, fitting up to ~40 results within the A4 page height.
- **Summary cards sizing on first open** — the two printable cards were too narrow when first entering the summary during case entry. The step-3 container now uses `max-w-[1200px]`, matching the read-only case view.

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
