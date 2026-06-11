# LOSPOR v1.0 Release Guide

Complete guide for releasing LOSPOR v1.0: web app to GitHub/Vercel, database migration from dev to live, and mobile app to Google Play Store.

---

## 1. Pre-flight checklist

Before anything else:

- [ ] All TypeScript checks pass: `npx tsc --noEmit --pretty false` in both `lospor-app` and `lospor-mobile`
- [ ] Dev web server runs without errors: `npm run dev` in `lospor-app`
- [ ] Mobile app connects to local web server and all features work on emulator
- [ ] Postop, intraop, preop round-trip tested (save on mobile, check on web and vice versa)
- [ ] GDPR: confirm only Mistral AI (EU) endpoints are used — no Groq or US providers anywhere
- [ ] `.env.local` is in `.gitignore` (it contains secrets)
- [ ] `MISTRAL_API_KEY` and `DATABASE_URL` and `NEXTAUTH_SECRET` are NOT committed to git

---

## 2. Push web app to GitHub

> The repository already exists at v0.4.3. This section covers pushing all v1.0 changes on top.

### 2.1 Stage and commit all changes

From `C:\LOSAR\lospor-app` in PowerShell:

```powershell
cd C:\LOSAR\lospor-app

git add -A
git status          # review what's staged — make sure no .env files appear
git commit -m "feat: v1.0.0 — PWA, gas settings, recovery vitals, OMOP export, Bulgarian ICD-11, bug fixes"
git push
```

> If you are not yet authenticated, create a Personal Access Token (PAT) at https://github.com/settings/tokens with `repo` scope and use it as the password when prompted.

### 2.2 Tag the release

```powershell
git tag -a v1.0.0 -m "LOSPOR web app v1.0.0"
git push origin v1.0.0
```

### 2.3 Push mobile app to GitHub (first time)

The mobile app repo does not exist yet on GitHub. Create it first:

1. Go to https://github.com/new, name it `lospor-mobile`, set **Private**, no README
2. Then from `C:\LOSAR\lospor-mobile`:

```powershell
cd C:\LOSAR\lospor-mobile
git init
git add -A
git commit -m "feat: LOSPOR mobile app v1.0.0"
git remote add origin https://github.com/kaloyandzhunov/lospor-mobile.git
git branch -M main
git push -u origin main
git tag -a v1.0.0 -m "LOSPOR mobile app v1.0.0"
git push origin v1.0.0
```

---

## 3. Deploy web app to Vercel

### 3.1 Connect repository

1. Go to https://vercel.com/new
2. Import your `lospor-app` GitHub repository
3. Framework preset: **Next.js** (auto-detected)
4. Root directory: `.` (leave as default)

### 3.2 Environment variables

Add these in Vercel project settings → Environment Variables:

| Name | Value | Environments |
|------|-------|-------------|
| `DATABASE_URL` | `postgresql://...` (live Supabase URL) | Production |
| `NEXTAUTH_SECRET` | 32-char random secret | All |
| `NEXTAUTH_URL` | `https://app.lospor.org` | Production |
| `MISTRAL_API_KEY` | Your Mistral API key | All |

> Generate `NEXTAUTH_SECRET`: `openssl rand -base64 32` or https://generate-secret.vercel.app/32

### 3.3 Custom domain (optional)

In Vercel project → Domains → add `app.lospor.org` and follow the DNS instructions.

### 3.4 Deploy

Click **Deploy**. Vercel auto-deploys on every push to `main`.

---

## 4. Migrate database from dev to live (Supabase)

### 4.1 Understand the two databases

| Database | Purpose | Connection |
|----------|---------|-----------|
| **Dev database** | Local development, `dev` Supabase project | `DATABASE_URL` in `lospor-app/.env.local` |
| **Live database** | Production, `prod` Supabase project | `DATABASE_URL` on Vercel |

> **WARNING**: The live database contains (or will contain) real clinical data. All migrations are irreversible. Back up before any schema change.

### 4.2 What needs migrating

The following schema changes were introduced in v1.0 and must be applied to the live database:

**Added columns (`IntraoperativeRecord`):**
```sql
ALTER TABLE "IntraoperativeRecord" ADD COLUMN IF NOT EXISTS "fgfLitersPerMin" DOUBLE PRECISION;
ALTER TABLE "IntraoperativeRecord" ADD COLUMN IF NOT EXISTS "carrierGas" TEXT;
ALTER TABLE "IntraoperativeRecord" ADD COLUMN IF NOT EXISTS "fio2Percent" DOUBLE PRECISION;
```

