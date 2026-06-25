# Deployment Guide - Database Schema Changes

This document records the database schema and seed steps that must be applied when deploying the v3.0 build to production. It does not cover GitHub or hosting - those steps are handled separately.

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

---

## Legacy Gas Columns

The following columns remain in the schema for backward compatibility with older records:

- `n2oPercent`
- `o2Percent`
- `n2oLitersPerMin`
- `o2LitersPerMin`

They are readable but no longer written by the current forms. Do not remove them until a data migration ensures all existing records have been converted to the new `fgfLitersPerMin` / `carrierGas` / `fio2Percent` fields.


