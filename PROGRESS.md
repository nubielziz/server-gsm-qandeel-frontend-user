# Storefront progress

Single source of status for `storefront/`. The plan and backend facts: `../STOREFRONT-HANDOFF.md` (§ numbers).
Rules: `CLAUDE.md`. Images to add: `docs/IMAGE-PROMPTS.md`.

## Milestones
| # | Milestone | State |
|---|---|---|
| M0 | Foundation: Next config + API rewrites, language routing (`proxy.ts`, `/en`, `/ar`, RTL), API layer (server, cached public reads, sessions, browser client with per-surface CSRF, Turnstile, Idempotency-Key), generated API types, i18n, formatters, isolated dev backend | done (2026-11-09) |
| M1 | Design system: tokens (`app/globals.css`), 35 primitives (`components/ui`), shells (`components/layout`: store, auth, checkout, workspace), group layouts, merchant portal layout, file upload, UI kit at `/en/ui-kit` (dev only) | done (2026-11-09) |
| M2 | Public store: home, services, service page, IMEI check, help, content/legal pages, tracking | in progress |
| M3 | Customer checkout: details, consents, pay, return polling, resume | in progress |
| M4 | Auth: sign-in (customer + merchant, 2FA), sign-up, magic link, forgot/set password, verify email | in progress |
| M5 | Customer account and support tickets | in progress |
| M6 | Merchant portal | in progress |

## Decisions (2026-11-09)
- Stack confirmed by the owner's request: Next.js 16.4 (App Router, Cache Components, Partial Prefetching).
- URLs carry the language (`/en/…`, `/ar/…`): static, cacheable pages per language and proper SEO; `proxy.ts` sends
  plain email links (`/sign-in?token=`, `/merchant/set-password?token=` …) to the visitor's language (cookie
  `gsm_locale`, else Accept-Language).
- Sign-in: the smart sign-in route (ROADMAP 1.3) does not exist and needs a lead decision (route-parity). Until then
  one sign-in page with a Customer | Merchant switch calls the two existing login routes. No backend change made.
- Not built because the API has no support (handoff §1.7): cart (one service per checkout), favourites, notification
  feed, Google/Telegram sign-in, PayPal/Vodafone Cash, customer wallet (phase 2W), ticket lists, store categories.
- Fonts: Inter (Latin, variable with optical sizes) + IBM Plex Sans Arabic (Arabic glyphs only, not preloaded).
- Dependencies approved by the lead: lucide-react (icons), markdown-it (server-side Markdown, raw HTML disabled);
  dev: vitest 4 (same major as the console), @playwright/test 1.61.1 (matches the cached Chromium).
- Types: `scripts/gen-api-types.mjs` generates `lib/api/schema.gen.ts` from `backend/docs/contract/openapi.json`
  (no generator dependency).
- Site images are files the owner adds (`docs/IMAGE-PROMPTS.md`); placeholders until then, never drawn SVG art.
- Dev data: `scripts/dev-backend.sh` runs an isolated demo-seeded backend on :3100 (DB `gsm_storefront`, Redis DB 5,
  bucket `gsm-files-storefront`, mail to Mailpit). The owner's API on :3000 and its data are untouched.

## Test accounts (isolated backend on :3100 only)
- Customers (demo seed): `daniel.whitmore@mail.example` / `demo-password` (4 orders) — see handoff §9.2 for more.
- Merchants: `ops@zainmobilehub.example` (m1, active, vip) and `ops@algiersservice.example` (m18, pending), both with
  password `Storefront-Test-4821` (set through forgot → Mailpit → reset on 2026-11-09).

## Checks
- M1 (design agent, 2026-11-09): `npm run typecheck` clean, `npm run lint` 0 errors, `npm run build` passed; UI kit checked at 1440/768/390/360 px in en and ar (no overflow, no console errors). Lead re-checked screenshots at 1440 and 390 px.
- `e2e/routing.spec.ts`: 6/6 pass (language redirects for email links, private-area redirects, API rewrites) — 2026-11-09.
- `npm run test`: 20 unit tests pass (format, API errors/query, i18n) — 2026-11-09.
- `npm run typecheck`: clean on the foundation — 2026-11-09.
