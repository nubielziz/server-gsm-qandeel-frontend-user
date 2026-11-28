# GSM storefront: rules for every session and agent

@AGENTS.md

This is the public website of the GSM project: the shop, and one account area for retail buyers and merchants (decision 002).
The plan and the backend facts are in
`/home/saifi/gsm-project/STOREFRONT-HANDOFF.md` and `STOREFRONT-BACKEND-HANDOFF.md` (cite their § numbers); the
build plan is `IMPLEMENTATION-PLAN.md`; status is in `PROGRESS.md`.
Next.js 16.4 differs from your training data: read the matching guide in `node_modules/next/dist/docs/` before writing
Next code (caching = `01-app/01-getting-started/08-caching.md`, `use cache`, `proxy.ts`).

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
`npm run build` · `npm run e2e` (Playwright) · `npm run gen:api` (types from the backend OpenAPI; `gen:api:check` fails when the committed
types are out of date) · `npm run check`. The `api-types` check of CI generates the types from the backend branch named in
`ci/backend-ref` (one line, `main`; a pull request that needs another backend branch names it there and puts `main` back before it merges).
Dev API: `.env.development.local` sets `GSM_API_ORIGIN`. `scripts/dev-backend.sh start|stop|status|reset` runs an
isolated, demo-seeded backend on :3100 (own DB `gsm_storefront`, Redis DB 5, bucket `gsm-files-storefront`, mail to
Mailpit http://localhost:8025); the owner's API on :3000 and its data are never touched.

## Architecture
- **Routes:** everything under `app/en/` (English is the only language, decision 039, 2026-11-16: a plain folder, no dynamic
  segment, no `params.lang`; the root layout `app/en/layout.tsx` sets `lang="en" dir="ltr"`, and `app/global-not-found.tsx`
  answers a URL that matches no route).
  `proxy.ts` redirects paths that do not start with `/en` to the same path under `/en` (email links like
  `/sign-in?token=`, `/set-password?token=`), reading no cookie or `Accept-Language`; `next.config.ts` answers
  every old `/ar…` address with a 308 to the same path under `/en`.
  **One account area (decision 002):** every account, retail or merchant, lives under `/en/account`. The retired addresses (every
  page under `/merchant`, the old ticket list, the merchant register, set-password and verify-email pages, and the pages retired
  by decision 001) are the rows of `lib/account/legacy-paths.ts`; `next.config.ts` turns each row into a permanent redirect with
  and without `/en`, and `legacyAccountPath` rewrites a stored link the same way. No other file links to `/merchant`
  (`lib/account/one-account.test.ts` guards it, and the two CSRF cookie names).
  Route groups: `(store)` public shop (+ support tickets), `(auth)` sign-in, sign-up, forgot and set password, verify email and
  `become-a-merchant`, `(checkout)` checkout, `account/` the one account area (a page that only a merchant rank has calls
  `requireRank("merchant", …)`). `/client/*` and `/store/v1/*` are rewritten to the API.
  `proxy.ts` also redirects `/account…` to `/en/sign-in?next=…` when neither readable CSRF cookie exists.
- **Server Components by default.** `"use client"` only on interactive leaves (forms, toggles, drawers, menus).
- **Data:**
  - Shared store data → `lib/api/public.ts` (`'use cache'` + `cacheLife('catalog'|'content')`). Never personal data.
  - Personal data → `lib/api/session.ts` (`getAccount`, `requireAccount`, `requireRank`, `signInPath`; one `AccountMe` for both ranks) and
    `apiSessionGet/List` (`lib/api/server.ts`); the wallet of the request is `readAccountWallet()` (`lib/account/wallet-read.ts`).
    They read cookies: render the caller inside `<Suspense>`, never at the top level of a layout, never inside `'use cache'`.
  - The rank, not a kind of account, decides: `familyOf(me)` (`lib/account/family.ts`) says which API family a rank uses,
    `lib/account/routes.ts` holds the routes of each family and `capabilitiesOf(me)` says what a rank may see. A page or a component
    never asks "is this a customer or a merchant?".
  - Mutations, sign-in and anything that sets cookies → the browser client `api` (`lib/api/browser.ts`; one CSRF token for both route
    families, read through `lib/api/account-cookie.ts`) from Client Components, then `router.refresh()`. Never Server Actions for API calls (Set-Cookie would not reach the browser).
  - Types: `lib/api/types.ts` (aliases of the generated `lib/api/schema.gen.ts`; JSDoc there = the API contract).
  - Lists: `listQuery()` (`lib/api/query.ts`); totals from `x-total-count`; unknown query params → 422, send none.
- **Language (decision 039): English only.** No language field, parameter, selector, translation or right-to-left layout
  code: no request sends a `locale` (the API takes none; an unknown query key is a 422). Messages: one plain object per
  area, `export const store = { … }` in `lib/i18n/messages/<area>.ts`; a Server Component imports the namespace and reads it
  (`const t = store`), a Client Component gets the strings it needs as props; `fmt` and `plural` are in
  `lib/i18n/define.ts`. Links: `sitePath('/path')` (`lib/site-path.ts`, the one place that knows `/en`). Never derive
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
- **Turnstile:** `components/turnstile.tsx` on the store routes, the one-form sign-in (`POST /client/auth/sign-in`), the sign-in
  link and forgot password (sent always; the backend enforces it once `TURNSTILE_MERCHANT_AUTH` is on); reset after every submit
  (tokens are single-use).
- **Merchant application:** `/en/become-a-merchant` (before decision 002: `/en/merchant/register`) is not a form (since 2026-11-16): it
  sends the visitor to the team's WhatsApp number (`NEXT_PUBLIC_MERCHANT_WHATSAPP`, `lib/contact/whatsapp.ts`); staff create the merchant
  in the admin console. The site never calls `POST /client/auth/register`.
- **Helpers added by the backend-handoff waves (2026-11-13/15):** `lib/api/store-query.ts` (store list filters, sorts,
  safe paging), `lib/api/idempotency.ts` (one `Idempotency-Key` per request body; new after success or
  `IDEMPOTENCY_KEY_REUSED`), `lib/quantity.ts` (one per order, exactly N, range, packs; texts keyed on
  `invalid_quantity`; "From" prices), `lib/store/delivery.ts` (`etaText` else `deliveryMinutes`),
  `lib/wallet/*`, `components/wallet/*` and `components/account/wallet/*` (the store wallet of a retail rank and the merchant wallet,
  top-ups and invoices), the notification bell and pages (`components/notifications`). Wallet reads are `no-store` inside `<Suspense>`. Wording: say "In stock" or
  "On request" with the delivery line, never "Pre-order", "Out of stock" or a count (handoff §14).
- **Country and phone fields (2026-11-28):** a country is asked with `CountrySelect` and a phone with `PhoneInput`
  (`components/ui`; never a plain select or tel box): a searchable list with flags (`public/images/flags`, docs/LOGOS.md), the list
  drawn only when its panel opens (`CountryList`, `useAnchoredPopover`). `CountrySelect` keeps a hidden native
  `<select name>` for the value, the options and autofill; the button (`role="combobox"`) is what a person and a test use
  (e2e: `countryField`, `chooseCountry`). Calling codes are data (`lib/phone/dial-data.ts`, read through `lib/phone/dial.ts`): the
  site names a number's country and writes a code, it never judges a number, and a phone box that holds only a code is an empty phone.
- **Sign-in panel (2026-11-28):** the shop header's "Sign in" opens `SignInPopover` (`components/auth`), which loads
  `SignInSteps` (`sign-in-flow.tsx`, `embedded`) on the first opening; a finished sign-in closes it and refreshes the route.
  Phones and the checkout header keep a plain link to the sign-in page, which draws the same steps (`SignInFlow`).
- **e2e:** only against the isolated API (`:3100`); `e2e/admin.ts` (staff helpers) and `e2e/helpers.ts` (`signIn`, `signUpByLink`,
  `freshAccount` with a rank option; accounts are made through the admin API, never by a retired route); exclusive
  specs (for example `wallet-disabled`) run only with `E2E_EXCLUSIVE=1`. Next keeps the previous route hidden in the DOM
  (`cacheComponents`): scope locators to the visible page.

## UI rules
- Build pages from `components/ui` (primitives) and `components/layout` (shells); no one-off copies of a primitive.
  Design tokens live in `app/globals.css` (`@theme`); never hard-code colours, radii or shadows in pages.
- **Two themes (decision 006):** `data-theme="light" | "dark"` on `<html>`, set before the first paint by `THEME_GUARD`
  (`lib/theme/theme.ts`: the visitor's stored choice, else the system); the switch is `ThemeToggle`. Every token has a dark value,
  so a page written with tokens works in both: check a new screen in both. Pick by what the thing is: `primary` / `on-primary` for
  solid controls and marks (dark in light, light in dark), `inverse` / `on-inverse` for dark panels (dark in both). Never use
  `dark:` for a colour: it is only for showing one of two pictures or a filter on a picture. A logo made for a light background
  gets `logo-plate` (or `bg-plate`).
- Accessibility: real labels, `aria-describedby` for hints/errors, focus moves to the first error, keyboard support,
  visible focus, touch targets ≥ 44 px, `aria-live` for async results.
- Layout is left-to-right only (no `rtl:` variants, no `dir="rtl"`: the guard fails on them). Logical utilities
  (`ms-/me-/ps-/pe-/start-/end-/text-start`) stay: they are plain Tailwind.
- Performance: small client components, `next/image` with explicit sizes, no layout shift (reserve space for
  async content with skeletons of the same size).
