# Changelog — LOSPOR Web App

All notable changes to the web application are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [2.0.0] — 2026-06-19

### Added — Database Optimization (research-grade)

**ICD-10 migration (replaces ICD-11)**
- Removed live WHO ICD-11 API dependency (`who-icd.ts`, `/api/search/icd11`), all ICD-11 cache tables (`Icd10BgCode`, `Icd11Code`, `Icd11Alias`), and Mistral diagnosis-translation.
- New `Icd10Code` table (WHO ICD-10 + official BG MZ labels) and `Icd10Synonym` table (ICD-10CM search synonyms from Athena).
- `/api/search/icd10` now performs local DB full-text search — fast, offline, no external dependency.
- Diagnosis and comorbidity search in web PreopForm and mobile updated to ICD-10.
- Body-system classification updated to ICD-10 only (`icd-categories.ts`).
- Comorbidities gain `icd10Code` column (Gap 2) — comorbidities are now coded identically to diagnoses.

**LOINC-coded labs (Theme B)**
- `LabResult` gains `valueNum Float`, `unitCanon`, `loincCode`, `referenceLow`, `referenceHigh`, `abnormalFlag`, `takenAt`, `source`.
- New `LabLoinc` table: 67 entries mapping canonical lab names to LOINC codes and reference ranges.
- `relational-sync.ts` populates LOINC fields and computes `abnormalFlag` automatically on each case save.
- MCHC canonical unit corrected from g/dL to g/L (SI); Mistral prompt and server normaliser updated.

**ATC drug coding (Theme C)**
- New `Atc` table: full ATC classification tree seeded from Athena (~6,300 codes, 5 levels).
- New `Drug` table: Bulgarian drug registry seeded from `drugs.json`.
- `CaseEvent` (drug events) gains `atcCode`, `drugId`, `drugRoute` columns.
- New `Medication` table: preop medications as coded rows alongside legacy `currentMedications` JSON.

**Per-field audit log (Theme D)**
- New `CaseFieldChange` table: records field-level diffs on every preop/postop save (section, field, oldValue, newValue, userId, timestamp).
- Written best-effort after each PATCH — never blocks a clinical save.

**Finalisation snapshot (Theme E)**
- New `CaseSnapshot` table: immutable full-case snapshot written on COMPLETE transition.
- Includes schema version (`2.0.0`) so published datasets can cite the exact structure.

**Relational validator (Theme A2)**
- New `POST /api/admin/validate-relational` endpoint (ADMIN only): re-derives all relational rows from authoritative JSON, detects and repairs drift. Accepts `?caseId=` for single-case repair.

**Vocabulary seed scripts**
- `scripts/seed-vocabularies.ts`: streams Athena CSVs from local `athena/` folder to seed `Icd10Code`, `Icd10Synonym`, `Atc`, and `Drug` tables. Idempotent.
- `scripts/seed-lab-loinc.ts`: seeds `LabLoinc` table with all 67 LOINC codes.

### Migration
- `20260619100000_v2_database_optimization` — drops 3 ICD-11 tables, adds 8 new tables, extends `LabResult`/`Comorbidity`/`CaseEvent` with nullable research columns.

---

## [1.2.0] — 2026-06-18

### Added — relational clinical data (JSON normalisation)
- Clinical data previously stored only as JSON blobs is now also mirrored into
  queryable SQL tables: **pre-op diagnoses, procedures, comorbidities, lab results**
  (`PreopDiagnosis`, `PreopProcedure`, `Comorbidity`, `LabResult`), **intra-op
  vascular accesses** (`VascularAccess`), and the controlled-vocabulary multi-selects
  — positions, techniques, airway devices/tools, ventilation modes, handover items —
  in a generic `CaseSelection` table. Intra-op **vitals** gained typed columns on
  `CaseEvent` (`systolic/diastolic/heartRate/spO2/etco2/temp`).
- The JSON columns remain authoritative and are still the apps' read path, so there
  is **no user-visible change and no slowdown** — the rows are an indexed query
  surface for research and exports.
- Rows are written **best-effort** on each case save (a sync failure can never block
  a clinical save) and are reconciled (delete + re-insert) so they can't drift.
  Backfill script (`scripts/backfill-relational.ts`) populates existing data.

