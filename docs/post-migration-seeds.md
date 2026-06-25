# Post-migration seeding and the offline fallback snapshot

`prisma migrate deploy` only creates table structure. Several tables are
useless until a seed script populates them.

## Database seeding (manual, after a migration)

Run these **after every `prisma migrate deploy`** against the target
database (dev or live):

| Script | Populates | Required for |
|---|---|---|
| `npx tsx scripts/seed-athena-vocabularies.ts --vocab-dir <path> --filtered-lospor` | Local OMOP/Athena vocabulary tables | Recommended Supabase-safe import. Stores LOSPOR-needed LOINC/ICD-10/ATC concepts, active `Maps to` relationships, and target standard concepts. |
| `npx tsx scripts/seed-vocabularies.ts --vocab-dir <path>` | `Icd10Code`, `Icd10Synonym`, `Atc`, `Drug` | Diagnosis/comorbidity search, drug search, ATC/INN lookups. Needs Athena vocabulary CSVs locally вЂ” see the script's header comment. |
| `npx tsx scripts/seed-option-library.ts` | `OptionLibrary` (position, technique, vascular access, airway management, monitoring, premedication drugs, intraop drugs, infusions, inhalational agents, fluids, clinical events, preop/postop categorical options, handover items, and numeric range specs) | Every intraop/preop/postop picker and clinical number control in both web and mobile. |
| `npx tsx scripts/seed-concept-maps.ts` | `ConceptMap` | Local bilingual ICD-10, LOINC, ATC, INN, option-library source maps, mapping method/confidence, and OMOP concept IDs where Athena provides a confident standard map. |

These scripts are idempotent (upsert-based) вЂ” safe to re-run any time. This
step is still manual: it's a database write and only needs to happen when a
migration adds a new table or the seed source files change, not on every
deploy.

### Athena import mode

Use `--filtered-lospor` for Supabase and normal deployments. The full Athena CSV
bundle is several GB before database indexes; importing it all can consume many
GB of Supabase storage. Filtered import skips ancestors and synonyms by default
and is enough for LOSPOR's current OMOP export concept mapping.

This script is a local/maintenance step only. Do not run it in Vercel build
hooks, app startup, serverless API routes, or production maintenance endpoints.
The deployed app reads already-seeded Supabase tables; it never reads Athena CSV
files or a local path such as `C:\losardoc\vocab`.

**Production maintenance endpoint**: `POST /api/admin/maintenance/seed-option-library`
re-runs the same upsert logic without shell/DB access вЂ” requires an ADMIN
session AND the `ALLOW_MAINTENANCE_SEED=true` env var (off by default, even
for admins). Every call is audit-logged (success, failure, or blocked).

## The offline fallback snapshot (automatic on every web build)

Web and mobile both fall back to a bundled snapshot of the option library
(`src/data/option-library-fallback.json` in each app) if a device has never
successfully synced and has no cache either вЂ” see `useOptionLibrary` in both
repos. A visible banner shows whenever a picker is running on this
non-live data, with a 30s background retry back to live.

**Web**: `npm run build` now runs `gen:option-library-fallback` first (see
`package.json`) вЂ” every Vercel deploy regenerates the snapshot fresh from
the database before bundling. The build **fails** if the DB is unreachable
or any category comes back empty (an empty category means "not seeded," not
"nothing to show" вЂ” see `scripts/generate-option-library-fallback.ts`).
Requires `DATABASE_URL` to be set in the Vercel build environment (it
already needs to be, for Prisma generally).

**Mobile**: EAS can't reach `lospor-app`'s repo or database directly
(separate repo, separate build environment), so it fetches the snapshot
from web instead. `scripts/fetch-fallback-snapshot.mjs` runs as the
`eas-build-pre-install` lifecycle hook and as the first step of
`npm run export:web`, calling `GET /api/internal/option-library-snapshot`
on the deployed web app with a shared secret header. **Requires these two
env vars to be set as EAS secrets** (`eas secret:create`) for the cloud
build, matching the same `OPTION_LIBRARY_SNAPSHOT_SECRET` value configured
on Vercel:
- `EXPO_PUBLIC_API_BASE` вЂ” same one the app uses at runtime
- `OPTION_LIBRARY_SNAPSHOT_SECRET`

Without those two secrets set in EAS, the fetch script logs a warning and
skips (does not fail the build) вЂ” meaning until they're configured, EAS
keeps shipping whatever snapshot is already committed in the repo. Tighten
this to a hard failure once the secrets are confirmed working, matching
web's "fail rather than ship stale" behavior.

**Content-hash staleness check** (`npm run check:option-library-fallback-fresh`):
DB-independent вЂ” compares a hash of `src/data/option-library/*.ts` against
the hash recorded in the committed snapshot. Doesn't gate the actual build
(which always regenerates fresh from the DB regardless), but useful as a PR
check to catch "edited a category file, forgot to regenerate, committed
both" before merge.

## Manual setup still required

I can't configure Vercel/EAS environment variables myself. Before this is
fully live:
1. **Vercel** (production env): add `OPTION_LIBRARY_SNAPSHOT_SECRET` (any
   strong random value). `DATABASE_URL` should already be present.
   Optionally `ALLOW_MAINTENANCE_SEED=true` if you want the admin seed
   endpoint usable in production вЂ” leave unset to keep it disabled.
2. **EAS** (`eas secret:create`): `EXPO_PUBLIC_API_BASE` (the production
   API URL) and `OPTION_LIBRARY_SNAPSHOT_SECRET` (the *same* value as
   Vercel's).

## On a fresh environment (new dev DB, new live project)

Run filtered Athena, vocabulary, lab, option-library, and concept-map seed scripts once before pointing any app at that database, then run `scripts/backfill-relational.ts` and `scripts/data-quality-report.ts`. Then `npm run gen:option-library-fallback` once locally (or
let the next web build do it) before a mobile release build needs a
snapshot.

## Migration state check

If an environment was manually repaired or drifted before the additive
`LibraryCategory` enum migration existed, check its `_prisma_migrations`
table before deploy. Do not edit an already-applied migration file to fix
enum values: Prisma validates migration checksums. The production-safe fix
is a new additive migration using `ALTER TYPE "LibraryCategory" ADD VALUE`
for missing categories, followed by the idempotent seed script.


