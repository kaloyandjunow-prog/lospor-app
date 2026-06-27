# Changelog - LOSPOR Web App

## [3.2.1] - 2026-06-27

### Fixed
- Relational-sync background mirror (diagnoses, procedures, comorbidities, labs, medications, vascular accesses, complications, selections, field-status) returned Prisma P2028 on every case save because `syncCaseRelational` wrapped all writes in `db.$transaction([...])`, which is incompatible with Supabase's Transaction-mode PgBouncer (port 6543). All four transaction blocks are now sequential `await` calls; the JSON columns remain the source of truth so atomicity is not required.
- Preop autosave returned a spurious 409 conflict when the conflict-base timestamp was not yet initialised (race condition where the case ID was available from the URL before the case data fetch completed). The client now silently recovers on `reason: "missing_conflict_timestamp"` by adopting the server's current timestamp and retrying once without user intervention.

## [3.2.0] - 2026-06-27

### Added
- **Dedicated finalize endpoint** — `POST /api/cases/:id/finalize` validates that preop, intraop (with startTime and at least one technique), and postop (with ≥1 Aldrete subscore and a disposition) are present before setting the case to COMPLETE. The immutable snapshot is written first; status is only committed after the snapshot succeeds.
- **Case creation idempotency** — `POST /api/cases` now accepts an `X-Idempotency-Key` header. If a case already exists for this user with that draft key, the existing case is returned rather than creating a duplicate. Useful when the mobile app creates a case while offline and the network drops before the response arrives.
- **`clientDraftId` on Case** — new nullable column + `@@unique([userId, clientDraftId])` constraint. Migration: `20260627000000_case_client_draft_id`.

### Changed
- **CORS production guard** — `next.config.ts` now throws at startup on Vercel production if `CORS_ALLOW_ORIGIN`/`CORS_ALLOW_ORIGINS` is unset, matching the behaviour of `lib/cors.ts`. Previously it silently fell back to `*`.
- **Case PATCH no longer accepts `status: "COMPLETE"`** — use `POST /api/cases/:id/finalize` instead. PATCH returns 400 with guidance if "COMPLETE" is sent.
- **Zod coercion** — `parseInt` replaced with `Number()` in all schema coerce helpers so `"12abc"` is rejected rather than silently parsed as `12`. Range validation added: `ageYears (0–130)`, `heightCm (30–280)`, `weightKg (0.1–700)`, `bpSystolic (40–300)`, `bpDiastolic (20–200)`, `heartRate (10–350)`, `spO2 (0–100)`, `temperature (25–45 °C)`, `respiratoryRate (0–100)`, `painScoreNRS (0–10)`, `aldreteTotal (0–10)`, and matching recovery vitals.

### Fixed
- Drug allergy and current medications autosave was rejected by the server PII filter because multi-word drug names (e.g. "Morphine Sulfate", "Sodium Chloride") matched the two-capitalised-words name heuristic. Those structured drug-catalogue fields now skip the name check; EGN, long digit sequences, dates, and email detection still apply to them.
- Intraoperative event autosave returned 500 (Prisma P2028 transaction timeout) because Supabase's Transaction-mode PgBouncer (port 6543) cannot sustain interactive multi-statement transactions. The case PATCH handler now runs all writes sequentially without an interactive transaction; the existing pre-read conflict detection is unchanged.

## [3.1.0-hotfix] - 2026-06-27

### Fixed
- PWA and mobile login was blocked with 403 because the new CSRF origin check applied to `/api/auth/token`, which is called cross-origin by the PWA. Auth token-issuance endpoints (`/api/auth/token`, `/api/auth/register`, `/api/auth/logout`) are now exempt from the origin check — they are protected by rate limiting and bcrypt instead.

## [3.1.0] - 2026-06-25

### Security and privacy hardening
- Cookie-authenticated state-changing API requests now require a same-origin `Origin` or `Referer`; bearer-token mobile/PWA requests remain supported.
- Clinical PII validation is now field-aware for intraoperative events: controlled labels such as `Face Mask`, `To PACU`, and `General Anaesthesia` are allowed, while free-text event notes remain checked.
- AI lab-reading uploads now enforce the actual parsed base64 payload size instead of relying only on `Content-Length`.
- Login no longer probes pending-registration state after failed credentials, and the legacy pending-check endpoint now returns a generic response, reducing account-state enumeration.
- Account deletion/privacy copy now matches the implemented soft-delete behavior: access is disabled immediately and tokens are revoked; further deletion/anonymisation follows retention policy.
- CORS deployment examples are aligned to `pwa.lospor.org`, with `CORS_ALLOW_ORIGINS` documented as a future multi-origin comma-list.
- Mistral API calls now retry against the global Mistral API base if a configured regional endpoint returns `regional_inference_not_allowed` (`code: 1914`), covering lab scan, vitals scan, and the pre-operative AI advisor.
- AI privacy copy now describes the configured AI provider without overclaiming a fixed inference region.
- Added synced `User.preferences` storage for mobile/PWA intraoperative favourite bolus drugs and infusions.