### Migration
- `20260618000000_relational_clinical_rows` — additive: 6 new tables + 6 nullable
  `CaseEvent` columns. No existing column changed or dropped.

---

## [1.1.1] — 2026-06-17

### Fixed
- **CORS preflight** now allows `PUT` and the newer mobile/event headers (`x-lospor-intraop-updated-at`, `x-lospor-force-update`, `x-lospor-source`, `x-idempotency-key`). Browser/PWA intraoperative edits, conflict-detected saves, and idempotent offline replay previously failed preflight even though the routes would have accepted them (native was unaffected).
- **Finalised cases are now protected on the event `PUT` path** (edit/delete reconciliation), matching `POST`/`PATCH` — a finalised intraoperative record can no longer be modified.
- **Case codes use the current calendar year** (yearly numbering per user) instead of the user's registration year.
- **HOD dashboard scoped to its own institution** — the dashboard queried the database directly and showed a Head of Department *every* case across all institutions; it now restricts to the HOD's own institution (a HOD with no institution sees only their own cases). Cross-institution data exposure fixed.
- **Constant-time login** — login no longer returns early for unknown emails and uses a valid bcrypt dummy hash on both web and mobile paths, so response time can't reveal whether an email exists.
- **Desktop "Ongoing cases" button** now reads the paginated `/api/cases` response (`{ cases, … }`) instead of expecting a raw array.
- **Transfer route** now applies the explicit HOD null-institution guard used elsewhere (a HOD with no institution falls back to owner-only).
- **Unfinalize undo window** extended from 5 to 30 minutes to match the window shown in the apps.
- README quick start uses `prisma migrate deploy` instead of `prisma db push`.

### Removed
- Stale developer scripts (`prisma/scrape-institutions.ts`, `scripts/process-data.ts`).

---

## [1.1.0] — 2026-06-15

### Intraoperative event store (event-sourcing)
- New immutable `CaseEvent` table is the source of truth for the intraoperative chart. The legacy `keyEvents` projection is now a cache rebuilt from these rows, so every reader (web/mobile chart, printable protocol, OMOP export) is unchanged.
- Concurrent intraoperative writes are serializable and idempotent (keyed by event id) — two clinicians documenting the same live case can no longer drop each other's entries, and offline retries never create duplicates.
- Edits and deletes are append-only: an edit supersedes, a delete tombstones, and the full history is preserved for audit/medico-legal purposes.
- Infusion rate changes are now projected as rate segments, so the chart shows the correct rate before and after each change.
- Intraoperative stale-write conflict detection (matching pre-op/post-op); malformed conflict-timestamp headers are rejected instead of silently skipped.
- Every event write is Zod-validated, PII-checked, and audit-logged.

### Security & reliability
- Rate limiting moved to a shared, serverless-safe database store (the previous in-memory limiter reset per instance in production).
- Added per-IP login throttling alongside per-email.
- Token revocation is now checked against the database on every request (closes a cold-start window); new `POST /api/auth/logout` revokes a mobile token server-side.
- Fixed an authorization edge case for Heads of Department with no assigned institution; added consistent CORS preflight handling to all mobile-called routes.
- An admin or Head of Department can now clear a stale case lock instead of being blocked by it.

### Wording
- Softened "GDPR compliant" to "designed with GDPR principles" pending formal legal review.

### Database
- New migrations: `CaseEvent` table and versioning columns, shared `RateLimit` table, `IntraoperativeRecord.updatedAt`.

---

## [1.0.0] — 2026-06-11 "First public release"

This is the first stable, publicly tagged release of LOSPOR. It consolidates all development from v0.1.0 through the v0.4.x series into a production-ready perioperative case register with a full web app, mobile-companion API, and PWA.

### Authentication & user management
- User registration with admin approval flow — new accounts are pending until an administrator approves them
- Login with bcrypt password hashing (cost 12) and per-email rate limiting (10 attempts / 15 min)
- Registration rate limiting (5 attempts / hr / IP)
- NextAuth v5 JWT sessions with 8-hour expiry and DB-backed JTI blocklist for instant revocation on sign-out
- Bearer token endpoint (`POST /api/auth/token`) for mobile companion login — same security guarantees as web session
- User profile API (`GET /api/user`) returning name, title, role, and institution for mobile settings
- Admin panel: pending registration approvals, Head of Department role requests, role management, paginated/filterable audit log

