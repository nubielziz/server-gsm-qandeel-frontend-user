# GSM storefront: rules for every session and agent

@AGENTS.md

This is the public website (merchants + customers) of the GSM project. The plan and the backend facts are in
`/home/saifi/gsm-project/STOREFRONT-HANDOFF.md` and `STOREFRONT-BACKEND-HANDOFF.md` (cite their § numbers); the
build plan is `IMPLEMENTATION-PLAN.md`; status is in `PROGRESS.md`.
Next.js 16.4 differs from your training data: read the matching guide in `node_modules/next/dist/docs/` before writing
Next code (caching = `01-app/01-getting-started/08-caching.md`, `use cache`, `next/root-params`, `proxy.ts`).

## Owner's rules (handoff §1.6)
- Code, comments, docs and commit messages in English. The owner writes short Jordanian Arabic: answer the same way.
- Never push, force-push, `--no-verify` or rewrite history. Stage explicit paths (never `git add -A`). Only the lead
  session commits; agents never change git state or spawn agents.
- Conventional commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- At most 4 agents at once. Do not edit `backend/` or `frontend-admin/`; do not change `backend/.env`.
- No new dependency without the lead's approval (approved: lucide-react, markdown-it; dev: vitest, @playwright/test).
- **Images:** never draw SVG artwork or illustrations for site images. Image slots are files in `public/images/`
  listed with generation prompts in `docs/IMAGE-PROMPTS.md`; render them with `siteImage('<file>')`
  (`lib/site-images.ts`), which returns null until the owner adds the file: show a plain placeholder surface then.
  UI icons come from `lucide-react` only.

