@AGENTS.md

# LOSPOR Web App Memory

## Role

- This app is the canonical Next.js web app and backend/API surface for LOSAR.
- Treat the web API/database schema as the source of truth for mobile sync.
- Do not change the web app unless the task explicitly involves web/API/sync work.

## Recent Mobile Sync Contract Work

- `src/app/api/cases/_mappers.ts` maps mobile aliases into canonical case fields.
- Preop/postop/intraop mobile payloads should persist through canonical names, with backwards-compatible alias handling at the API edge.
- Risk scores and postop aliases were added to the mapping path so mobile values are not dropped.
- Transfer pending responses include `procedureName` so the mobile transfer list can show useful case context.
- Case update routes use updated timestamp conflict detection so stale mobile writes can be rejected instead of overwriting newer web edits.
- Case live-update endpoints/patterns were added for mobile refresh, including stream/event support and fallback polling.
- Web dashboard stats and scope chips can filter all accessible cases by all/today/month/active/drafts/awaiting-postop/complete/handovers/ICU while defaulting to full history.

## UX/Feature Parity Notes

- Mobile now mirrors more web features: audit logs, admin registrations/HOD/role management, share summary, printable protocol, handover, postop, AI advisor, and intraop.
- If a web feature is added later, check whether mobile needs a matching screen/action or at least a read-only fallback.
- Procedure search endpoint `/api/search/procedures` returns PCS entries. Web displays `group` as the primary clinical procedure label and `code · domain` as supporting text; mobile autocomplete should mirror that mapping, not show raw `description` as the main label.
- Web `NumberStepper` is the reference pattern for mobile preop vitals: `- / number / +` with range slider, while mobile opens a custom keypad from the number field instead of native text entry.

## Verification

- Run `npx tsc --noEmit --pretty false` in this project after API contract changes.