## [3.0.0] - 2026-06-25

### Summary
- Promotes the accumulated June 2026 work from the planned 2.x line to **v3.0.0** because the release changes the database shape, canonical clinical libraries, mobile/web parity contract, intraoperative event model, research export surface, and verification baseline.
- `package.json` / lock metadata now use `3.0.0`. Mobile release metadata is aligned separately in `lospor-mobile`.

### Added - Canonical option and clinical libraries
- Added the shared `OptionLibrary` table and `GET /api/library/[category]` endpoint as the single catalogue for web, mobile, and PWA pickers.
- Library categories now cover positions, techniques, airway management, ventilation, monitoring, premedication drugs, bolus drugs, infusions, inhalational agents, fluids, clinical events, sex, blood group, airway grades, disposition, handover items, and numeric range specs.
- Web and mobile now share canonical codes for clinical techniques, monitoring groups, drug/infusion/fluid/agent choices, and fresh-gas settings.
- Added bundled option-library fallback snapshots, a protected internal snapshot endpoint, snapshot freshness checks, and visible cached/offline-library banners.

### Added - Canonical labs, units, and AI scanning
- Web and mobile now use the same canonical lab catalogue, units, LOINC mappings, and reference ranges.
- AI lab extraction scans for the full canonical lab catalogue and imports only recognised results; unknown/free-form lab names are discarded.
- Lab rows store parsed numeric value, canonical unit, LOINC code, reference low/high, abnormal flag, source, and mapping metadata.
- Serum/peripheral glucose is stored as a timed intraoperative measurement with LOINC `2345-7` and canonical `mmol/L`.

### Added - Research-grade database rows
- Added normalized/queryable rows for diagnoses, procedures, comorbidities, lab results, medications, vascular access, premedication, complications, selections, and event timeline data.
- Added local bilingual `ConceptMap` for ICD-10 English/Bulgarian labels, LOINC, ATC, INN, and LOSPOR option values.
- Known OMOP concept IDs are stored where confidently mapped; source-only and unmapped values remain explicit rather than faking concept IDs.
- Added `ClinicalFieldStatus` for key-field missingness and provenance metadata on normalized rows.
- Added `scripts/seed-concept-maps.ts`, `scripts/data-quality-report.ts`, expanded `scripts/backfill-relational.ts`, and guarded `scripts/wipe-dev-clinical-data.ts`.

### Changed - Intraoperative timetable and event sourcing
- Web intraop timetable now writes bolus drugs, infusion start/rate-change/stop, agent start/stop, fluid start/stop, gas changes, clinical events, and vitals through the same append-only `CaseEvent` API used by mobile.
- The legacy `keyEvents` JSON is rebuilt as a projection/cache from active event rows.
- Infusion, agent, fluid, and fresh-gas-flow bars extend correctly when a case is reopened while still running.
- Fresh gas flow is represented as a timeline lane/bar with FGF, FiO2, carrier gas, calculated FiAir/FiN2O, and FiO2 clamped to the valid clinical range.
- Legacy scalar gas entry rows were removed from the active UI and the legacy scalar gas DB columns are no longer written.

### Changed - Mobile/web parity and sync
- Mobile maps payloads to canonical web/API field names before persistence.
- Case updates use timestamp/header conflict detection so stale mobile edits do not silently overwrite newer web edits.
- Mobile autosave queues offline patches, flushes queued saves, and exposes conflict/queued/saved states.
- Live case refresh uses polling/SSE fallback so mobile can see web-side changes and web can see mobile-side changes.
- Mobile now exposes web-parity actions/surfaces for case details, printable protocol, share summary, audit logs, admin console, handover, postop, AI advisor, and intraop timetable.

### Changed - Preop, postop, and form quality
- Mobile preop was redesigned into section-based, scrollable, thumb-friendly entry with inline autocomplete and context-specific number controls.
- Diagnosis and comorbidity fields use the local Bulgarian/English ICD-10 database.
- Medication allergy is stored using `Medication.kind = ALLERGY`; deselecting the allergy boolean clears associated allergy text/rows.
- Difficult-airway notes, team notes, physical exam report, and event complication notes are limited to 500 characters and cleared when their controlling boolean is false.
- General inhalational anaesthesia auto-selects expected monitoring defaults: SpO2, NBP, ECG, temperature, and EtCO2.

