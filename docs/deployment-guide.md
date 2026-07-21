# Deployment Guide - Database Schema Changes

This document records the database schema and seed steps that must be applied when deploying to production. It does not cover GitHub or hosting - those steps are handled separately.

Sections are kept in release order, newest first. Older sections are retained because they describe migrations that are already applied to production and must not be re-run or edited.

---

## v5.3.0

### Migration: `20260721120000_v530_review_remediation`

Additive only - no column, index or row is dropped. Written by hand rather than generated, because `prisma migrate dev` proposed resetting the database over pre-existing drift; see the comments in the migration file for the reasoning behind each statement.

| Change | Object | Notes |
|--------|--------|-------|
| Enum value | `Sex.UNKNOWN` | "Not recorded" is distinct from "recorded as other". Existing `OTHER` rows are deliberately left alone - we cannot know retrospectively which of them meant "unknown". |
| Column | `CaseTransfer.previousCaseCode` | A transferred case may be renumbered into the recipient's sequence; without this the printed record and the database disagree with no way to reconcile them. |
| Index | `AuditLog(userId, createdAt)` | Was a full table scan. |
| Index | `AuditLog(entityId, createdAt)` | Was a full table scan. |
| Unique index | `CustomTerm(institutionId, termType, term)` | Dedupe was read-then-write, which races. `NULL institutionId` rows are not covered - Postgres treats NULLs as distinct - which is intentional. |
| Index rename | `OmopConceptRelationship_...` | Cosmetic: Postgres truncated the identifier at creation, so every diff since has proposed the rename. |

### New environment variable: `CRON_SECRET`

**Required in production.** Authorises the nightly retention job declared in `vercel.json` (03:00 daily), which anonymises accounts deleted more than `RETENTION_DAYS` (30) days ago and prunes spent rate-limit counters.

On Vercel this is generated automatically when the platform picks up the cron entry. Confirm it exists under **Settings -> Environment Variables** after deploying. Anywhere else, generate one with `openssl rand -hex 32`.

`/api/internal/purge-deleted` returns `403` and does nothing when the secret is unset or wrong. **This fails safely but silently** - no error surfaces, the job simply never runs, and deleted accounts are retained indefinitely. Verify explicitly after deploying:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/internal/purge-deleted
```

A working job returns `{"ok":true,"retentionDays":30,"scanned":N,"anonymised":N,"rateLimitRowsRemoved":N}`. This is **not** a dry run - it performs the purge, and anonymisation is irreversible.

Environment variables only reach a function at deploy time, so adding the variable in the dashboard has no effect until the next redeploy.

### Chart origin changed - optional reprojection

v5.3.0 redefined column 0 of the intraoperative chart: it was the earliest recorded event, and is now the start time the clinician entered, anchored to the case's real day. Stored `keyEvents` projections written before this change still carry the old origin.

```bash
npm run reproject:cases              # dry run - reports, changes nothing
npm run reproject:cases -- --apply   # rewrite stored projections
```

`CaseEvent` rows are the source of truth and are never touched, so this is re-derivation rather than migration, and is safe to run more than once.

The anchor is deliberately **bounded**: if the earliest event falls more than an hour before, or twelve hours after, the entered start time, the entered value is treated as unreliable and the old behaviour is kept. Some legacy records carry `startTime` encodings that would otherwise collapse a case into a single column or stretch it across a day. **Always read the dry run before applying** - on a register with few cases the output is short enough to check case by case.

---

## Applying the Migration

Run the following command from `lospor-app` to apply all pending migrations to the production database:

```bash
npx prisma migrate deploy
```
After migrations, run the v3.0 seed/backfill/quality sequence:

```bash
npx tsx scripts/seed-athena-vocabularies.ts --vocab-dir /path/to/athena-csvs --filtered-lospor
npx tsx scripts/seed-vocabularies.ts --vocab-dir /path/to/athena-csvs
npx tsx scripts/seed-lab-loinc.ts
npx tsx scripts/seed-option-library.ts
npx tsx scripts/seed-concept-maps.ts
npx tsx scripts/backfill-relational.ts
npx tsx scripts/data-quality-report.ts
```

The order matters. Filtered Athena import is optional for app runtime but required for highest-quality OMOP concept mapping. Vocabularies and labs must exist before concept maps and relational backfill; the option library must exist before fallback snapshots are generated for web/mobile/PWA.

Run Athena import from a local/maintenance machine that has the CSV files and database credentials. Do not run it from Vercel build hooks, serverless API routes, app startup, or any deployed runtime. Vercel should only read the seeded Supabase tables after this step is complete.

Do not edit old applied migration files. Prisma stores migration checksums. Any correction to an already-applied environment must be a new additive migration.

> **Never use `prisma db push` in production.** `db push` bypasses the migration history and can silently alter or drop data. Use it only during local prototyping against a throwaway database.

If you want to preview what SQL will run before applying:

```bash
npx prisma migrate diff \
  --from-schema-datamodel prisma/schema.prisma \
  --to-schema-datasource prisma/schema.prisma \
  --script