### Security & GDPR compliance
- Security headers: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, Content Security Policy
- Server-side PII detector on all free-text fields: Bulgarian EGN (with checksum), 7+ digit sequences, date patterns, email addresses, two consecutive capitalised words (name heuristic). PII blocks are logged to the audit trail and returned as a 400 with a plain-language explanation
- GDPR design: no patient identifiers ever stored. Case codes are auto-generated (`YYYY-NNNN`). The printable protocol renders blank fields for patient name and ID — the clinician fills them in by hand after printing
- All AI inference uses **Mistral AI (EU — La Plateforme)** exclusively. US-hosted providers (Groq, OpenAI, etc.) are not used anywhere in the codebase
- Privacy Policy v1.1 — sub-processors section now explicitly covers Mistral AI image processing for lab scan and monitor scan
- Terms of Service v1.1 — new clause 3a documents user obligations when using AI image scanning features
- AGPL-3.0 `LICENSE` file with `Copyright (C) 2026 Kaloyan Dzhunov`

### PWA and mobile redirect
- Progressive Web App support: `src/app/manifest.ts`, offline fallback page, `PwaInit` component for service-worker registration
- `proxy.ts` overhauled: mobile browser user agents redirected to `MOBILE_PWA_URL`; applies on all non-API, non-auth routes; configurable via environment variable so the PWA can be served from a separate static deployment without changing application code

### Dashboard
- Defaults to all accessible cases (full history, reverse chronological)
- Clickable stat cards: Today, This month, Active, Drafts, Awaiting postop, Complete, Handovers, ICU
- Horizontal scope chip rail always visible on load
- Full-text dashboard search (`DashboardSearch` component): searches by case code and procedure name
- Pagination via `?skip` / `?take` on `GET /api/cases` (capped at 200 per request)

### Case lifecycle
- Status chain: `DRAFT → IN_CONSULTATION → AWAITING_ALLOCATION → IN_PROGRESS → AWAITING_POSTOP → AWAITING_REVIEW → COMPLETE`
- `AWAITING_REVIEW` status: automatically entered when postop is saved on an in-progress case; 30-minute review window before finalisation
- Case presence lock: one active editor per case at a time (`CaseLock` DB model, 30 s TTL, 15 s heartbeat). Other devices enter **Watching** mode with a takeover option
- Conflict detection: stale mobile writes rejected (409) if the server record was updated since the client last loaded it
- Live case refresh: SSE event stream (`GET /api/cases/[id]/stream`) with polling fallback
- Case deletion (non-finalised only), unfinalize API for the review window, print-token API for PDF generation

### Preoperative assessment form
- Demographics: age, sex, height, weight with live BMI, IBW (Devine formula), and ABW badges
- ICD-10/ICD-11 diagnosis and procedure tagging with autocomplete
- Medical history: ICD-coded comorbidity tags grouped by body system
- Current medications: drug name / INN search backed by Bulgarian Drug Agency register (3,661 entries)
- Clinical anamnesis: allergies (allergen search + latex flag), family anaesthesia problems, dental flags, smoking and substance abuse habits
- Airway assessment: Mallampati, mouth opening, thyromental distance, neck mobility, ULBT, Cormack-Lehane, feature flags; entire block can be marked Unable to Obtain
- Vitals: BP, HR, SpO₂, temperature, RR — each with individual Unable to Obtain toggles
- Lab results: searchable panel with reference-range highlighting for 100+ tests across 9 categories
- **AI lab scan**: camera/gallery upload of printed lab reports; Mistral vision model extracts results against a fixed catalogue of recognised tests with canonical units (Hb g/L, Hct ratio, glucose mmol/L, etc.); unknown test names are discarded server-side before the preview reaches the user
- Risk scores: RCRI (0–6), APFEL (0–4), STOP-BANG (0–8) — computed live; inputs auto-derived from demographics where possible
- AI pre-operative advisor: sends only structured clinical fields (no free text) to Mistral; opt-in per case; consent recorded in audit log; advisory disclaimer displayed in UI
- Auto-save 1.5 s after last change; validation scrolls to the first failing section on submit