### Changed - OMOP/export and research reproducibility
- Added local Athena/OMOP vocabulary import tables and `scripts/seed-athena-vocabularies.ts` for full vocabulary-backed concept resolution.
- `ConceptMap` now stores mapping method, confidence, review state, mapping notes, and Athena vocabulary version.
- OMOP export now reads from normalized rows and active `CaseEvent` rows instead of parsing legacy blobs.
- Export includes labs, vitals, intraop glucose, gas settings, bolus drugs, infusions, inhalational agents, vascular access, selections, complications, postop recovery vitals, Aldrete subscores, and provenance/version metadata.
- Export bundles now include table counts, mapping summary, de-identification metadata, and quality warnings; app exports warn rather than block.
- Export `source_version` and snapshot schema version are now `3.0.0`.
- Free-text fields are redacted before AI advisor/export use; coded ICD/LOINC/ATC/option values are preserved.

### Security, tooling, and migration notes
- Centralized role authorization with `requireRole`; case-scoped vitals scan now enforces case access before sending images to AI.
- Production CORS is fail-closed without explicit allowed origins; login, registration, token revocation, audit logging, HOD scoping, transfer checks, and admin routes were hardened.
- Mobile now has baseline ESLint, typecheck, and Vitest coverage; web and mobile deployment checks cover typecheck, lint, tests, Expo doctor, and build prerequisites.
- Do not edit old applied Prisma migrations. Fresh/live deploys must run migrations, seed vocabularies, seed labs, seed option library, seed concept maps, generate/fetch option-library fallback snapshots, and run relational/data-quality backfills.

---
All notable changes to the web application are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [2.3.0] — 2026-06-20

### Added — Shared Option Library
- New `OptionLibrary` table: one shared, modular catalog for every intraop/preop pill-button option (position, technique, vascular access, airway management, monitoring, premedication drugs, intraop drugs, intraop infusions, inhalational agents, intraop fluids, clinical events) — replaces hardcoded lists that had drifted between web, mobile, and even within mobile itself.
- New master endpoint `GET /api/library/[category]`, consumed by both apps via a `useOptionLibrary(category)` hook.
- Seed content lives in one small file per category under `lospor-app/src/data/option-library/`; `scripts/seed-option-library.ts` is a thin orchestrator — adding or editing an option no longer touches application code. Also exposed as a protected production maintenance action, `POST /api/admin/maintenance/seed-option-library` (ADMIN + `ALLOW_MAINTENANCE_SEED=true` required, audit-logged, idempotent).
- Fixed a real mobile/web data mismatch surfaced by the migration: mobile stored different technique codes than web for the same clinical techniques (e.g. `GENERAL_COMBINED` vs `GENERAL_BALANCED`). Both apps now share one code per technique.
- Monitoring gained a genuine `respiratory` group (capnography, temperature) shared by both apps, replacing a display-label workaround that only relabelled "Standard" as "Respiratory" in the UI.

### Added — Offline-safe option library
- Web and mobile now fall back to a snapshot of the option library bundled into the app itself if a device has never successfully synced and has no prior cache either (first load/install + no connectivity) — previously this showed silently empty pickers with no fallback at all.
- A visible banner appears whenever any picker is running on cached or bundled (non-live) data, so a clinician never silently trusts a list without knowing it might be stale; a background retry every 30s swaps in live data the moment connectivity returns, no reload needed.
- A successful-but-empty `200 []` from `/api/library/[category]` is now treated the same as a fetch failure (never trusted as "live") — an unseeded live DB can no longer silently blank out a picker with no banner.
- `npm run build` now regenerates the bundled snapshot fresh from the database before every Vercel deploy (`scripts/generate-option-library-fallback.ts`), and **fails the build** if the DB is unreachable or any category comes back empty. Mobile/EAS fetches the snapshot from a shared-secret-protected web endpoint (`GET /api/internal/option-library-snapshot`) via an `eas-build-pre-install` hook, since EAS can't reach the database directly. A separate content-hash staleness check (`npm run check:option-library-fallback-fresh`) is available for PR/CI use. See `docs/post-migration-seeds.md` for the env vars that need configuring on Vercel/EAS for this to be active.

