# LOSPOR — Large Open Source Perioperative Register

[![Licence: AGPL-3.0](https://img.shields.io/badge/Licence-AGPL--3.0-blue.svg)](LICENSE)
[![Live app](https://img.shields.io/badge/Live-app.lospor.org-green)](https://app.lospor.org)
[![Docs](https://img.shields.io/badge/Docs-docs.lospor.org-blue)](https://docs.lospor.org)

LOSPOR is a free, open-source web application for anaesthesiologists to record perioperative data and generate standardised anaesthesia protocols. Built with Next.js 16, Prisma, Supabase, and NextAuth. Available in English and Bulgarian.

## Features

- Preoperative assessment — demographics, ICD-11 diagnosis, airway evaluation, risk scores (ASA/RCRI/Apfel/STOP-BANG), vitals, labs
- Intraoperative timetable — live vital signs graph, drug boluses, infusions, volatile agents, IV fluids on a shared timeline
- Postoperative recovery — Aldrete score, disposition, handover instructions
- Printable protocol — auto-generated two-page A4 landscape PDF; patient identity entered at print time only, never stored
- Case handover — transfer cases between colleagues; HOD can assign instantly
- Guided tour & example case — interactive walkthrough for new users
- EN/BG bilingual interface

## Live demo

[app.lospor.org](https://app.lospor.org) — register a free account and try the example case walkthrough.

## Self-hosting

Full guide: [docs.lospor.org/self-hosting](https://docs.lospor.org/self-hosting)

Quick start:

```bash
git clone https://github.com/kaloyandjunow-prog/lospor-app.git
cd lospor-app
npm install
cp .env.example .env   # fill in your values
npx prisma db push
npx tsx prisma/seed.ts
npm run dev
```

## Environment variables

See [.env.example](.env.example) for all required variables.

| Variable | Required | Description |
|----------|----------|-------------|
| DATABASE_URL | Yes | Supabase pooler connection string (port 6543) |
| DIRECT_URL | Yes | Supabase direct connection string (port 5432) |
| NEXTAUTH_SECRET | Yes | Random secret: openssl rand -base64 32 |
| NEXTAUTH_URL | Yes | Full public URL of your deployment |
| WHO_ICD_CLIENT_ID | Optional | WHO ICD-11 API (free at icd.who.int/icdapi) |
| WHO_ICD_CLIENT_SECRET | Optional | WHO ICD-11 API secret |
| ANTHROPIC_API_KEY | Optional | For ICD-11 Bulgarian translation seeding |

## Tech stack

Next.js 16 · Prisma · Supabase · NextAuth v5 · Tailwind CSS · next-intl

## Licence

AGPL-3.0 — see [LICENSE](LICENSE). Self-hosted modifications must be open-sourced.