**Added columns (`PostoperativeRecord`):**
```sql
ALTER TABLE "PostoperativeRecord" ADD COLUMN IF NOT EXISTS "recoveryBpSystolic" INTEGER;
ALTER TABLE "PostoperativeRecord" ADD COLUMN IF NOT EXISTS "recoveryBpDiastolic" INTEGER;
ALTER TABLE "PostoperativeRecord" ADD COLUMN IF NOT EXISTS "recoveryHeartRate" INTEGER;
ALTER TABLE "PostoperativeRecord" ADD COLUMN IF NOT EXISTS "recoverySpO2" DOUBLE PRECISION;
```

**Removed columns (`PostoperativeRecord`):**
```sql
ALTER TABLE "PostoperativeRecord" DROP COLUMN IF EXISTS "timeInRecoveryMin";
```

**New table (`Icd11Alias`):**
```sql
CREATE TABLE IF NOT EXISTS "Icd11Alias" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "bgTerm" TEXT NOT NULL UNIQUE,
  "enTerm" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 4.3 Apply via Prisma

The only safe way to apply schema changes to production is `prisma migrate deploy`. It applies the tracked migration files in order and never makes unreviewed changes.

```powershell
# 1. Point DATABASE_URL at the LIVE database (use the direct/port-5432 URL for migrations)
$env:DATABASE_URL = "postgresql://postgres.[live-project-ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"

# 2. Apply all pending migrations
cd C:\LOSAR\lospor-app
npx prisma migrate deploy

# 3. Regenerate Prisma client
npx prisma generate
```

> **Do not use `prisma db push` in production.** It has no migration history and can silently drop columns or constraints.

### 4.4 Verify

After migration:
```powershell
npx prisma db pull   # should show schema matches
npx prisma studio    # visual inspection of live tables
```

---

## 5. Deploy mobile PWA (Expo web build)

This creates the React Native app compiled for web — the PWA that mobile browsers land on.

### 5.1 Build

```powershell
cd C:\LOSAR\lospor-mobile
npm run export:web
# Output: lospor-mobile/dist/
```

The `dist/` folder is a complete static web app with its own manifest and service worker.

### 5.2 Deploy to Vercel (as a separate static site)

1. Push `lospor-mobile` to GitHub (see §5.3 below)
2. Go to https://vercel.com/new → import `lospor-mobile`
3. **Framework preset**: Other (it's static output, not Next.js)
4. **Output directory**: `dist`
5. **Build command**: `npm run export:web`  ← must use this, not `npx expo export --platform web`
6. **Environment variable**: `EXPO_PUBLIC_API_BASE = https://app.lospor.org`
7. Set the custom domain to `mobile.lospor.org`

### 5.3 Enable the mobile redirect on the web app

In Vercel project settings for `lospor-app`, add:
```
MOBILE_PWA_URL = https://mobile.lospor.org
```

This enables the middleware in `src/proxy.ts` that redirects Android/iOS browsers from `app.lospor.org` to `mobile.lospor.org`.

During local dev the redirect is disabled (no `MOBILE_PWA_URL` in `.env.local`).

---

## 6. Push mobile app to GitHub

From `C:\LOSAR\lospor-mobile`:

```powershell
cd C:\LOSAR\lospor-mobile
git init
git add -A
git commit -m "feat: LOSPOR mobile app v1.0"
git remote add origin https://github.com/kaloyandzhunov/lospor-mobile.git
git branch -M main
git push -u origin main
git tag -a v1.0.0 -m "LOSPOR mobile app v1.0.0"
git push origin v1.0.0
```

---

## 6. Build and submit mobile app to Google Play Store

### 6.1 Prerequisites

1. **Google Play Developer account** — https://play.google.com/console  
   One-time registration fee: $25 USD

2. **EAS CLI** — already installed if you have Expo:
   ```powershell
   npm install -g eas-cli
   eas login   # login with your Expo account (kaloyandjunow@gmail.com)
   ```

3. **Java 17** — required for Android signing. Already configured at:
   ```powershell
   $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
   ```

### 6.2 Configure EAS build

Check/create `C:\LOSAR\lospor-mobile\eas.json`:

```json
{
  "cli": { "version": ">= 14.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    },
    "production": {
      "distribution": "store",
      "android": {
        "buildType": "app-bundle"
      }
    }
  },
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "./google-play-service-account.json",
        "track": "internal"
      }
    }
  }
}
```