```

---

## Migration: `20260609000000_intraop_gas_and_recovery_vitals`

### Columns Added вЂ” IntraoperativeRecord

| Column | Type | Notes |
|--------|------|-------|
| `fgfLitersPerMin` | `Float?` | Fresh gas flow, 0вЂ“100 L/min |
| `carrierGas` | `String?` | `"air"` or `"n2o"` (Oв‚‚ always implicit) |
| `fio2Percent` | `Float?` | Inspired oxygen fraction, 0вЂ“100 |

These replace the previous workflow of using the legacy separate Oв‚‚/Nв‚‚O percentage and L/min columns for new records.

### Columns Removed вЂ” IntraoperativeRecord

| Column | Notes |
|--------|-------|
| `timeInRecoveryMin` | Removed. Time in recovery/PACU is no longer collected. Removed from web forms, mobile app, case summaries, and generated protocols. |

### Columns Added вЂ” PostoperativeRecord (recovery vitals)

| Column | Type | Notes |
|--------|------|-------|
| `recoveryBpSystolic` | `Int?` | Systolic blood pressure in recovery (mmHg) |
| `recoveryBpDiastolic` | `Int?` | Diastolic blood pressure in recovery (mmHg) |
| `recoveryHeartRate` | `Int?` | Heart rate in recovery (bpm) |
| `recoverySpO2` | `Float?` | SpOв‚‚ in recovery (%) |
| `temperatureCelsius` | `Float?` | Temperature in recovery (В°C) |

These replace the removed `timeInRecoveryMin` and extend the recovery data model with structured vitals.

---

## New Model: `Icd11Alias`

> **Superseded:** `Icd11Alias` and `Icd11Code` were dropped in the `20260619100000_v2_database_optimization` migration. This section is kept for historical reference only.

```prisma
model Icd11Alias {
  id        String   @id @default(cuid())
  bgTerm    String   @unique
  enTerm    String
  createdAt DateTime @default(now())
}
```

Purpose: stores Bulgarian search terms mapped to their translated English ICD-11 terms. Enables Bulgarian-language ICD-11 diagnosis search without round-tripping to the WHO API on every query. The `Icd11Code` table (English label + optional Bulgarian label cache) remains unchanged.

---

## Note on `startTime`

`startTime DateTime` on `IntraoperativeRecord` remains **non-nullable** in the Prisma schema. However, it is only set to a meaningful HH:MM value when the user explicitly clicks "Start now" or "Start at" in the intraop form. Background saves and mobile initial loads do not write this field. `computeNextStatus` only promotes a case from `DRAFT` to `IN_PROGRESS` when `intraop.startTime` is a valid HH:MM string вЂ” a default or placeholder value does not trigger promotion.

This is enforced in `mapIntraopUpdate` in `src/app/api/cases/_mappers.ts`: `startTime` is only included in the DB update payload when the incoming value is a valid HH:MM string.

> **Updated in v5.3.0.** `startTime` is stored on a fixed reference date (`2000-01-01`) because only its time-of-day is meaningful, while `CaseEvent.timestamp` is a real instant. Since v5.3.0 it is also the origin of the chart, so anything reading it as an absolute date is wrong. Combine the case's actual day with `startTime`'s time-of-day via `chartAnchorFor()` in `src/lib/case-events.ts` rather than re-deriving that logic.

---

## Legacy Gas Columns

The following columns remain in the schema for backward compatibility with older records:

- `n2oPercent`
- `o2Percent`
- `n2oLitersPerMin`
- `o2LitersPerMin`

They are readable but no longer written by the current forms. Do not remove them until a data migration ensures all existing records have been converted to the new `fgfLitersPerMin` / `carrierGas` / `fio2Percent` fields.