### Changed — Web Intraop Timetable
- New dedicated **Infusions** row, separate from the Drugs row — starting an infusion no longer requires picking a drug and then choosing "Bolus" vs "Infusion"; Drugs is bolus-only, Infusions has its own entry point, matching the mobile app's separated Drug/Infusion/Fluid/Agent layout.
- Web's intraop timetable now writes real `CaseEvent` rows (bolus, infusion start/rate-change/stop, agent start/stop, fluid start/stop, clinical events) via the same `/api/cases/[id]/events` endpoint mobile already used, instead of only the legacy `keyEvents` JSON blob. Deleting an infusion or fluid now reconciles the full event log server-side.
- IntraopForm.tsx and IntraopTimetable.tsx shrank substantially as a result of the option-library extraction (hundreds of lines of hardcoded option data removed from each).

### Changed — Code quality
- `TechniqueTree.tsx`, `VascularAccessTree.tsx`, and `IntraopTimetable.tsx` no longer populate the option-library data by mutating module-level arrays inside `useMemo`. Every category is now a plain `useMemo`-derived value scoped to the component itself — removes a real (if previously low-impact) risk of two instances of the same component clobbering each other's data, and removes the only place in this codebase doing side effects inside `useMemo`. `calcInfusionTotal`'s weight-basis lookup, the one piece genuinely shared across components/files, now takes it as an explicit parameter instead of reading shared state.

### Security
- Centralized role-authorization (`requireRole`) — replaces 14+ separate `role !== "ADMIN"` checks and two bespoke case-ownership reimplementations with one audited helper.
- OMOP export and the AI advisor's data path now redact free-text fields that could carry identifying information, instead of relying solely on write-time blocking.
- `admin/validate-relational` renamed to `admin/repair-relational` to reflect what it actually does (rewrites the relational mirror, not a read-only check); relational-sync failures are now written to the audit log instead of only a server console line.

### Fixed
- Stale ICD-11 references in live UI text (guided tour, i18n strings, AI translation prompt) corrected to ICD-10; removed the unused, dead `groq-translate.ts`. "Anonymised" language in live UI text and legal copy (GDPR protocol notice, Terms of Use, OMOP export metadata) corrected to "de-identified/pseudonymised," matching the project's own established wording.
- Corrupted comment-divider text (mis-encoded box-drawing characters) cleaned up across the codebase.
- A case closed mid-infusion (or mid-fluid, mid-agent) and reopened later now shows the running bar correctly extended to the current time on load, instead of frozen wherever it was at the last save. The client-side timetable extends non-stopped segments using the user's local wall clock; server-side read-time extension was intentionally removed because stored HH:MM values are not UTC instants. Rate-change boundaries are untouched, so per-segment infusion totals stay correct across the extension.
- `package-lock.json` in both `lospor-app` and `lospor-mobile` was still pinned at `2.1.1` despite `package.json` reading `2.3.0`.

### Migration notes
- `LibraryCategory` was expanded after the original option-library migration. Existing environments must receive the additive `ALTER TYPE ... ADD VALUE` migration before `scripts/seed-option-library.ts` runs, otherwise categories such as `SEX`, `AGE_RANGE`, and `HANDOVER_ITEM` cannot be inserted.
- Confirm the live Supabase `_prisma_migrations` state before deployment if the enum was previously repaired manually or drifted outside Prisma; an edited historical migration file will not repair an already-applied environment.

### Backfill note
- A case whose intraop data predates this release's web event-wiring still gets a one-time backfill of `CaseEvent` rows the first time it is touched through the events API. Current code reconstructs timestamps from the intraop record day plus the stored start-time/5-minute column offset where possible, and writes `source: "backfill"` because those rows were not submitted by either app. Legacy intraop `startTime` values may still use the schema's `2000-01-01` time-only convention; that dummy date is not the event backfill source label.

## [2.1.1] — 2026-06-19

### Changed — Release Hardening
- Centralized role-access logic so `HEAD_OF_DEPT` users without an institution fall back to their own cases instead of matching null-institution records.
- Expanded the server-side PII gate across the major clinical free-text fields, including airway notes, blood product notes, medication/allergy text, premedication text, physical exam report, intraoperative complications, and postoperative disposition notes.
- Production CORS now fails closed on Vercel when `CORS_ALLOW_ORIGIN` is not configured.
- Bulgarian ICD-10 diagnosis/comorbidity search now stores code-first tags with English/Bulgarian label snapshots and uses `labelBg` for Bulgarian UI display.
- Documentation language now consistently describes LOSPOR data as de-identified/pseudonymised with no direct patient identifiers, not absolutely anonymised.
- OMOP wording clarified as a partial/OMOP-inspired research export until full concept mapping is complete.

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
- New `CaseSnapshot` table: full-case snapshot written on COMPLETE transition (one row per case, updated on re-finalization).
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

