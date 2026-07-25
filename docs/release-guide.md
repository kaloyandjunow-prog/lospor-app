# LOSPOR V7 Release Guide

This guide replaces the historical single-service release process. In V7, web
does not own the database or backend.

## Release order

1. Tag and push `lospor-core`.
2. Update and verify Core dependencies in API, web, and mobile/PWA.
3. Tag and push `lospor-api`, `lospor-app`, `lospor-mobile`, and
   `lospor-docs`.
4. Deploy API and verify it before deploying any client.
5. Deploy web, then PWA.
6. Build Android APK/AAB after production smoke tests.

## API project

`lospor-api` is a separate Vercel project at `api.lospor.org`. It alone owns:

- `DATABASE_URL` and `DIRECT_URL`
- `LOSPOR_AUTH_SECRET` and compatibility `NEXTAUTH_SECRET`
- Brevo and AI credentials
- cron, option snapshot, and OMOP secrets
- Prisma migrations and retention jobs

Deploy the API to its temporary Vercel address first. Verify
`/health/live`, `/health/ready`, `/v1/capabilities`, and `/openapi.json`.
Attach `api.lospor.org` only after those checks pass, then verify them again.

The production build runs `prisma migrate deploy`. Never run
`prisma db push` against production.

## Web project

The web project requires:

```env
LOSPOR_API_INTERNAL_URL="https://api.lospor.org"
NEXT_PUBLIC_APP_URL="https://app.lospor.org"
MOBILE_PWA_URL="https://pwa.lospor.org"
CORS_ALLOW_ORIGINS="https://pwa.lospor.org"
```

Web must not receive database credentials or API signing secrets.

## PWA and Android

PWA and EAS profiles use:

```env
EXPO_PUBLIC_API_BASE="https://api.lospor.org"
```

Verify login, clinical search, case loading, online save, offline queue replay,
and the legacy `https://app.lospor.org/api/*` compatibility path before
starting Android builds.

## Rollback

Keep V6 tags and deployments available. Roll API and clients back together if
the V7 contract has already reached production clients.