### Intraoperative form and timetable
- Timing: operative month/year (no exact calendar date stored), start/end time, next-day flag for midnight-crossing cases, auto-computed duration
- Anaesthesia technique tree: General (ETT, LMA, TIVA variants), Neuraxial (Spinal, Epidural, CSE, DPE with level selectors), Peripheral blocks (Upper / Lower / Trunk / Head & Neck / Ophthalmic), Sedation, Local, Other
- Volatile agent and fresh gas: agent selector (Sevoflurane, Desflurane, Isoflurane); FGF 0–100 L/min; carrier gas (O₂ always present, Air and N₂O mutually exclusive); FiO₂ 0–100%
- Position: 15 positions across 5 groups; multiple selections allowed
- Monitoring: 18 modalities across 4 groups; selecting a monitor adds its vitals row to the timetable automatically
- Airway: device, tube size, cuff state, PEEP, ventilation mode tree, tools, Cormack-Lehane, DLT/endobronchial details
- Vascular access: Arterial (6 sites), Peripheral IV, PICC (3 sites), Central line (5 sites); size, French/gauge presets, depth
- Preop summary card above the timetable: ASA, BMI, IBW, ABW, vitals, Mallampati, airway flags, allergies, comorbidities, abnormal labs
- Equipment suggestions card: ETT/LMA size, TV/RR/PEEP/I:E, fluid rate, Foley/NGT depth — derived from demographics
- **AI monitor scan**: camera/gallery upload of the anaesthesia monitor screen; Mistral vision model extracts visible vital signs into the entry fields; user reviews before saving
- Fluid balance: crystalloids, colloids, blood products with notes, urine output
- Complications free text (max 2,000 chars)

### IntraopTimetable
- 5-minute grid, starts at 1 hour (12 columns), auto-expands as the live clock advances
- Live orange "now" marker, advances every 10 s; selected column follows clock automatically
- Vitals rows (BP stacked bar, HR, SpO₂, EtCO₂, temperature) rendered dynamically from active monitors
- Drug boluses: side-panel quick-pick or in-cell picker; drag to move; Del to delete; → to copy; keyboard 0–9 for dose; IBW-pre-filled dose slider for 28 common drugs
- Infusions: continuous colour bar; mid-infusion rate change; stop at any column; total dose computed from rate × time segments
- IV fluids: 12 types; end with partial or full volume; total volume shown
- Inhalational agents: continuous bar; switching agents auto-stops the previous
- Auto-fill vitals: carries forward EtCO₂, SpO₂, temperature from the previous column as the clock advances (toggle in Settings)
- Auto-fill BP & HR: secondary toggle also carries forward systolic BP, diastolic BP, and heart rate
- Backfill on reopen: fills any gap to the current clock time using the last recorded values when an in-progress case is reopened
- SVG chart / grid toggle; Undo/Redo (Ctrl+Z / Ctrl+Shift+Z); keyboard legend

### Postoperative form
- Modified Aldrete score (Activity, Respiration, Circulation, Consciousness, SpO₂) with auto-summed total
- Recovery vitals: SBP, DBP, HR, SpO₂, temperature (each with stepper/slider entry)
- Pain NRS (0–10), PONV flag
- Disposition: Ward / PACU / ICU with clinical notes
- Handover checklist: 8 groups, 28 items; group header turns green when all items checked
- Complications free text
- Auto-save 1 s after last change

### Printable protocol
- Two-page A4 landscape PDF: intraoperative timetable (page 1), pre- and postoperative summary (page 2)
- Patient identity fields rendered blank — filled in by hand after printing
- Timetable scales automatically to case duration

### Data export
- `GET /api/export` — authenticated users can download a JSON export of their account, all cases, and audit log entries (GDPR Article 15)

### ICD-11 search and translation
- `GET /api/search/icd11` — live WHO API lookup with Bulgarian label cache (`Icd11Alias` table)
- `src/lib/mistral-translate.ts` replaces the misnamed `groq-translate.ts`; uses `open-mistral-7b` on Mistral EU