## Commands
`npm run dev` (http://localhost:5175) · `npm run typecheck` · `npm run lint` (ESLint + the English-only guard) · `npm run test` (Vitest) ·
`npm run build` · `npm run e2e` (Playwright) · `npm run gen:api` (types from the backend OpenAPI) · `npm run check`.
Dev API: `.env.development.local` sets `GSM_API_ORIGIN`. `scripts/dev-backend.sh start|stop|status|reset` runs an
isolated, demo-seeded backend on :3100 (own DB `gsm_storefront`, Redis DB 5, bucket `gsm-files-storefront`, mail to
Mailpit http://localhost:8025); the owner's API on :3000 and its data are never touched.

## Architecture
- **Routes:** everything under `app/[lang]/` (only `en` exists: decision 039, 2026-11-16; the cleanup wave of feature 30
  renames the folder to `app/en`; root layout `app/[lang]/layout.tsx` sets `lang="en" dir="ltr"`).
  `proxy.ts` redirects paths that do not start with `/en` to the same path under `/en` (email links like
  `/sign-in?token=`, `/merchant/set-password?token=`), reading no cookie or `Accept-Language`; `next.config.ts` answers
  every old `/ar…` address with a 308 to the same path under `/en`.
  Route groups: `(store)` public shop (+ support tickets), `(auth)` sign-in/up and email-link pages (including
  `(auth)/merchant/{register,set-password,verify-email}`), `(checkout)` checkout, `account/` customer area,
  `(portal)/merchant/` merchant portal. `/client/*` and `/store/v1/*` are rewritten to the API.
  `proxy.ts` also redirects `/account…` and portal pages to sign-in when the surface's CSRF cookie is missing.
- **Server Components by default.** `"use client"` only on interactive leaves (forms, toggles, drawers, menus).
- **Data:**
  - Shared store data → `lib/api/public.ts` (`'use cache'` + `cacheLife('catalog'|'content')`). Never personal data.
  - Personal data → `lib/api/session.ts` (`getMerchant`, `getCustomer`, `requireMerchant`, `requireCustomer`) and
    `apiSessionGet/List` (`lib/api/server.ts`). They read cookies: render the caller inside `<Suspense>`, never at
    the top level of a layout, never inside `'use cache'`.
  - Mutations, sign-in and anything that sets cookies → the browser client `api` (`lib/api/browser.ts`) from Client
    Components, then `router.refresh()`. Never Server Actions for API calls (Set-Cookie would not reach the browser).
  - Types: `lib/api/types.ts` (aliases of the generated `lib/api/schema.gen.ts`; JSDoc there = the API contract).
  - Lists: `listQuery()` (`lib/api/query.ts`); totals from `x-total-count`; unknown query params → 422, send none.
- **Language (decision 039): English only.** No language field, parameter, selector, translation or right-to-left layout
  code: no request sends a `locale` (the API takes none; an unknown query key is a 422). Server code still calls
  `getLocale()` (always `en`) / `getMessages(namespace)` (`lib/i18n/server.ts`) until the cleanup wave of feature 30
  removes them; Client Components get the strings they need as props. Messages: one `defineMessages({ en })` namespace per
  area in `lib/i18n/messages/<area>.ts`. Links: `localePath(locale, '/path')` (becomes `sitePath(path)`). Never derive
  business rules from mockup placeholder text.
  **Arabic text that people or suppliers type is data and must keep working** (group C): `dir="auto"` on text people type,
  `<bdi>` around values of the API, `dir="ltr"` on codes and numbers, Arabic-Indic and Persian digits typed in quantity,
  amount, IMEI and order boxes, the input-method guard of the ticket reply box, initials of a name in any script. Never
  "clean" these. `scripts/check-english-only.mjs` (the same file in the backend, the console and here; part of
  `npm run lint`, configured by `scripts/english-only.config.json`) fails on Arabic script, the `ar` locale, `rtl:`
  variants or `dir="rtl"` outside its allowlist, and when a protected file loses what it protects (`keep`).
- **Errors:** every failure is an `ApiError` (`lib/api/errors.ts`): translate with `useErrorText()` (client) by
  `code` and per-field `code`; show `reference()` (request id) on error screens. Sign out rules: handoff §3.4.
- **Money:** 4-decimal strings. Display with `formatMoney()`; sum with `sumMoney()`; never floats.
- **Turnstile:** `components/turnstile.tsx` on the store routes, the one-form sign-in (`POST /client/auth/sign-in`) and
  merchant forgot and login (sent always; the backend enforces it once `TURNSTILE_MERCHANT_AUTH` is on); reset after
  every submit (tokens are single-use).
- **Merchant application:** `/[lang]/merchant/register` is not a form (since 2026-11-16): it sends the visitor to the
  team's WhatsApp number (`NEXT_PUBLIC_MERCHANT_WHATSAPP`, `lib/contact/whatsapp.ts`); staff create the merchant in the
  admin console. The site never calls `POST /client/auth/register`.
- **Helpers added by the backend-handoff waves (2026-11-13/15):** `lib/api/store-query.ts` (store list filters, sorts,
  safe paging), `lib/api/idempotency.ts` (one `Idempotency-Key` per request body; new after success or
  `IDEMPOTENCY_KEY_REUSED`), `lib/quantity.ts` (one per order, exactly N, range, packs; texts keyed on
  `invalid_quantity`; "From" prices), `lib/store/delivery.ts` (`etaText` else `deliveryMinutes`),
  `lib/wallet/*` and `components/wallet/*` (customer and merchant wallets, top-ups), the notification bell and pages
  (`components/notifications`). The customer wallet read is `no-store` inside `<Suspense>`. Wording: say "In stock" or
  "On request" with the delivery line, never "Pre-order", "Out of stock" or a count (handoff §14).
- **e2e:** only against the isolated API (`:3100`); `e2e/admin.ts` (staff helpers) and `e2e/helpers.ts`; exclusive
  specs (for example `wallet-disabled`) run only with `E2E_EXCLUSIVE=1`. Next keeps the previous route hidden in the DOM
  (`cacheComponents`): scope locators to the visible page.

## UI rules
- Build pages from `components/ui` (primitives) and `components/layout` (shells); no one-off copies of a primitive.
  Design tokens live in `app/globals.css` (`@theme`); never hard-code colours, radii or shadows in pages.
- Accessibility: real labels, `aria-describedby` for hints/errors, focus moves to the first error, keyboard support,
  visible focus, touch targets ≥ 44 px, `aria-live` for async results.
- Layout is left-to-right only (no `rtl:` variants, no `dir="rtl"`: the guard fails on them). Logical utilities
  (`ms-/me-/ps-/pe-/start-/end-/text-start`) stay: they are plain Tailwind.
- Performance: small client components, `next/image` with explicit sizes, no layout shift (reserve space for
  async content with skeletons of the same size).
