# Changelog — LOSPOR Web App

All notable changes to the web application are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.4.3] — 2026-05-30 "Data layer"

### Added
- `AWAITING_REVIEW` case status between `IN_PROGRESS` and `COMPLETE` — automatically promoted when postop data is saved on an in-progress case
- Case presence lock: one active editor per case at a time across all devices; other devices enter read-only **Watching** mode with a takeover option (`CaseLock` DB model, 30 s TTL, 15 s heartbeat)
- Conflict detection on case updates: stale mobile writes are rejected if the server record has been modified since the client last loaded it
- Live case refresh: SSE event stream (`GET /api/cases/[id]/stream`) with polling fallback so web and mobile see each other's changes in near-real time
- New API routes: `POST /api/cases/[id]/events` (append event), `GET/DELETE /api/cases/[id]/lock`, `GET /api/cases/[id]/stream`, `POST /api/cases/[id]/unfinalize`
- Intraop vitals autofill: backfill on reopen fills any gap between the last recorded vitals column and the current time using the last known values
- Settings → Automation: "Backfill on reopen" toggle to enable/disable the gap-fill behaviour
- Prisma migration system: baseline migration `20260530000000_init` replaces ad-hoc `prisma db push` for schema changes; Vercel build command updated to `prisma migrate deploy && next build`
- Docs: `docs/mobile-companion.md`, `docs/preoperative-assessment.md`, `docs/intraoperative.md`, `docs/postoperative.md`
- `src/lib/constants.ts` — shared server-side constants
- `src/lib/caseEmitter.ts` — in-process event emitter for SSE fan-out
- `ConflictModal`, `LiveCaseUpdater`, `WatchingBanner` components
- `useCaseLock` hook

### Changed
- Dashboard: stat cards are clickable scope filters; "Awaiting postop" scope added; scope rail always visible on load
- AI advisor: expanded patient context (allergies, medications, labs, comorbidities, vitals, risk scores) in the system prompt
- PreopForm: validation now scrolls to the first failing section; section structure refined
- IntraopTimetable: column count auto-expands as the live clock advances; per-column vitals entry now supports backfill
- NumberStepper: hold-to-repeat on `+`/`-` buttons; slider range respects field-level min/max
- Cases API (`GET /api/cases`): pagination via `?skip` and `?take` (capped at 200 per request)
- Mobile sync: `_mappers.ts` maps mobile field aliases to canonical DB field names for preop, intraop, and postop; risk scores and postop aliases preserved on round-trip
- Token blocklist: periodic pruning of expired JTIs to prevent unbounded in-memory growth
- PII check: additional patterns (IBAN-like sequences, additional name heuristics)
- Rate limiter: pruning of expired windows on new entry creation
- Pending transfers API includes `procedureName` so mobile transfer list shows case context
- Proxy middleware (`proxy.ts`) updated for new API surface

### Removed
- `ShareCaseButton` component — share functionality moved inline to case detail page

### Fixed
- Production login failure (`P2023 — Value 'AWAITING_REVIEW' not found in enum 'CaseStatus'`): Prisma client committed to git now includes `AWAITING_REVIEW`; DB enum updated via `ALTER TYPE`

---

## [1.0.0] — 2026-05-26

### Added

#### Authentication & User Management
- User registration with admin approval flow — new accounts are pending until an administrator approves them
- Login with bcrypt password hashing and per-email rate limiting (10 attempts / 15 min)
- Registration rate limiting (5 attempts / hr / IP)
- NextAuth v5 JWT sessions with 8-hour expiry
- JTI blocklist for session invalidation on sign-out
- Bearer token endpoint (`POST /api/auth/token`) for mobile companion login — same bcrypt + rate limiting as web
- Admin panel: pending registration approvals, Head of Department role management, institution-scoped access control
- Audit log: all case create/update/delete/finalise/PII-blocked events logged to DB and viewable in admin panel (paginated, filterable by action)

#### Security & Compliance
- Security headers on all responses: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, Content Security Policy
- Server-side PII detector on all free-text fields: EGN (Bulgarian national ID with checksum), 7+ digit sequences, date patterns, email addresses, two consecutive capitalised words (name detection)
- PII blocks are logged via audit log before returning a 400 to the client
- GDPR design: no patient identifiers ever stored. Case codes are auto-generated (`DDMMYYYY-NN`). Printed protocol renders blank lines for name and ID — clinician fills by hand after printing.
- Supabase PostgREST API disabled; application uses Prisma direct connection only
- AI system prompt worded as informational only (not clinical decision support per EU MDR)
- Lab scan disclaimer: explicit instruction to crop patient identifiers before upload