### OMOP mapping
- `src/lib/omop-mapper.ts` — maps internal case fields to OMOP CDM concepts for future de-identified research export

### Error monitoring
- Sentry SDK integrated (`sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`) for runtime error tracking in production

### Testing
- `src/__tests__/` — Vitest unit-test suite; `vitest.config.ts` configured for the Next.js app-router environment

### Database migrations
- Formal Prisma migration system: `prisma migrate deploy` runs automatically on Vercel build before `next build`
- `20260530000000_init` — baseline migration for all tables at v0.4.3
- `20260609000000_intraop_gas_and_recovery_vitals` — adds FGF/carrierGas/FiO₂ to IntraoperativeRecord; adds recovery SBP/DBP/HR/SpO₂ to PostoperativeRecord; adds `Icd11Alias` table; adds performance indexes; **removes** `timeInRecoveryMin` from PostoperativeRecord

---

## [0.4.4] — 2026-06-09 "Intraop and recovery parity"

### Added
- Persisted FGF, carrier gas, and FiO2 fields with a production migration and mobile/web API support.
- Recovery SBP, DBP, heart rate, SpO2, and temperature on web and mobile with shared clinical controls and initial values matching preop ranges.
- Comprehensive stored-data reference in `docs/data-model.md`.

### Changed
- Gas entry now uses FGF 0-100 L/min, O2 with mutually exclusive Air/N2O, and FiO2 0-100%.
- Selected anaesthesia techniques include their category in compact labels.
- Case summaries and generated protocols display the current gas model and postoperative recovery vitals.

### Removed
- Time in recovery / Time in PACU from the schema, forms, summaries, protocols, translations, and documentation.

### Fixed
- New gas values are no longer discarded by API validation or the Prisma mapper.

---

## [0.4.3] — 2026-05-30 "Data layer"

### Added
- `AWAITING_REVIEW` case status between `IN_PROGRESS` and `COMPLETE`
- Case presence lock (`CaseLock` model, 30 s TTL, 15 s heartbeat); Watching mode with takeover
- Conflict detection on case updates (stale writes rejected with 409)
- Live case refresh via SSE (`GET /api/cases/[id]/stream`) with polling fallback
- New routes: events, lock, stream, unfinalize
- Intraop vitals backfill on reopen
- Prisma formal migration system; Vercel build updated to `prisma migrate deploy && next build`

### Changed
- Dashboard scope rail and stat-card filters
- AI advisor expanded patient context
- Mobile sync mappers (`_mappers.ts`) covering preop, intraop, postop aliases
- Token blocklist pruning; PII pattern expansion; rate limiter pruning
- Pending transfers include `procedureName`

### Removed
- `ShareCaseButton` component

### Fixed
- Production login failure on `AWAITING_REVIEW` enum value

---

## [0.4.2] — 2026-05-24

- Full Bulgarian UI translation for all user-visible strings
- Vercel Analytics (anonymous page-view tracking)
- AI disclaimer corrected (informational summary, not clinical advice)
- Lab scan GDPR notice strengthened
- Privacy Policy PII best-effort notice added

---

## [0.4.1] — 2026-05-24

- Fixed Terms and Privacy links not opening when logged in

---

## [0.4.0] — 2026-05-24

- 30-minute postop review window with countdown banner
- Expanded lab catalogue (100+ tests, 9 categories, reference ranges, search)
- AI lab scan (Mistral vision, GDPR notice, preview-before-import)
- HOD access restricted to own institution

---

## [0.3.0] — 2026-05-21

- GDPR data minimisation: removed staff names, exact surgery date, patient identity fields
- Consent screen, Terms checkbox on registration, `/privacy` and `/terms` pages
- Data export (Article 15) and account deletion (Article 17) under Settings
- Migrated AI to Mistral La Plateforme (EU); removed Groq
- DB-backed JWT revocation, constant-time login, soft-delete

---

## [0.2.0] — 2026-05-20

- Admin approval for registrations; rate limiting; security headers; audit log; Zod validation

---

## [0.1.0] — 2026-04-01

Initial release. Preoperative, intraoperative, and postoperative data entry. PDF export. ICD-11 search. AI advisor. Guided tour. Dark mode. Bilingual (English / Bulgarian).
