# Storefront progress

Single source of status for `storefront/`. The plan and backend facts: `../STOREFRONT-HANDOFF.md` (§ numbers).
Rules: `CLAUDE.md`. Images to add: `docs/IMAGE-PROMPTS.md`.

## Milestones
| # | Milestone | State |
|---|---|---|
| M0 | Foundation: Next config + API rewrites, language routing (`proxy.ts`, `/en`, `/ar`, RTL), API layer (server, cached public reads, sessions, browser client with per-surface CSRF, Turnstile, Idempotency-Key), generated API types, i18n, formatters, isolated dev backend | done (2026-11-09) |
| M1 | Design system: tokens (`app/globals.css`), 35 primitives (`components/ui`), shells (`components/layout`: store, auth, checkout, workspace), group layouts, merchant portal layout, file upload, UI kit at `/en/ui-kit` (dev only) | done (2026-11-09) |
| M2 | Public store: home, catalog (search, brand/carrier/country filters, sort, paging), service page (slug per language, merchant price hint), IMEI check, help, content/legal pages, order tracking, robots + sitemap | done (2026-11-09) |
| M3 | Customer checkout: details drawer, tax by country, locked session, consents, pay (Idempotency-Key), return polling, resume link | done (2026-11-09); paying stops at the gateway (demo keys are placeholders) |
| M4 | Auth: sign-in (customer + merchant, 2FA, temporary password), sign-up, magic link, forgot/set password, verify email (both account types) | done (2026-11-09, `6bee86a`) |
| M5 | Customer account (overview, orders, settings, privacy requests) and support tickets (new, conversation, rating) | done (2026-11-09, `6bee86a`) |
| M6 | Merchant portal: dashboard, catalog + ordering, orders, wallet, top-ups, invoices (`230b7b3`); settings, security/2FA/sessions, notifications, KYC, API keys, webhooks, referrals (`5e0a8d2`) | done (2026-11-09) |

## Open items and blockers (2026-11-09)
- **Smart sign-in** (ROADMAP 1.3) needs the lead's route-parity choice (handoff §6.1); the sign-in page uses an
  interim Customer | Merchant switch. Merchant register cannot use Turnstile (code) while ROADMAP 1.7 lists it.
- **Payments:** card/crypto `pay` fails with the demo's placeholder keys (502 / 422 out_of_range). Real gateways are
  ROADMAP phase 4. Customer wallet = phase 2W (not shown to customers).
- **Images:** placeholders until the owner adds the files listed in `docs/IMAGE-PROMPTS.md`.
- **Soft 404s:** `notFound()` inside streamed pages answers HTTP 200 with `noindex` (unknown slugs, tokens).
- **Production config:** `GSM_API_ORIGIN`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_SITE_URL`,
  optional `NEXT_PUBLIC_TIME_ZONE`/`NEXT_PUBLIC_API_PUBLIC_URL`; the backend needs `TRUST_PROXY` (the site is a
  proxy: it forwards `X-Forwarded-For`), `CORS_ORIGINS`, `STORE_BASE_URL`, `PORTAL_BASE_URL` (ROADMAP 1.8).
- **Owner's API (:3000):** its `backend/.env` was not changed; to use the site against it, add the site's origin to
  `CORS_ORIGINS` and set `STORE_BASE_URL`/`PORTAL_BASE_URL` (handoff §6.2), then point `GSM_API_ORIGIN` at :3000.

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
- Token pages (tracking, checkout, tickets) forward the visitor's IP and show a "too many attempts" state on 429
  instead of an error page; all personal reads call `connection()` first (never prerendered).
- Dev data: `scripts/dev-backend.sh` runs an isolated demo-seeded backend on :3100 (DB `gsm_storefront`, Redis DB 5,
  bucket `gsm-files-storefront`, mail to Mailpit). The owner's API on :3000 and its data are untouched.

## Test accounts (isolated backend on :3100 only)
- Customers (demo seed): `daniel.whitmore@mail.example` / `demo-password` (4 orders) — see handoff §9.2 for more.
- Merchants: `ops@zainmobilehub.example` (m1, active, vip) and `ops@algiersservice.example` (m18, pending), both with
  password `Storefront-Test-4821` (set through forgot → Mailpit → reset on 2026-11-09).

## Checks
- **Final, 2026-11-09 (production build `next start` :5176 + isolated backend):** `npx playwright test` (desktop +
  mobile projects) → **236 passed, 4 skipped (mutating merchant-settings tests run on desktop only), 0 failed**, 3.8 min.
  `next build` OK (165 pages, every route partial prerender). Unit tests 66/66. Typecheck and ESLint clean.
- **Lab Web Vitals** (`scripts/measure-vitals.mjs`, production build, median of 3; localhost so TTFB is not
  meaningful; lab estimates, not field data):

  | Page | Mobile LCP (Pixel 7, 4× CPU, Fast 4G) | Mobile CLS | Desktop LCP | Desktop CLS | JS (gzip) |
  |---|---|---|---|---|---|
  | `/en` home | 828 ms | 0.012 | 104 ms | 0.013 | 203 KB |
  | `/ar` home | 836 ms | 0.007 | 104 ms | 0.007 | 199–203 KB |
  | `/en/services` | 808 ms | 0.000 | 128 ms | 0.000 | 206–219 KB |
  | service page (en / ar slug) | 1088 / 896 ms | 0.018 / 0.005 | 84 ms | 0.001 | 206–219 KB |
  | `/en/sign-in` | 1052 ms | 0.005 | 72 ms | 0.001 | 201 KB |
  | checkout | 752 ms | 0.000 | 92 ms | 0.001 | 205 KB |
  | tracking | 1096 ms | 0.022 | — | — | 193 KB |
  | merchant dashboard (signed in) | 928 ms (ar) | 0.008 | 364 ms | 0.000 | 185–189 KB |

  Interaction latency (Event Timing): mobile menu 72 ms, checkout drawer 88 ms (mobile) / 24 ms (desktop).
  Client JS of all routes together: 332 KB gzip; the largest shared chunks are React DOM + the Next runtime.
  markdown-it stays on the server (0 client chunks).
- Agents' e2e runs (2026-11-09, dev server + isolated backend): merchant 25/25 desktop and 25/25 mobile; merchant
  settings 17/17 desktop (one ECONNRESET flake passed on re-run), 13 + 4 skipped (mutating tests, desktop only)
  mobile; auth 20/20 desktop, 18 + 2 re-run mobile (merchant-register rate limit 5/15 min per IP); account + support
  20/20 desktop, mobile pass. Unit tests: 66 pass (incl. 42 for exact merchant money math).
- M1 (design agent, 2026-11-09): `npm run typecheck` clean, `npm run lint` 0 errors, `npm run build` passed; UI kit checked at 1440/768/390/360 px in en and ar (no overflow, no console errors). Lead re-checked screenshots at 1440 and 390 px.
- `e2e/routing.spec.ts`: 6/6 pass (language redirects for email links, private-area redirects, API rewrites) — 2026-11-09.
- `npm run test`: 20 unit tests pass (format, API errors/query, i18n) — 2026-11-09.
- `npm run typecheck`: clean on the foundation — 2026-11-09.