#### Case Lifecycle
- Dashboard statistics are clickable filters, and the case list can be scoped to All, Today, This month, Active, Drafts, Awaiting postop, Complete, Handovers, or ICU while defaulting to all accessible cases
- Case creation with sequential date-scoped code (`DDMMYYYY-NN`, e.g. `14052026-01`)
- Case status progression: Draft → In Progress (automatic on first intraop save) → Complete (manual finalise)
- Case list (dashboard) with status indicators and last-updated timestamp
- Case deletion (non-finalised cases only)
- Share summary: copies a `/cases/[id]` link to clipboard
- Printable protocol: browser-print view of the full perioperative record, formatted for A4
- Finalised case redirect: opening an edit URL for a completed case redirects to the summary instead of showing an error
- Private notes: floating popup, auto-saves, not included in AI advisor prompt

#### Case Presence Lock
- One active editor per case at a time across all devices and sessions
- `CaseLock` DB model: 30-second TTL, renewed by heartbeat every 15 seconds
- Any other device opening the same case enters **Watching** mode: all inputs disabled via `<fieldset disabled>`, amber sticky banner displayed
- "Take over editing" button in the watching banner force-releases the existing lock and acquires it for the current device
- Lock released automatically on page close (`beforeunload` + `keepalive` fetch) and component unmount
- Fail-open: network errors never block editing — lock state falls back to "held" on fetch failure

#### Preoperative Assessment Form
- Demographics: age, sex, height, weight with automatic BMI, IBW (Devine formula: `50 + 2.3 × (height_in − 60)` male, `45.5 + 2.3 × (height_in − 60)` female), and ABW (`IBW + 0.4 × (actual − IBW)`) shown as live badges
- ICD-10/ICD-11 diagnosis tagging with WHO API autocomplete, Bulgarian translation via Groq, cached in DB
- Procedure tagging with specialty/CPT code search
- Medical history (comorbidities) as ICD-11 tagged items grouped by body system
- Current medications: drug name / INN search backed by Bulgarian Drug Agency register (3,661 drugs)
- Allergies (allergen search + latex flag), family anaesthesia problems (free text), dental (prosthetics, loose teeth), habits (smoking, substance abuse)
- Airway assessment: Mallampati (I–IV), mouth opening, thyromental distance, neck mobility, Upper Lip Bite Test, Cormack-Lehane grade, feature flags (retrognathia, prominent incisors, facial hair, difficult airway history). Entire block can be marked Unable to Obtain.
- Vitals: BP systolic/diastolic, heart rate (+ arrhythmia flag), SpO₂, temperature, respiratory rate. Each field has an individual Unable to Obtain toggle.
- Lab results: searchable panel (haematology, biochemistry, coagulation, ABG, microbiology) with out-of-range highlighting
- ASA Physical Status (I–VI) with automatic Emergency (E) suffix; AI-powered suggestion based on comorbidities and BMI (advisory only)
- Risk scores — RCRI (0–6), APFEL (0–4), STOP-BANG (0–8) — computed live with colour-coded risk labels (green / amber / red); automatic derivation of sex, BMI, age, and smoking from demographics
- Form auto-saves 1.5 s after the last change once meaningful data is present
- Validation scrolls to the first failing section on submit

#### Intraoperative Form
- Timing: operative month/year, start time, end time (with next-day flag for midnight-crossing cases), auto-computed duration
- Anaesthesia technique tree: hierarchical multi-select covering General (ETT, LMA, TIVA variants), Neuraxial (Spinal → single/continuous → level, Epidural → level, CSE, DPE), Peripheral blocks (Upper / Lower / Trunk / Head & Neck / Ophthalmic), Sedation, Local, Other (free text)
- Position cards: 15 positions across 5 categories (Supine, Lateral, Prone, Lithotomy, Seated/Other)
- Monitoring cards: 18 monitors across 4 groups (Standard, Haemodynamic, Depth/Neuro, Other) — selecting a monitor adds its vital row to the timetable automatically
- Airway management: device (Face mask / LMA / Oral ETT / Nasal ETT / Surgical airway), tube size, cuffed flag, PEEP, ventilation mode tree, airway tools (DL, VL, FOB, etc.), Cormack-Lehane grade, airway notes, DLT details, endobronchial size
- Vascular access tree: Arterial (6 sites) / Venous → Peripheral / Central → PICC (3) / Central line (5); size (G/Fr), size presets, depth from skin
- Preop summary card: amber card above timeline showing ASA, BMI, IBW, ABW, vitals, Mallampati, difficult airway flag, allergies, comorbidities, labs
- Equipment suggestions card: ETT size/depth, LMA size, laryngoscope, Guedel, TV/RR/PEEP/I:E, 4-2-1 fluid rate, Foley/NGT depth, monitoring recommendations — computed from age, weight, IBW, sex, BMI
- Fluids balance: crystalloids, colloids, blood products (with notes), urine output
- Complications: free text (max 2,000 chars)