### 6.3 Update app config for production

In `C:\LOSAR\lospor-mobile\app.json`, ensure:
```json
{
  "expo": {
    "name": "LOSPOR",
    "slug": "lospor-mobile",
    "version": "1.0.0",
    "android": {
      "package": "org.lospor.mobile",
      "versionCode": 1
    }
  }
}
```

### 6.4 Set production environment variable

The production app must point to the live server. In `C:\LOSAR\lospor-mobile\.env.production`:
```
EXPO_PUBLIC_API_BASE=https://app.lospor.org
```

Or set via EAS secrets:
```powershell
eas secret:create --scope project --name EXPO_PUBLIC_API_BASE --value "https://app.lospor.org"
```

### 6.5 Build for production

```powershell
cd C:\LOSAR\lospor-mobile
eas build --platform android --profile production
```

This uploads your code to EAS Build servers and creates an `.aab` (Android App Bundle). It takes ~15 minutes. You'll get a download URL when done.

### 6.6 Sign the app

EAS Build manages signing automatically. On first production build, it will either:
- Generate a new keystore (recommended — EAS stores it securely)
- Ask you to provide an existing keystore

**IMPORTANT**: Save the keystore credentials. You need the same key for all future updates.

### 6.7 Submit to Google Play

**Option A: Automated via EAS Submit**
```powershell
# First, create a Google Play service account and download the JSON key
# Guide: https://docs.expo.dev/submit/android/
eas submit --platform android --profile production
```

**Option B: Manual submission**
1. Download the `.aab` file from the EAS Build dashboard
2. Go to Google Play Console → Create app
3. App name: "LOSPOR — Perioperative Register"
4. Default language: English (UK)
5. App or game: App
6. Free or paid: Free
7. Fill in store listing, content rating, data safety form
8. Upload the `.aab` to "Internal testing" track first
9. Test on real devices
10. Then promote to "Production" when ready

### 6.8 Store listing content

**Short description (80 chars):**
> Clinical anaesthesia documentation and perioperative data register.

**Full description:**
> LOSPOR (Large Open Source Perioperative Register) is a professional tool for anaesthesiologists to document and review perioperative cases.
>
> Features:
> • Comprehensive preoperative assessment with risk scoring (ASA, RCRI, APFEL, STOP-BANG)
> • Real-time intraoperative documentation with 5-minute timetable
> • Drug, fluid, infusion, and volatile agent tracking
> • Vitals recording with camera scan from anaesthetic machine monitor
> • Postoperative documentation and handover checklists
> • Offline-capable with automatic sync
> • Bilingual: English and Bulgarian
> • GDPR-compliant: no patient names stored, EU infrastructure only
>
> Designed for use in theatre — fast entry, thumb-friendly controls, dark clinical theme.

**Category:** Medical

**Content rating:** Everyone (no age-restricted content)

**Data safety:**
- Data is encrypted in transit (HTTPS)
- No personal/identifiable patient data (GDPR design)
- Account required
- Data can be deleted on request

---

## 7. PWA — mobile web experience

The web app (`lospor-app`) is now a Progressive Web App. When a user visits `app.lospor.org` on mobile:

1. **Android Chrome** shows "Add to Home Screen" banner automatically
2. **iOS Safari**: user taps Share → "Add to Home Screen"
3. Once installed, opens as full-screen app (no browser chrome)
4. App icon appears on home screen
5. Offline fallback page shown when network unavailable

**PWA files added:**
- `src/app/manifest.ts` → served as `/manifest.webmanifest`
- `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`
- `src/app/offline/page.tsx` → shown when offline
- `src/components/PwaInit.tsx` → registers service worker
- Service worker generated by `@ducanh2912/next-pwa` at build time → `public/sw.js`

**Testing PWA locally:**
```powershell
cd C:\LOSAR\lospor-app
npm run build   # PWA requires production build (SW disabled in dev)
npm start
# Open http://localhost:3000 in Chrome DevTools → Application → Service Workers
```

---

## 8. Post-release

After all deployments are live:

1. Update `EXPO_PUBLIC_API_BASE` in `.env.local` (dev) to keep pointing to local during development
2. Monitor Vercel logs for errors
3. Monitor Supabase dashboard for database usage
4. Check Google Play Console for crash reports
5. Keep dev and prod databases in sync via `prisma migrate` (never edit prod schema manually)
