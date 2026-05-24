# LOSPOR — Large Open Source Perioperative Register

[![Licence: AGPL-3.0](https://img.shields.io/badge/Licence-AGPL--3.0-blue.svg)](LICENSE)
[![Live app](https://img.shields.io/badge/Live-app.lospor.org-green)](https://app.lospor.org)
[![Docs](https://img.shields.io/badge/Docs-docs.lospor.org-blue)](https://docs.lospor.org)

Copyright (C) 2026 Kaloyan Dzhunov. Licensed under AGPL-3.0.

LOSPOR is a free, open-source **personal anaesthetic case log** for learning, portfolio, and reflection. Built with Next.js 16, Prisma, Supabase, and NextAuth. Available in English and Bulgarian.

## What LOSPOR is and isn't

**Is:** A personal log for anaesthesiologists to record anonymised cases, track learning, and generate a printable case summary.

**Is not:** A clinical record system, a patient management tool, or a certified medical device.

Patient identity is never stored. Each case uses an anonymised case code only. The printable protocol has blank fields for patient identity — filled in by hand after printing.

## Medical Disclaimer

LOSPOR is intended for perioperative documentation, research, and workflow support purposes only. It is not intended to replace clinical judgment, provide autonomous clinical decision-making, or serve as a certified medical device unless explicitly stated otherwise.

## Features

- Preoperative assessment — demographics, ICD-11 diagnosis, airway evaluation, risk scores (ASA/RCRI/Apfel/STOP-BANG), vitals, labs (100+ tests with reference ranges and AI image scan)
- Intraoperative timetable — live vital signs graph, drug boluses, infusions, volatile agents, IV fluids on a shared timeline
- Postoperative recovery — Aldrete score, disposition, handover instructions
- 30-minute review window — after submitting postop the case stays open for 30 minutes; navigate back to any step to correct data; timer persists across page reloads
- Printable protocol — auto-generated two-page A4 landscape summary; patient identity left blank for hand-writing, never stored
- Case handover — transfer cases between colleagues; HOD can assign instantly within their institution
- AI pre-operative advisor — opt-in per case; EU-hosted (Mistral La Plateforme), structured fields only, no free-text forwarded
- GDPR rights — data export (Article 15) and account deletion (Article 17) from Settings → Privacy & Data
- Server-side PII detection — EGN, ID sequences, date patterns, email addresses, and name patterns blocked at the API level
- Privacy & Terms pages — accessible without login; sub-processors, legal basis, retention, user rights
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
| NEXTAUTH_SECRET | Yes | Random secret: `openssl rand -base64 32` |
| NEXTAUTH_URL | Yes | Full public URL of your deployment |
| MISTRAL_API_KEY | Optional | AI advisor and lab scan — Mistral La Plateforme (EU), free tier available |
| MISTRAL_API_BASE | Optional | Override Mistral API endpoint (default: `https://api.mistral.ai/v1`) |
| MISTRAL_MODEL | Optional | Override model for AI advisor (default: `open-mistral-7b`) |
| WHO_ICD_CLIENT_ID | Optional | WHO ICD-11 API (free at icd.who.int/icdapi) |
| WHO_ICD_CLIENT_SECRET | Optional | WHO ICD-11 API secret |

## Tech stack

Next.js 16 · Prisma · Supabase · NextAuth v5 · Tailwind CSS · next-intl · Mistral AI (EU) · Vercel Analytics

## Licence

AGPL-3.0 — see [LICENSE](LICENSE). Self-hosted modifications must be open-sourced.
