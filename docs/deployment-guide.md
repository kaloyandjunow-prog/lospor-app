# Deployment Guide — Database Schema Changes

This document records the database schema changes that must be applied when deploying the v1.0 build to production. It does not cover GitHub or hosting — those steps are handled separately.

---

## Applying the Migration

Run the following command from `lospor-app` to apply all pending migrations to the production database:

```bash
npx prisma migrate deploy
```

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

### Columns Added — IntraoperativeRecord

| Column | Type | Notes |
|--------|------|-------|
| `fgfLitersPerMin` | `Float?` | Fresh gas flow, 0–100 L/min |
| `carrierGas` | `String?` | `"air"` or `"n2o"` (O₂ always implicit) |
| `fio2Percent` | `Float?` | Inspired oxygen fraction, 0–100 |

These replace the previous workflow of using the legacy separate O₂/N₂O percentage and L/min columns for new records.

### Columns Removed — IntraoperativeRecord

| Column | Notes |
|--------|-------|
| `timeInRecoveryMin` | Removed. Time in recovery/PACU is no longer collected. Removed from web forms, mobile app, case summaries, and generated protocols. |

### Columns Added — PostoperativeRecord (recovery vitals)

| Column | Type | Notes |
|--------|------|-------|
| `recoveryBpSystolic` | `Int?` | Systolic blood pressure in recovery (mmHg) |
| `recoveryBpDiastolic` | `Int?` | Diastolic blood pressure in recovery (mmHg) |
| `recoveryHeartRate` | `Int?` | Heart rate in recovery (bpm) |
| `recoverySpO2` | `Float?` | SpO₂ in recovery (%) |
| `temperatureCelsius` | `Float?` | Temperature in recovery (°C) |

These replace the removed `timeInRecoveryMin` and extend the recovery data model with structured vitals.

---

## New Model: `Icd11Alias`

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

`startTime DateTime` on `IntraoperativeRecord` remains **non-nullable** in the Prisma schema. However, it is only set to a meaningful HH:MM value when the user explicitly clicks "Start now" or "Start at" in the intraop form. Background saves and mobile initial loads do not write this field. `computeNextStatus` only promotes a case from `DRAFT` to `IN_PROGRESS` when `intraop.startTime` is a valid HH:MM string — a default or placeholder value does not trigger promotion.

This is enforced in `mapIntraopUpdate` in `src/app/api/cases/_mappers.ts`: `startTime` is only included in the DB update payload when the incoming value is a valid HH:MM string.

---

## Legacy Gas Columns

The following columns remain in the schema for backward compatibility with records created before v1.0:

- `n2oPercent`
- `o2Percent`
- `n2oLitersPerMin`
- `o2LitersPerMin`

They are readable but no longer written by the current forms. Do not remove them until a data migration ensures all existing records have been converted to the new `fgfLitersPerMin` / `carrierGas` / `fio2Percent` fields.