#### IntraopTimetable
- 5-minute column grid, starts at 1 hour (12 columns), auto-expands as the live clock advances — 1 column per 5 min in scroll mode, full row in expand mode
- Live clock: orange "now" marker advances every 10 seconds; selected column follows the clock automatically
- Vitals rows: systolic/diastolic (rendered as stacked bar), heart rate, SpO₂, EtCO₂, temperature — rows shown dynamically based on active monitors
- Drug bolus pills: add via side panel or in-cell picker; drag to move between columns; Del to delete; → to duplicate to next column; keyboard 0–9 for dose entry; IBW-pre-filled slider for 28 drugs
- Infusions: add via floating prompt (13 drugs with unit/range/colour config); continuous colour bar; rate change mid-infusion; stop at any column; total dose computed from rate × time segments
- Fluids: 12 fluid types; continuous colour bar; end with partial or full volume; total volume shown
- Inhalational agents (Sevoflurane / Desflurane / Isoflurane): continuous bar; switching agents auto-stops the previous
- Auto-extend: active infusions, fluids, and agents extend automatically to the current clock column every tick
- Auto-fill vitals: when the clock advances to a new column, copies EtCO₂, SpO₂, and temperature from the previous column (toggle in Settings → Automation)
- Auto-fill BP & HR: secondary toggle under Auto-fill vitals — also carries forward systolic BP, diastolic BP, and heart rate
- SVG chart / grid chart toggle (pill switch)
- Undo/redo (Ctrl+Z / Ctrl+Shift+Z)
- Keyboard legend displayed below grid
- Scroll mode / expand mode toggle persisted in localStorage
- Time rounding: start time floored to nearest 5 min

#### Postoperative Form
- Modified Aldrete score (Activity, Respiration, Circulation, Consciousness, SpO₂) with auto-summed total
- Pain NRS (0–10), PONV flag, temperature, time in recovery (min)
- Disposition (Ward / PACU / ICU) with notes
- Handover checklist
- Complications (free text)

#### AI Advisor
- EU-hosted Mistral AI (streaming, 16KB payload cap)
- Receives only structured clinical fields — no free text, no patient identifiers
- Opt-in per case (checkbox in preop form)
- Advisory disclaimer displayed prominently in UI

#### Mobile Companion API
- `getAuthUser()` helper: checks Bearer token first, falls back to NextAuth cookie — all 23 protected routes use this transparently
- CORS headers on all `/api/*` routes
- Mobile alias mapping in `_mappers.ts`: incoming mobile field names remapped to canonical DB fields before persistence
- Conflict detection: preop and postop saves include `updatedAt` timestamps; stale mobile writes rejected with 409
- Live update stream: `GET /api/cases/[id]/stream` (SSE) for real-time intraop updates
- Event log API: `POST /api/cases/[id]/events` (append), `PUT` (replace)
- Transfer pending list includes `procedureName` for mobile case list context
- Case lock API: `POST /api/cases/[id]/lock` (acquire), `PATCH` (heartbeat), `DELETE` (release)

#### Settings & Customisation
- Settings panel (automation, display, accessibility categories)
- Auto-fill vitals toggle (EtCO₂, SpO₂, temperature)
- Auto-fill BP & HR secondary toggle (subordinate to auto-fill vitals)
- Timetable layout toggle (expand / scroll)
- Vitals chart expand/collapse persisted
- Dark mode toggle, persisted in localStorage
- Language toggle (English / Bulgarian) via next-intl

### Fixed
- Finalised case edit URL now redirects to summary instead of showing a 403 error
- `crypto.randomUUID()` replaced with `crypto.getRandomValues()` fallback for plain-HTTP dev environments

---

## Prior Development

Versions 0.2.0–0.4.3 covered iterative security hardening, compliance fixes, and mobile bearer token infrastructure — all included and consolidated into the v1.0.0 release above.
