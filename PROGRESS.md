# Storefront progress

Single source of status for `storefront/`. The plan and backend facts: `../STOREFRONT-HANDOFF.md` (§ numbers).
Rules: `CLAUDE.md`. Images to add: `docs/IMAGE-PROMPTS.md`.

## Milestones
| # | Milestone | State |
|---|---|---|
| M0 | Foundation: Next config + API rewrites, language routing (`proxy.ts`, `/en`, `/ar`, RTL), API layer (server, cached public reads, sessions, browser client with per-surface CSRF, Turnstile, Idempotency-Key), generated API types, i18n, formatters, isolated dev backend | done (2026-11-09) |
| M1 | Design system: tokens (`app/globals.css`), 35 primitives (`components/ui`), shells (`components/layout`: store, auth, checkout, workspace), group layouts, merchant portal layout, file upload, UI kit at `/en/ui-kit` (dev only) | done (2026-11-09) |
| M2 | Public store: home, catalog (search, brand/carrier/country filters, sort, paging), service page (slug per language, rank price hint), IMEI check, help, content/legal pages, order tracking, robots + sitemap | done (2026-11-09) |
| M3 | Customer checkout: details drawer, tax by country, locked session, consents, pay (Idempotency-Key), return polling, resume link | done (2026-11-09); paying stops at the gateway (demo keys are placeholders) |
| M4 | Auth: sign-in (every account, 2FA, temporary password), sign-up, magic link, forgot/set password, verify email | done (2026-11-09, `6bee86a`; one account type since 2026-11-24) |
| M5 | Account area of a retail rank (overview, orders, settings, privacy requests) and support tickets (new, conversation, rating; the rating was retired on 2026-11-23) | done (2026-11-09, `6bee86a`) |
| M6 | Merchant pages (now under `/en/account`, decision 002): dashboard, catalog + ordering, orders, wallet, top-ups, invoices (`230b7b3`); settings, security/2FA/sessions, notifications, KYC, API keys, webhooks, referrals (`5e0a8d2`); KYC, the session list, webhooks and referrals were retired on 2026-11-23 | done (2026-11-09) |

## Backend handoff implementation (from 2026-11-13; plan: `IMPLEMENTATION-PLAN.md`)
Everything in `../STOREFRONT-BACKEND-HANDOFF.md` (features 20–26) and the open items of `../STOREFRONT-HANDOFF.md`, in 16
features and 4 waves. Planned once by Fable 5.2; per feature one Sonnet 5.5 implementer (extra-high effort), one Opus 5.5
review, one Sonnet 5.5 fix; then the lead's check (second review round). ≤ 4 agents at once. Tests run only against the
isolated demo API (:3100, Mailpit); the owner's API (:3000) is never written to. One local commit per wave.

### Wave 0: foundation (2026-11-13)
- **F00 API layer:** `lib/api/store-query.ts` (all new list filters/sorts: `type`, `categoryId`, `availability`,
  `minPrice`/`maxPrice`, `popular`/`listedAt`/`price`; safe paging window), readers `listStoreCategories`,
  `listContentPages`; `api.signIn()` keeps the smart sign-in's CSRF token under the surface `kind` names (D2);
  `lib/api/idempotency.ts` (one key per request signature; reset after success or `IDEMPOTENCY_KEY_REUSED`); error texts
  `WALLET_FROZEN`, `WALLET_DISABLED`, wallet field codes, waits in minutes; `next.config.ts`: `images.localPatterns`
  (`/images/**`, `/store/v1/media/**`), catalog cache `{stale 60, revalidate 30, expire 300}` (availability ≤ 5 min old),
  `NEXT_OUTPUT=standalone`, `GSM_API_REWRITE_ORIGIN`.
- **F01 shared helpers:** `lib/quantity.ts` (one per order / exact N / range / packs, texts keyed on `invalid_quantity`,
  "From" prices), `lib/store/delivery.ts` (`etaText` else `deliveryMinutes` per language, stock hint); strings in
  `common`/`portal`/`store` (availability, delivery, quantity, top-up statuses, sorts, help vote, neutral tracking texts);
  `StatusBadge` kind `topUp`; `FileUpload` takes the store upload endpoint (5 MiB).
- **F02 production image:** `Dockerfile` (3 stages, `node:26-slim`, standalone, non-root, health check), `.dockerignore`,
  `docs/DEPLOY.md`, `lib/app-routes.test.ts` (no site pages under `/client` or `/store`). Image `gsm-site:w0` built
  against :3100 and run: healthy; `/robots.txt`, `/en`, `/ar` 200; API rewrite and the image optimizer (site images and
  `/store/v1/media/*` pictures) 200; no `.env` inside; runs as `node`.
- **F03 e2e harness:** `e2e/admin.ts` (staff session with TOTP via node:crypto, cached in `e2e/.auth/`; ~25 admin helpers),
  `e2e/global-setup.ts` (idempotent; never switches anything off), `e2e/harness.spec.ts`; `helpers.ts` gains shared
  helpers (`freshCustomer`, `freshMerchant`, `stubTurnstile` …; since 2026-11-24 `freshAccount`, `signIn`, `signUpByLink`). The e2e guard now decides dev/production env files by
  the port under test. **Demo DB (`gsm_storefront`) changes made by the setup** (a `dev-backend.sh reset` undoes them; the
  next e2e run recreates them): customer wallet on; manual gateway `cliq-e2e`; JOD with 2 decimals; quantity rules on
  services 8 (range 2–50), 9 (packs 5/10/25), 10 (exact 5); stock codes on services 4 (≥ 20) and 15 `SRV-Z3X-10`
  (fixes the old failing merchant instant-order test); a picture on listing 13.
- **Checks:** typecheck and ESLint clean; 173 unit tests; `next build` 171 pages (home and catalog still partial
  prerender, 30 s / 5 min); e2e harness + routing + store + checkout + merchant on desktop + mobile: 152 passed,
  16 skipped (harness is desktop-only; 1 old skip), 0 failed.

| Feature | Wave | Implement (Sonnet) | Review (Opus) | Fix (Sonnet) | Calls | Lead check | Commit |
|---|---|---|---|---|---|---|---|
| F00 API and config | W0 | ✓ | accept, 3 minor | ✓ | 3/3 | ✓ | W0 |
| F01 Shared helpers and strings | W0 | ✓ | accept, 1 minor | ✓ | 3/3 | ✓ | W0 |
| F02 Docker image | W0 | ✓ | accept, 2 minor (docs) | ✓ | 3/3 | ✓ | W0 |
| F03 e2e harness | W0 | ✓ | fix, 2 major | ✓ | 3/3 | ✓ | W0 |
| F10 Smart sign-in | W1 | ✓ | fix, 2 major (test bug; 360 px overflow) | ✓ | 3/3 | ✓ + skeletons | W1 |
| F11 Notifications, unsubscribe | W1 | ✓ | fix, 1 major (bell count race) | ✓ | 3/3 | ✓ + rail avatar | W1 |
| F12 Catalog list | W1 | ✓ | fix, 2 major (test bugs) | ✓ | 3/3 | ✓ | W1 |
| F13 Card, page, quick view | W1 | ✓ | fix, 1 major (mini card badge row) | ✓ | 3/3 | ✓ | W1 |
| F20 Checkout quantities | W2 | ✓ | accept, 2 minor | ✓ (both already in; 2 e2e guards) | 3/3 | ✓ | W2 |
| F21 Customer wallet | W2 | ✓ | fix, 3 major (2 spec locators; date fields overflow at 360/390 px) | ✓ | 3/3 | ✓ | W2 |
| F22 Merchant account | W2 | ✓ | accept, 1 minor (gate warning off screen); manual gate check PASS | ✓ | 3/3 | ✓ | W2 |
| F23 Site API gaps | W2 | ✓ | fix, 2 major (settings nav overflow on phones; spec locator), 1 minor (skeleton height) | ✓ | 3/3 | ✓ | W2 |
| F30 Balance payment | W3 | ✓ | fix, 1 major (focus lost after a payment error), 2 minor | ✓ | 3/3 | ✓ | W3 |
| F31 Home sections and category menu | W3 | ✓ | fix, 1 major (spec matched the hidden previous route), 1 minor | ✓ | 3/3 | ✓ | W3 |
| F32 Content, tracking, codes | W3 | ✓ | fix, 1 major (long codes overflow at 360 px) | ✓ | 3/3 | ✓ | W3 |
| F33 Add Funds | W3 | ✓ | fix, 1 major (receipt error focus race), 2 minor (daily limit on the gross; toast text) | ✓ | 3/3 | ✓ | W3 |

Agent calls: Fable 1 (plan) + 12 (W0) + 12 (W1) + 12 (W2) + 12 (W3) = 49.

### Wave 1: sign-in, notifications, catalog, service display (2026-11-13)
- **F10 smart sign-in:** one email + password form on `POST /client/auth/sign-in` (Turnstile); the answer's `kind` opens
  the portal or the account; the Customer | Merchant switch is gone (the forgot page keeps it: two backend routes).
  New-password step for both kinds (merchant `POST /client/auth/password/change` → 2FA or done; customer
  `POST /store/v1/me/password`). "Email me a sign-in link (customers)" always visible. One sentence for every 401.
  `targetAfterSignIn` keeps a customer out of the portal and a merchant out of the account (`?next=` safe).
  `X-Turnstile-Token` on merchant register and forgot. An Arabic merchant sign-up saves `locale: 'ar'` at the first
  sign-in (`lib/merchant/signup-locale.ts`). *(The register form and the saved language were removed on 2026-11-16: see
  "Merchant application on WhatsApp".)*
- **F11 notifications:** bell with the unread count (99+) in both areas' headers, polled at most once a minute while the
  tab is visible; `/en/account/notifications` and `/en/merchant/notifications` (both now `/en/account/notifications`; All / Unread, mark one, mark all
  with `upToId`, links prefixed with the language and checked by `notificationHref`, text rendered as text, `lang`/`dir`
  per item). **`/en/unsubscribe?token=`**: a confirm button (never automatic) → "no more marketing emails" or "link
  not valid" (fixes the 404 of the marketing mails' visible link).
- **F12 catalog:** the list asks the API (type, real categories with counts, "In stock only", price range, brand,
  carrier, country, sorts Featured / Best sellers / New arrivals / price ↑↓ / A–Z); option counts still worked out over
  the cached catalog. Malformed or reversed price bounds are fixed before the request.
- **F13 display:** service pictures (`imageUrl`, `next/image`) with the brand logo and type picture as fallbacks;
  delivery = staff note or minutes in the page's language; "In stock" badge (never "Pre-order", "Out of stock" or a
  count); "per unit" and "From …" / "N for …" on the service page and quick view; the language switch and a slug of
  the other language use `alternates`; static params capped at 50 per language.
- **Lead fixes:** forgot and register skeletons reserve the new rows; the rail avatar hides on screens under 46 rem high
  (9 merchant rail items).
- **Checks:** typecheck and ESLint clean; 307 unit tests; build OK; wave specs (harness, auth, smart-sign-in,
  notifications, unsubscribe, store, catalog-filters, service-display) 250 passed / 16 skipped / 0 failed; regression
  (routing, checkout, account, support, merchant, merchant-settings) 162 passed / 4 skipped / 0 failed; desktop + mobile.
  The first wave run had 11 failures in the new specs: 9 were test bugs, the rest real (bell count race), all fixed.

### Wave 2: checkout quantities, customer wallet, merchant account, API gaps (2026-11-13, finished 2026-11-15)
- **F20 checkout quantities:** one control per mode from `lib/quantity.ts` (a number box for a range, radios for packs, a
  select above six, none for one per order or exactly N); the rule is state, read again after a server `invalid_quantity`
  (text built from the rule, never the server's English; the control redrawn and focused, a named group for no-control
  modes); a quantity the rule no longer allows falls back to the default with a notice; summary "Price per unit /
  Subtotal (N units) / Estimated total"; the review page shows the session's own totals; restart, resume and the expired
  link keep `&quantity=`.
- **F21 customer wallet:** `/en/account/wallet` (balance cards, statement with a date range, the on-hold state without
  the staff reason, disabled and negative states); the balance pill in the account and shop headers and a Wallet menu
  item; the wallet read is `no-store` inside `<Suspense>`; the merchant wallet page uses the same components.
- **F22 merchant account:** the profile edits the address, the tax id and the email language; "Resend verification email"
  while unverified (`429` shows the wait); "Made by support" on staff-made API keys; Announcements sent with the shown
  Telegram value; `MustChangePasswordGate` keeps the merchant on settings/security until the password changes (warning in
  view); the language switcher follows the page's same-origin hreflang link and saves the merchant's language.
- **F23 API gaps:** the merchant order form sends one `Idempotency-Key` per body (new after a success or
  `IDEMPOTENCY_KEY_REUSED`; `IDEMPOTENCY_IN_PROGRESS` waits and retries up to 3 times); quantities per `lib/quantity.ts`;
  customers edit their name, phone and country in the settings (only changed keys; the currency cookie from the answer).
- **Resumed on 2026-11-15:** the previous lead session stopped at its weekly usage limit during the W2 review (F20 and F23
  were reviewed, F21 and F22 not). A new lead session (started from the backend project at the owner's request) restarted
  the containers and the isolated API (`:3100`), rebuilt the hand-offs from the workflow journals, ran the F21 and F22
  reviews and the F20 fixer, then the wave check below.
- **Manual check (plan §7):** `mustChangePassword` on a throwaway merchant (`gsm_storefront` only): every portal page sent
  the merchant to settings/security with the warning, in English and Arabic; the gate lifted after the change.
- **Checks:** typecheck and ESLint clean; 381 unit tests; build OK; wave specs (checkout, quantity, wallet,
  merchant-settings, merchant-account, account, customer-profile, merchant, merchant-order-idempotency) 236 passed /
  9 skipped / 1 failed: a "socket hang up" on the sign-in through the site's proxy (`merchant.spec.ts:528`, mobile), which
  passed on both projects when run again; `wallet-disabled` (exclusive) passed alone and switched the setting back on;
  regression (auth, smart-sign-in, notifications, unsubscribe, store, catalog-filters, service-display, routing, support,
  harness) 280 passed / 16 skipped / 0 failed; desktop + mobile.

### Wave 3: balance payment, home sections, content and codes, Add Funds (2026-11-15)
- **F30 balance payment:** the review page offers "Store balance" beside the card when the session says `balancePayable`
  (picked by default when ready); one click pays through `POST …/balance-payment` (no body, no Content-Type, its own
  idempotency key; in-progress waits and retries, a reused key retries once) and goes straight to tracking. States: sign
  in, not enough balance (figures and Add funds), on hold, reopen as a signed-in checkout; 401 never signs out, 403 offers a
  new checkout, 402/409 refresh the choice. USD gross compared as money, never as floats.
- **F31 home sections and category menu:** Best sellers (`popular`, newest first) and New arrivals (`listedAt`) with four
  cards and View all links that keep the sort; an "All categories" menu in the desktop nav and a Categories block in the
  phone drawer (`Name (count)`, keyboard and Escape).
- **F32 content and tracking:** the sitemap lists every published content page in both languages (noindex skipped); the
  help article has a Yes/No vote (thanks, 429 wait); tracking shows delivered codes one per line with Copy and Copy all
  (long codes wrap); the pending text promises no time.
- **F33 Add Funds:** `/account/wallet/add-funds` (methods and limits read on the server, client checks against the method
  and the daily limits on the gross, one key per attempt), `/account/wallet/top-ups/[id]` (status, staff instructions and
  rejection reason as text, receipt upload, cancel), a Top-ups card on the wallet page and the `?topUp=` return notice.
- **Lead:** the W2 fallout title in `e2e/wallet.spec.ts` (`?topUp=` now shows a notice).
- **Checks:** typecheck and ESLint clean; 456 unit tests; build OK; first W3 run 166 passed / 2 failed (the F31 spec);
  after the review fixes the **full suite with the exclusive specs, nothing else running: 611 passed / 29 skipped /
  0 failed** (desktop + mobile).

### Final acceptance (plan §7, 2026-11-15): all 16 features done
1. **Full suite**, exclusive specs on, nothing else running, against `next start` on `:5176`: 611 passed / 29 skipped /
   0 failed (desktop + mobile).
2. **Docker image** `gsm-site:local` (built against `:3100`, 457 MB): healthy; `/robots.txt`, `/en`, `/ar`, `/sitemap.xml`,
   a site image and a service picture through the optimizer answer 200; no `.env` in the image; runs as `node`. The full
   suite against the container: 611 passed / 29 skipped / 0 failed.
3. **Manual checks:** `mustChangePassword` passed (W2 review, en and ar). Turnstile on merchant auth: the isolated API
   restarted with `TURNSTILE_MERCHANT_AUTH=true` refused a merchant forgot without a token (403) and `auth` +
   `smart-sign-in` passed 84 / 84; restarted without the switch afterwards (the same request answers 204). The backend
   lead may now switch it on in production once the site is deployed.
4. **Left for the owner:** the walk of the §2.2 acceptance lists by hand in both languages (the reviewers took en/ar
   screenshots at 1440, 390 and 360 px for every UI feature), and the owner decisions of plan §8 (wallet switch and card
   top-ups, payment provider, JOD decimals, the word "Pre-order", production values, `logo-mark.png`).
5. **Docs:** `CLAUDE.md` (Turnstile routes, the new helpers, wording, e2e notes) and `docs/BACKEND-NEEDS.md` (items 1 to 8
   closed; the open backend limitations of plan §8 plus three top-up notes found in W3).

## Merchant application on WhatsApp (2026-11-16, owner's request)
- **What changed:** `/en/merchant/register` (now `/en/become-a-merchant`; same page, still static and `noindex`) is no longer a form and sends
  nothing. It says that merchant accounts are opened by the team, lists three steps and offers "Chat on WhatsApp"
  (a `wa.me` link in a new tab with a prefilled message in the page's language) and the number as selectable text. Staff
  then create the merchant in the admin console, which sends the set-password link; the backend and the console did not
  change. `?ref=CODE` (a merchant's referral link) is read in the browser, checked (`[A-Z0-9]{1,32}`) and added to the
  message as "Referral code: CODE." with a note under the button; the note's slot reserves two lines with or without a
  code, so nothing moves when it fills at hydration (the auth layout centres the page vertically).
- **Configuration:** `NEXT_PUBLIC_MERCHANT_WHATSAPP` (build-time; `.env.example`, `docs/DEPLOY.md`). The owner's number
  `+20 12 10230575` is the `Dockerfile` default and is set in the local env files; the page shows it as the owner grouped
  it and links to `wa.me/201210230575`. Unset or malformed: no WhatsApp button, a "Contact support" button to `/support`
  instead (no steps, a neutral subtitle).
- **Open (the lead raised it with the owner):** staff create merchants with `POST /admin/clients`, which takes no referral
  code, and no staff route sets the referrer. The code a referred visitor sends on WhatsApp can therefore not be
  recorded yet: until the backend takes it, a merchant who applies through a referral link is not linked to the referrer
  (`docs/BACKEND-NEEDS.md` open item 19). The portal's Referrals text ("Merchants who sign up through it are linked to
  you") stays as it is until the owner decides.
- **Code:** `lib/contact/whatsapp.ts` (+ test), `components/auth/merchant-whatsapp.tsx` (client, `useSearchParams` behind
  `<Suspense>`) and `merchant-whatsapp-actions.tsx` (also the Suspense fallback: same button and number without the
  referral sentence). Removed: `merchant-register-form.tsx`, `lib/merchant/signup-locale.ts` (+ test) and its call in
  `sign-in-flow.tsx`, the form's `auth.register` strings. The site no longer calls `POST /client/auth/register`
  (`docs/BACKEND-NEEDS.md` open item 2 is closed). The e2e helper `freshMerchant` (now `freshAccount`) stopped calling it on 2026-11-24: staff
  create the account through the admin API (`inviteMerchant`) and the merchant sets its password from the invitation mail.
- **Retired 2026-11-23:** the `?ref=` handling, its note and `components/auth/merchant-whatsapp.tsx` went with the referral
  program (`docs/decisions/001-merchant-extras-retired.md`); the page is fully static and item 19 is closed.

## English only (2026-11-16, owner's decision; backend decision 039, feature 30)
- **Decision:** English is the only language of the system. No language field, parameter, selector, translation or
  right-to-left layout code is left in the site. The decisions of 2026-11-09 below that say "URLs carry the language (`/en`,
  `/ar`)" and "Fonts: Inter + IBM Plex Sans Arabic" are history; the lines of the milestones, the waves, the vitals table
  (`/ar` runs) and the checks stay as they were written.
- **URLs:** `/en/…` stays. Every `/ar/…` address answers a 308 to the same path under `/en` with its query (`next.config.ts`,
  before `proxy.ts`). `proxy.ts` sends a path with no language (email links) to `/en…` and reads no cookie or
  `Accept-Language`. The cookie `gsm_locale` is no longer read or written. An old Arabic service, page or help address that
  the API remembers (`GET /store/v1/legacy-slugs/…`) sends the reader on to the English page (an instant redirect inside the
  page; the pages are `noindex`), else to the list or the not-found page. No `hreflang`, no Arabic sitemap entry.
- **Code:** the `ar` block of the 14 message files, the language switcher, the saved-language selects, the Arabic font
  (one Google font remains: Inter), the `html:lang(ar)` CSS, the 37 `rtl:` variants, `:root[dir="rtl"]` and the
  `--inline-dir` variable, the mirrored banner art and the three reads of the computed direction (`segmented-control`,
  `menu`, `ghost-text`) are gone. No request carries `locale` (`lib/api/no-locale.test.ts`); the stream parser accepts an
  item without one. `lib/api/schema.gen.ts` is generated from the final backend contract (125 operations, no language union).
- **Kept (group C, Arabic text as data):** `dir="auto"` on text people type, `<bdi>` around API values, `dir="ltr"` on codes
  and numbers, Arabic-Indic and Persian digits typed in quantity, amount, IMEI and order boxes (written as code points),
  the input-method guard of the ticket reply box (`lib/support/send-key.ts`), initials of a name in any script, the
  `cleanText` pass-through of an Arabic search. `components/user-text.test.tsx` and the group C unit tests protect them.
- **Guard:** `scripts/check-english-only.mjs` (the same file in the backend, the console and here) runs in `npm run lint`,
  with `scripts/english-only.config.json` (roots, an allowlist of group C tests and old-address code, and `keep` entries for
  the files that protect user text). It fails on Arabic script, the `ar` locale, `rtl:` variants and `dir="rtl"` outside
  the allowlist.
- **Cleanup wave (S6 to S9, no URL, text or behaviour change):** the constant `locale` argument and prop are gone from
  `lib`, `components` and `app`, `localePath` is `sitePath(path)` (`lib/site-path.ts`), `getLocale()`, `getMessages()` and
  `defineMessages` are gone (a message namespace is a plain object), and the folder `app/[lang]` was renamed `app/en` (a plain folder; its
  `layout.tsx` is the root layout). Reviewed by Opus (pass, no finding).
- **Merged 2026-11-17.** Feature 30 as `73534db` (with the backend `f354855` and the console `b24098b`; the demo database
  `gsm_storefront` and the owner's `gsm` were migrated the same morning, after a backup). Checks on `main`: `npm run check`
  green (937 unit tests, build), full e2e in dev mode against the isolated API 650 passed, 59 skipped, 1 failed under load
  and passing alone. The cleanup wave is its own `refactor` commit: `npm run check` green (937 tests, build with `app/en`),
  full e2e 650 passed, 59 skipped, 1 failed under load and passing alone (`support-live.spec.ts:167`).
- **e2e in dev mode (for whoever runs it next):** `go()` waits for the first form control only, and since the header has a
  search box that is the header's. A spec that types into a form lower on the page right after `go()` or `page.reload()`
  must call `hydrated(page)` first (`e2e/helpers.ts`; `merchant-account.spec.ts` does). `go()` itself must not wait for
  every control: `top-ups.spec.ts:415` reads the server-rendered notice before the page's effects run. Under machine load
  `merchant.spec.ts:144` and `support-live.spec.ts:167` failed once each and passed alone. The main checkout's
  `.env.development.local` points at the owner's API (:3000), so its e2e needs `GSM_API_ORIGIN=http://localhost:3100`.
- **`../STOREFRONT-HANDOFF.md` was found empty on 2026-11-17** (saved empty on 2026-11-15) and was restored from the last
  copy that could be found (the text of 2026-11-09), under a banner; `../STOREFRONT-BACKEND-HANDOFF.md` section 18 is the
  English-only handoff and wins wherever they differ.

## Payment method logos (feature 32) and the IMEI-HUB brand (2026-11-17, owner's requests)
- **Payment method logos, `2c4a064`** (backend decision 041, B232; handoff section 19). Every payment method the API lists
  carries `preset` and `logoUrl` (the `paymentMethods` of `GET /store/v1/config` and of a checkout session,
  `GET /store/v1/me/wallet/top-up-methods`, `GET /client/payment-methods`). `components/ui/payment-method-logo.tsx` (a Client
  Component) draws, in this order: the logo staff uploaded, the bundled logo of the ready-made method
  (`public/images/payments/<preset>.png`, listed in `lib/payment-logo-sizes.json` by `npm run logos`), an icon (bank, coin,
  card, banknotes for Wise, as before); a picture that fails to load falls back to the next. Used in the customer's Add funds
  form, the merchant's top-up form and the checkout. No URL, text or behaviour changed. Sources of the five logo files:
  `docs/LOGOS.md`. Built by Sonnet, reviewed by Opus (one fix round), walked by hand by the lead on the isolated API.
- **The brand, `d1ad6d5`.** The shop is **IMEI-HUB** (was "GSM Store"): the owner's logo in every header, footer and the
  workspace rail (`components/layout/logo.tsx`: mark and wordmark pictures in whole-pixel boxes, white-ink copies on dark
  surfaces, a size smaller below 640 px, the name hidden under 360 px), the tab and touch icons (the mark on a white tile),
  and the name in every title and message; tagline "GSM Services & IMEI Solutions". Never write the old name again. The kit
  (the owner's picture, the cutting script, every file) is outside the repository: `/home/saifi/gsm-project/.brand/`.
- **E2E on a production build.** The owner's dev server held :5175 and calls the owner's API (real mail), and Playwright
  would have reused it: the suite ran against `npm run build && npm start` (:5176) with
  `E2E_BASE_URL=http://localhost:5176 GSM_API_ORIGIN=http://localhost:3100`, the isolated API running the backend branch.
  First run: 660 passed, 47 skipped, 3 failed. Two were the new logo, wider than the old one: the header was 4 px too wide
  in a 345 px window and the page scrolled 1 px sideways on a phone when signed in (fixed: the smaller boxes below 640 px).
  Second run, after that fix: 661 passed, 47 skipped, 2 failed, both tests, not the site (`6587843`): `routing.spec.ts`
  expected a streamed 200 for an old service address, where a production build that already resolved it answers 308 (with a
  `Location`, sometimes written twice with the same value, or without one and with the same `noindex` page); and the
  merchant notification settings test, which did not wait for the answer to its last save, so a run under load left the
  alert set and every later run found the Save button disabled. Both were fixed and rerun green in both projects; the app
  code did not change after the second run.
- **Left in the demo database by the hand walk:** one switched-off Vodafone Cash method (it has a credited top-up of a
  throwaway customer, so it cannot be deleted).
- **Checks on `main` after the merge:** `npm run check` green (generated types up to date with the merged backend, 125
  operations; typecheck; lint; 984 tests in 90 files; build). The whole e2e was the second run above, on the branch whose
  tree `main` now has.

## Featured collections: best sellers in each card (2026-11-19, owner's request)
The owner disliked the banner cards: three copies of the same tag, line and "Explore collection" button, one dark card
for no reason, and the brand tiles above already name the biggest groups. Of five mockups the owner chose "Peek inside".
- `CollectionCards` (`components/store/home-collections.tsx`): one card per collection. The head (mark, name, kind,
  count, lowest price; link "Explore collection: X") and the foot ("View all N services") open the filtered catalog; in
  between, its three best sellers (title, delivery time, price), each opening its service page. Mark: the logo in a
  circle (symbol) or a pill (word mark), else a brand's initials, a country's globe or a carrier's signal. Same-size
  skeleton.
- `catalogCollections` (`lib/catalog.ts`) adds `top`: one cached `GET /store/v1/services?_sort=popular&_order=desc` of 3
  rows (`COLLECTION_PEEK`) per collection, filtered by `collectionFilter` (`lib/catalog-facets.ts`); the cards carry no
  sales number, so the catalog cannot rank them itself.
- The optional `collections/<kind>-<name>.jpg` art is gone (`docs/IMAGE-PROMPTS.md`). Countries show a globe: the site
  has no flag files.
- **Checks:** typecheck, ESLint and the English-only guard; Vitest `lib/catalog.test.ts` and `lib/catalog-facets.test.ts`
  (46 pass); e2e `store.spec.ts -g "featured collections"` (desktop and mobile) on a production build against :3100. The
  whole `npm run check` and the whole e2e were not run.

## Wiring (changed 2026-11-09, late evening, at the owner's request)
- **Dev site (`npm run dev`, :5175) → the isolated demo API (:3100) since 2026-11-10**, at the owner's request (to
  see the home page with data). `.env.development.local`: `GSM_API_ORIGIN=http://localhost:3100`; start the API with
  `scripts/dev-backend.sh start`. Back to the owner's API: set `http://localhost:3000`, then restart `npm run dev`
  (the origin is read only at start-up: `next.config.ts` rewrites and `lib/api/server.ts`). The owner's DB (`gsm`)
  is almost empty (1 currency, 0 services, 0 gateways): the shop shows empty states there.
- Demo data change (2026-11-10, DB `gsm_storefront` only, SQL): the 5 Arabic listings (ids 15–19, made on 2026-11-09
  through the admin API) got the brand, carrier, country, sort and featured flag of their English listing, plus an
  Arabic summary and ETA text, so the Arabic home shows the tiles and the featured section. Still 5 Arabic listings
  (e2e expects 5, and T-Mobile English-only). A `dev-backend.sh reset` undoes it.
- **Backend gaps (owner/lead):** listed in `docs/BACKEND-NEEDS.md` (listing content not editable in the admin API,
  stock/availability, categories, localized delivery time, best sellers, new arrivals).
- `backend/.env` (owner's file) got 3 lines: `CORS_ORIGINS` (console origins + :5175), `PORTAL_BASE_URL=http://localhost:5175/merchant`,
  `STORE_BASE_URL=http://localhost:5175`. The main API and worker were restarted detached with the owner's usual
  commands (`bun --watch src/main.ts`, `bun --watch src/worker.ts`); logs and PIDs in `/tmp/gsm-main-backend/`.
- **Production build / e2e (`npm start`, :5176) → the isolated demo API (:3100)** via `.env.production.local`
  (the e2e suite needs the demo data). Start it with `scripts/dev-backend.sh start`.
- Merchant `progammerabood@gmail.com` (main DB, id 2) has the password chosen by the owner (set with the backend's own
  policy check and argon2 hasher; verified by signing in through the site).
- Mail on the main API now goes out for real through Resend from `GSM <noreply@imei-hub.com>` (2026-11-13; see the section
  "Mail through Resend on imei-hub.com" below). Its links still point at `http://localhost:5175` (dev `STORE_BASE_URL`).

## Home page redesign (2026-11-10, uncommitted)
Rebuilt after the mockup `screenshots/GSM Store E-Commerce Dashboard (1).png`, with only what the API has:
- Page is `wide` like the header. Order: hero (lowest price "Starting from", streamed) + quick IMEI check + track card;
  tiles strip (brands, then carriers when brands do not fill the row, each with its service count); featured services;
  "How it works" beside four dense "More services" cards; three banners (merchants, help center, support).
- `ServiceCard` is the compact mockup card everywhere (home and catalog): thumb + brand wordmark, type tag, title,
  summary, delivery and carrier/country, price + "Order now". New `ServiceCardMini`.
- Tokens: `text-hero`, `text-micro`, `sheen-inverse` / `sheen-surface` (lit surfaces, shown only while a card has no
  image). Primitives: `Badge caps`, `Card radius`, `IconButtonLink`.
- New image slots `home-merchants.jpg`, `home-help.jpg`, `home-support.jpg` (`docs/IMAGE-PROMPTS.md`). The `home-*`
  images are mirrored on the Arabic site.
- Checked 2026-11-10 on a copy against the demo API (:3100): typecheck, ESLint, 66 unit tests, `e2e/store.spec.ts`
  34/34 (desktop + mobile), `next build` OK (home still partial prerender); screenshots at 1440 / 1024 / 768 / 390 px in
  en and ar, with and without images, no horizontal overflow, no console errors.

## Home: All services, Quick View, Featured collections (2026-11-10, uncommitted)
The three mockup parts that were missing, adapted to the API (no categories, stock, cart or favourites, handoff §1.7):
- **Featured collections** (`components/store/home-collections.tsx`): the brands, countries and carriers with the most
  services (2+ each, at most 2 of a kind, 3 in all; `pickCollections` in `lib/catalog-facets.ts`), each with its count
  and lowest price, opening `/services?brand=…|country=…|network=…`. Hidden below 2. (Since 2026-11-19 each card lists
  its best sellers instead of art: "Featured collections: best sellers in each card".)
- **All services** (`components/store/home-products.tsx`): sidebar (drawer on phones) with brand / carrier / country
  lists, each option a link with the count it would leave (`facetOptions`, worked out over the cached catalog, the
  same rules as the API: other filters + search), search box, sort, 8 dense cards per page, chips, pages. State in the
  home URL (`/en?brand=Apple&page=2#all-services`): works without JavaScript; the home's canonical is `/en`, `/ar`.
- **Quick View**: an eye link on every card (`/en/quick-view/<slug>`) is intercepted in the store layout's `@modal`
  slot (`app/en/(store)/@modal/(.)quick-view/[slug]`) and opens a large Modal over the page: type, chips, summary,
  price (visitor currency), delivery, quantity, carrier/country, description, requirements, "View full details" and
  "Buy now". Esc / backdrop / X go back in history. Opened directly, the URL is the service page (noindex, canonical
  `/services/<slug>`). The frame shows only while the URL is a quick view (`usePathname` in its own `<Suspense>`), so a
  link followed from inside removes it and Back shows it again (no catch-all slot page needed).
- Shared pieces: `components/store/banner.tsx` (from home-parts: tag, side art, lit surface, arrow), `ActiveFilters`
  chips (also on `/services`), `DialogLink`, `Pagination hash`.
- Checked: typecheck, ESLint, 74 unit tests, `e2e/store.spec.ts` 42/42 (4 new × desktop + mobile) on the dev site,
  `next build` OK (171 pages; home, both quick-view routes ◐; service pages still prerendered per slug). Full e2e on the
  production build: 242 passed, 4 skipped, 2 failed: `merchant.spec.ts` "custom field … instant order" (both
  projects), because the demo DB's stock of instant codes for service 15 is used up (17 sold, 0 left), not a code
  change. Screenshots en/ar at 1440 / 1024 / 768 / 390 px: no horizontal overflow; console shows only Next's dev
  "instant navigation" insight, also on untouched routes (`/en/help`).

## Home list sidebar like the mockup (2026-11-10, uncommitted)
- The "All services" sidebar is now the mockup's: Categories (the service types: the store API has no categories),
  a two-thumb price range (`components/ui/range-slider.tsx`, values above the track, applies when released or 300 ms
  after the last key press), then brand, carrier and country. Square checkboxes (`Checkbox size="sm"` with a count),
  several options of one list add up (`brand=Apple&brand=Samsung`). A change applies at once without moving the page
  (GET form, works without JavaScript); the phone drawer stays open while picking and closes with "Show results".
- The home list is worked out in memory over the cached catalog (`homeList` in `lib/catalog.ts`, rules in
  `lib/catalog-facets.ts`), since the API cannot filter by type or price; `allListedServices` now keeps the API's
  default order (featured first). Price chips and slider values are laid out left-to-right in Arabic.
- **Availability ("In stock only") is not built:** the store API has no stock field (see `docs/BACKEND-NEEDS.md` §1).
- Checked: typecheck, ESLint, 78 unit tests, `e2e/store.spec.ts` 43 passed + 1 skipped (desktop + mobile), screenshots
  en/ar at 1440 and the phone drawer at 390 px.

## Brand and carrier logos (2026-11-10, uncommitted)
- 86 logos in `public/images/brands/` (65: phone brands, GSM tools, games and apps) and `public/images/carriers/` (21),
  transparent PNGs cropped to the logo, ~96 px high, ~680 KB in all. Sources: Simple Icons 16.37.0 (CC0 drawings, brand
  colour), Wikimedia Commons (public-domain files), the owners' own sites (Umniah, STC, du, Turkcell, Korek, Jawwal,
  Omantel, WE, Chimera, Octoplus, Z3X, Sigma, Halabtech, Free Fire, Doogee, Ulefone, Blackview). Every file, its source
  and terms, how to add one, and what is still missing: `docs/LOGOS.md`. Trademarks of their owners.
- Shown in place of the initials (brands) and the signal icon (carriers) on the home tiles and light collection cards.
  For a service the brand's logo replaces the type picture (only a fallback): card corner (`ServiceMark`; a symbol logo
  keeps the name beside it), quick view and service page (`ServiceArt brand`). Without a brand logo the type picture stays. `Logo`, `logoFile`, `logoSlug`,
  `LOGO_ALIASES` in `components/store/service-art.tsx` (a longer name finds its first words: "Cricket Wireless" →
  `cricket.png`). Sizes come from `lib/logo-sizes.json` (`npm run logos`, `scripts/logo-sizes.mjs`): reading a file
  while rendering made Next report `Date.now()` during the prerender.
- More Wikimedia logos (EE, Three, Zain, Mobily, Etisalat, Ooredoo, Rogers, Bell, Telus, Cricket …) were still
  downloading at this point: the server limits the rate.
- Checked: typecheck, ESLint, 78 unit tests, `e2e/store.spec.ts` 45 + 1 skipped, `next build` OK, screenshots of tiles,
  cards and collections (no broken images, no console errors).

## Catalog page uses the same list (2026-11-10, uncommitted)
- `/services` and the home's "All services" are one component: `components/store/service-list.tsx`
  (`loadServiceList` + `ServiceList`, configured per page: path, cards per page (home 8 dense, catalog 24 full cards),
  anchor, drawer id). Same sidebar (categories, price range, brand / carrier / country checkboxes), toolbar, chips and
  drawer; several brands/carriers/countries also work on `/services` now. The home's "Open the catalog" keeps every
  filter. `catalogList` (was `homeList`) in `lib/catalog.ts`.
- Removed: the old select-based `CatalogFilters` / store `FilterForm`, `catalogFacets`, `withoutParams` and the
  "All brands/carriers/countries" strings (the merchant portal's own `FilterForm` is unchanged).
- Picture per service: none in the API or from the suppliers (their synced fields have no image), so cards show
  the type's picture: `docs/BACKEND-NEEDS.md` §7.
- Checked: typecheck, ESLint, 78 unit tests, `e2e/store.spec.ts` 45 passed + 1 skipped, `next build` OK (171 pages,
  `/en` and `/en/services` ◐), screenshots `/services` en/ar 1440 and 390 px, no overflow.

## Site images added (2026-11-10, uncommitted)
- The owner added 9 images (`home-*` ×5, `service-*` ×4). They were PNG data named `.jpg`: converted to real JPEG
  (q86, same size in pixels, ~1.6 MB → 50–110 KB each). Then `sign-in-hero.jpg` and `og-default.jpg` (renamed from `sign-in-hero..png` / `og-default.jpg.png`, converted;
  share image resized to 1200 × 630). Still missing: `logo-mark.png`. The sign-in image now fills the space under the
  hero text instead of sitting behind it.
- `siteImage()` checks the folder on every render in development (new files show without a restart); production
  still checks once per run. Banner art is anchored right (mirrored in Arabic); the service page shows the whole image.
- Checked: dev site en/ar at 1440/768/390, production build against the demo API (home, catalog, service page),
  `e2e/store.spec.ts` 34/34.

## Mail through Resend on imei-hub.com (2026-11-13, owner's request)
- **Domain:** `imei-hub.com` is verified in Resend: a send from `noreply@imei-hub.com` is accepted, a control from an unverified
  domain gets `550 … domain is not verified`. DNS (Cloudflare): DKIM `resend._domainkey` TXT ✓, `send` CNAME → `send.forge.rmta.net`
  (SPF + MX for the return path) ✓, **no DMARC record** (owner: add `_dmarc` TXT `v=DMARC1; p=none; rua=mailto:<monitored address>`).
  The Resend key in `backend/.env` is send-only, so the Resend API cannot read domains or delivery status.
- **Config:** `backend/.env` `MAIL_FROM="GSM <noreply@imei-hub.com>"` (was `onboarding@resend.dev`, Resend test mode). The owner's
  API and worker on :3000 reloaded (bun `--watch`). The 3 failed mails in DB `gsm` (2 merchant invitations, 1 approval, Nov 9–11)
  were the test-mode `550`; they were not re-sent (real recipients: staff can re-send from the console).
- **Backend fix (uncommitted, for the backend lead):** `classifyMailError` (`backend/src/modules/platform/notifications/mail-driver.ts`)
  failed a 4xx answer at MAIL FROM/RCPT/DATA for good (nodemailer codes them `EENVELOPE`/`EMESSAGE`), so a Resend rate-limit reply
  lost the mail; and a refused login (`EAUTH` 535, wrong or rotated key) failed every mail. Now the answer code decides (4xx retried,
  5xx permanent) and a refused login is retried. +3 specs; mail specs 11/11, 7 mail integration files 158/158, backend typecheck OK.
- **E2E guard:** `playwright.config.ts` refuses to run unless the site under test uses the isolated API (:3100). The dev site
  points at :3000, which now sends real mail: e2e's made-up addresses would bounce and hurt the domain's reputation.
- **Tested end to end** on the isolated backend (:3100; DB `gsm_storefront` migrated 20 → 31 in place) with its mail sent through a
  scratch relay that passed only `@resend.dev` test sinks to Resend (everything else to Mailpit): customer sign-up (magic link),
  customer reset, merchant registration (verify), merchant reset, staff invitation + re-send, approval, wallet adjustment,
  `order.received` (balance payment) and `order.completed` (staff reply): 13 messages accepted by Resend, 0 refused, every row
  `sent` on the first attempt. Links: `STORE_BASE_URL/sign-in?token=`, `PORTAL_BASE_URL/verify-email|set-password?token=`.
- **Open (owner/backend lead):** DMARC record; a Reply-To (no inbox exists on imei-hub.com and ~13 templates say "reply to this
  email": e.g. Cloudflare Email Routing for `support@` + an optional `MAIL_REPLY_TO` setting); production must set
  `STORE_BASE_URL`/`PORTAL_BASE_URL`/`CONSOLE_BASE_URL` to the public https hosts (nothing refuses localhost in production);
  `ALERTS_EMAIL_TO` is unset (alert mails fail "No alert recipient"); "Hi ," for nameless customers and "there" in Arabic mails;
  the default order mails speak of an "unlock" for every service. The storefront still lacks the `/unsubscribe` page (handoff
  backend §4.2): the visible unsubscribe link in marketing mails 404s.
- **Agent usage:** one workflow (read-only): 3 agents (transport audit, content audit, flow recipes) + 8 verifiers; stopped before
  further verify batches under the owner's new limits (≤ 3 agent calls per feature). 5 findings confirmed, 3 refuted.

## Home: the balance box takes the place of the free IMEI check (2026-11-23, owner's request)
- **Removed for good:** the quick IMEI card of the home page, the page `/en/imei-check` (it answers 404 now), its links in the
  header, the phone drawer and the footer, its sitemap entry, and the "Check IMEI …" option of the search box and of the results
  page (an IMEI typed in the search offers nothing: the API runs no search for one). The site no longer calls
  `POST /store/v1/imei/check`; the backend keeps that route (it is a rule of its own map).
- **In its place:** `components/store/home-balance.tsx` (drawn by `home-balance-view.tsx`, decided by `lib/wallet/home-balance.ts`):
  the available wallet balance of the signed-in visitor (the merchant's when a merchant is signed in and approved, else the
  customer's when the wallet shows) with "Add funds" and "Open wallet"; a visitor who is not signed in gets "Sign in". It shares
  the header's reads (`readMerchantWallet`, `readCustomerWallet`; now `readAccountWallet`), so it costs no API call of its own.
- **Also fixed:** a long service name in a "Featured collections" card widened the whole home page on phones (the card is a grid
  item and had no `min-w-0`).
- **Checks:** typecheck, lint, 997 unit tests, a production build; the home page looked at in a browser at 1440 and 390 px (no
  sideways scroll at 390 and 360 px). The e2e specs were changed to match but not run.

## Home: a floating WhatsApp button (2026-11-23, owner's request)
- `components/store/whatsapp-float.tsx`: a round button with the WhatsApp logo (`public/images/brands/whatsapp.png`), fixed to the
  bottom end corner of the home page only. A click opens `https://wa.me/<number>` in a new tab: a chat with the team's number
  (WhatsApp Web or the desktop app on a computer, the app on a phone), nothing typed in advance.
- The number is the site's one WhatsApp number, `NEXT_PUBLIC_MERCHANT_WHATSAPP` (build-time; the Dockerfile's default applies
  unless the build gives another). Not configured: no button.
- **Checks:** typecheck, lint, 1000 unit tests, a production build; looked at in a browser at 1440 and 390 px (it stays in
  its corner while the page scrolls; no sideways scroll).

## Footer: the payment methods the shop takes (2026-11-23, owner's request)
- `components/layout/payment-marks.tsx` in the footer of every shop page: the owner's list of 23 methods in three groups (cards and
  bank transfers, exchange pay, crypto and Web3 wallets), each a logo on a light tile with its name. **Static on purpose** (the
  owner's word): the list is `lib/payments/accepted-methods.ts` and nothing is read from the API, so it does not follow what the
  checkout offers.
- 19 logo files in `public/images/payment-marks/` (sources and terms in `docs/LOGOS.md`). Bank transfers and Express Wallet show
  an icon; opBNB shows the BNB Chain mark.
- **Checks:** typecheck, lint, 1003 unit tests, a production build; the footer looked at in a browser at 1440 and 390 px (all
  logos load, no sideways scroll).

## Merchant extras retired (2026-11-23, owner's decision; `docs/decisions/001-merchant-extras-retired.md`)
- **Gone:** the merchant Referrals page and the referral code row of the settings; the Webhooks pages and the delivery log;
  the REST API parts of the API keys page (an API key is a Dhru credential only: the create form sends `scopes: ["dhru"]`);
  the Telegram channel of the merchant notification preferences and every notification sound (the switch of both notifications
  pages and the bell's arrival chime: nothing plays a sound); the rating and the typing line of a ticket; the per-device
  session list of the merchant security page; the quick-order box, the order-status summary bar and the "order again" cards of
  the merchant dashboard. The merchant application page stays
  (WhatsApp, now fully static: `?ref=` is ignored), as do seen marks, live ticket messages, attachments, the email
  preferences, the bell (swing, badge pop, rolling number, title badge), the password and two-step cards and the rest of the
  dashboard.
- **Old addresses:** `/en/merchant/referrals` → 308 `/en/merchant`; everything under `/en/merchant/webhooks` → 308
  `/en/merchant/api-keys` (both also without `/en`, in `next.config.ts`). Since decision 002 they end at `/en/account` and
  `/en/account/settings/api-keys`, straight from `lib/account/legacy-paths.ts`.
- **Release order:** the shop calls none of the retired routes and ignores the retired fields, so it runs against the backend
  before and after their removal; `docs/BACKEND-NEEDS.md` items 20 to 32 say what the removal must keep. `lib/api/schema.gen.ts`
  is regenerated after the backend removal; the decision lists the bridges that go then. Item 19 is closed. The order detail
  no longer reads `clientNote` and the invoices filter no longer offers the kind `statement` (items 31 and 32).
- **Checks:** typecheck, lint, a production build, and the whole unit suite passes (983 tests). The browser specs were updated, not run.

## One account (2026-11-24, owner's decision; `docs/decisions/002-one-account.md`, backend decision 064, console decision 023)
- **What changed:** the customer area and the merchant portal are one account area at `/en/account`. An account has a rank, retail or
  merchant: every account has the overview, orders, wallet, notifications, support and settings pages; a merchant rank adds the price
  list, invoices, API keys and notification preferences. The folders `app/en/(portal)` and `app/en/(auth)/merchant` are gone.
- **Session:** one reader (`getAccount`, `requireAccount`, `requireRank`, `signInPath` in `lib/api/session.ts`; one `AccountMe`), one
  CSRF token in the browser client, the cookie names known to `lib/api/account-cookie.ts` only, `lib/account/{family,routes,capabilities}.ts`
  for the family of routes and what a rank may see. A refusal for the rank (`RANK_NOT_ALLOWED`) never signs anybody out.
- **Sign-in:** one form with no kind; sign-up by the email link; forgot, set password and verify email are one page each, with mailed
  links at the shop root; `/en/become-a-merchant` (WhatsApp) replaces `/en/merchant/register`; the link page has the guest-orders box;
  the retail two-step routes are `/store/v1/me/2fa/*`.
- **Old addresses:** `lib/account/legacy-paths.ts` is the one table; `next.config.ts` redirects each row with and without `/en`;
  `proxy.ts` knows no portal address; `legacyAccountPath` rewrites stored links. `lib/account/one-account.test.ts` fails when
  another file names a CSRF cookie or links to `/merchant`.
- **Clean-up:** the three browser specs that still used old helpers use `signIn`, `signUpByLink` and `freshAccount`; message groups no
  page reads are gone (the merchant file's wallet, top-up and invoice groups, the old ticket-list texts, the portal support texts and
  a few single keys); the ignored family argument of `csrfToken` and `forgetCsrf` is gone. `CLAUDE.md`, `README.md`, `docs/DEPLOY.md`,
  `docs/BACKEND-NEEDS.md` and `scripts/dev-backend.sh` (`PORTAL_BASE_URL` is now the account address) say the new words.
- **What replaced what:** `getMerchant`, `getCustomer`, `requireMerchant`, `requireCustomer` → `getAccount`, `requireAccount`, `requireRank`;
  `readMerchantWallet`, `readCustomerWallet` → `readAccountWallet`; `MerchantBanner` → `RankBanner`; `MerchantPriceHint` → `RankPriceHint`;
  `e2e` `signInCustomer`, `signInMerchant` → `signIn`; `freshCustomer`, `freshMerchant`, `inviteMerchant` → `freshAccount` (or `signUpByLink`);
  `customerIdByEmail`, `merchantIdByEmail` → `accountIdByEmail`; `creditCustomer` → `creditAccount`; `smart-sign-in.spec.ts` → `sign-in.spec.ts`.
  The entries of this file above and below keep the addresses and names of their date.
- **Checks (2026-11-24):** typecheck: 0 errors in the whole shop; `npm run lint` clean (ESLint and the English guard); the whole unit suite
  passes (153 files, 1,544 tests); `npm run gen:api:check` up to date against the merged backend's OpenAPI (110 operations); `npm run build`
  passes against the isolated backend (:3100). The browser specs were written and type-checked, not run.

## Own prices in the shop (2026-11-24, owner's request; `docs/decisions/003-own-prices-in-the-shop.md`, backend decision 066)
- **What changed:** the price list of a merchant rank is retired. `/account/services` leaves the rail, the drawer, the tab bar (a
  merchant rank's tabs are the retail ones with its wallet), the account area's header search, the avatar menu, the home banner and
  the "New order" buttons; it redirects to `/services` (`lib/account/legacy-paths.ts`), and the old order form address
  `/account/services/<id>` redirects to the service's checkout (or `/services` without a shop page). `capabilitiesOf` lost
  `priceList`; `RankBanner` and `RankPriceHint` are gone.
- **Own prices:** a personal layer in the browser (`lib/store/own-prices.ts`, `components/store/own-price.tsx`, mounted once in the shop
  layout) shows an account of a merchant rank its own price in every price slot: cards, collection rows, search suggestions, the
  service page and the quick view (with "Buy now" off for a service it may not buy). It reads `GET /client/auth/me` once per session
  and `GET /client/services?ids=…` (≤ 100 ids a call, `no-store`, kept 5 minutes in the tab), only when the portal family's cookie is
  there: guests and retail accounts read nothing and see the page as before. An inline guard in the root layout hides the server's
  public prices from a merchant session until the page is live. The hero's "Starting from" and a collection's "From" are not shown to
  a merchant rank; the price sort and filter keep the public prices. `PriceBlock` moved to `components/store/price-block.tsx`.
- **Buying:** `/checkout?service=<slug>` mounts the merchant order form for a merchant rank (`MerchantCheckout`, file services
  included; `checkoutAccess` answers `order-form`); the retail form never mounts for it. The notice of an open checkout and of a 403
  `RANK_NOT_ALLOWED` now leads to that address. The service details card moved to `components/merchant/service-about.tsx`.
- **API:** the `ids` parameter is in the regenerated `lib/api/schema.gen.ts`; `OwnPricesQuery` (`lib/store/own-prices.ts`) is the exact query the layer sends.
  Release the backend first (an unknown parameter is a 422, and the slots would show no price).
- **Checks (2026-11-24):** typecheck: 0 errors; `npm run lint` clean (ESLint and the English guard); the whole unit suite passes
  (154 files, 1,581 tests). The browser specs (`merchant`, `merchant-order-idempotency`, `checkout`, `routing`, `home-sections`,
  `account`) were updated and type-checked, not run.

## One name per field (2026-11-24, `docs/decisions/004-one-field-name.md`, backend decision 065)
- **What changed:** the merchant order page (`/en/account/orders/<id>`) lists the answers of an order by the label of their field, read
  from `answers` of `GET /client/orders/:id` (generated type; an order read without them shows an empty list), keeps the line breaks
  of a multi-line value and gives label and value their own text direction (`components/merchant/order-answers.tsx`). The order form
  of a merchant rank and the shop checkout draw every field the API sends: the API leaves the main-input field of an IMEI service out,
  so there is no second IMEI box and `visibleFields` filters nothing. A refused balance payment of a merchant rank points to the
  service page (no other payment method is offered).
- **Release order:** the backend of decision 065 first; `lib/api/schema.gen.ts` is regenerated from it and the `api-types` check passes
  once that backend is on `main`.
- **Also in this change (own prices):** an account read that says "not signed in" or "not a merchant rank" (a leftover cookie of an ended
  session) shows the public prices at once and lifts the rule that hides them; decision 003 now says what a merchant sees with
  JavaScript off and that the hero's and a collection's "from" prices are hidden for a merchant rank.
- **Checks (2026-11-24):** typecheck: 0 errors; `npm run lint` clean (ESLint and the English guard); the whole unit suite passes (155 files, 1,590 tests). `gen:api:check` and the browser specs were not run.

## Service cards: design A (2026-11-24, owner's choice)
- The owner picked layout "A" of three card mockups. Both card sizes (`components/store/service-card.tsx`) now share one
  layout: an identity row (picture or logo, the brand over the service type, a quiet quick view eye), a title that keeps room
  for two lines, the facts as pills (delivery, carrier and country on the big card, "In stock"), then under a thin rule the
  price and the order link. No more reserved empty rows: the footer sits at the bottom, so the cards of a row line up.
- `ServiceCardMini` is a size container: below 15rem of content the title and price are smaller and the order link is the
  cart alone; wider, "Order now" shows. Below 9rem (two cards side by side on a phone) the quick view eye is left out.
  The dense card no longer shows the summary (the quick view and the page do).
- `ServiceMark` takes a `caption` (the type's name under the brand); `IconButton` gains the `quiet` variant.
- Not changed: titles that start with a supplier number ("285# …") are data (the listing's public title); cleaning them is
  a separate backend decision.

## API keys made by staff only (2026-11-24, owner's decision; `docs/decisions/005-api-keys-made-by-staff.md`, backend decision 067)
- The API keys page is read only: the keys the team made, with their details, and "Contact us" (a WhatsApp chat with the team
  that names the account, else the support page) for a new key or any change. No create, edit or revoke; no secret dialog; no
  "Made by support" badge. The backend retires the three write routes in the same release (push the backend first: the shop's
  `api-types` check reads the backend's `main`).

## Page kinds after the Shop content trim (2026-11-25, backend decision 068)
- The backend retired landing pages: a content page is a static page or a blog post. Only `lib/api/schema.gen.ts` changes here (the
  `kind` of `GET /store/v1/pages` and of a page is `static` or `blog`, plus `legal`); no page of the shop keyed on a landing kind. The
  shop's search answers as before (the shipped synonyms stay); pins and hidden popular terms are gone on the backend. Push the backend
  first: the `api-types` check reads its `main`.

## Dark theme (2026-11-25, owner's request; `docs/decisions/006-dark-theme.md`)
- The whole site has a dark theme beside the light one. `data-theme` on `<html>` switches every colour and shadow token
  (`app/globals.css`); `THEME_GUARD` (`lib/theme/theme.ts`) sets it before the first paint from the visitor's stored choice
  (`localStorage` `gsm.theme`) or the system, and follows the system while nothing is stored. The switch (`ThemeToggle`) is in the
  shop header, the account rail, both phone drawers, the sign-in pages and the checkout header.
- The old `inverse` colour is two families now: `primary` for solid controls (flips with the theme) and `inverse` for dark panels
  (dark in both). New tokens: `primary*`, `on-primary`, `inverse-edge`, `surface-raised`, `danger-strong`, `plate`, `on-plate`.
  Light looks as before.
- Pictures: the site logo swaps its ink by theme; brand, carrier and payment logos get a white plate in dark; the two light home
  banners draw their art as a negative in dark; the sign-in picture is dimmed.
- Checks: typecheck, lint, the unit tests, `gen:api:check` and a production build; every page family looked at in both themes
  (desktop and phone) on the isolated demo backend. The e2e were not run.

## Service types in the nav (2026-11-25, owner's request)
- The shop's nav has four new links after "All categories": "IMEI services", "Server services", "File services" and "Remote services".
  Each opens the catalog with that one type chosen (`/en/services?type=imei` ...), so the list, the ticked filter and its chip show
  every service of the type. The phone menu has the same four links with the type icons.
- One current link: the type links and "All services" share the catalog's path, so `NavLink` can read one query parameter
  (`param` / `exceptParam`, `components/layout/active-path.ts`): a type link is current for exactly its own type, "All services" for
  the catalog without a type or with several, never both. The pill slides on a change of the query too.
- Between `lg` and `xl` the row is tight: the links read "IMEI", "Server", "File", "Remote" there (the word "services" stays in the
  accessible name); from `xl` they read in full. Measured: the row fits from 1024 px up.
- Checks: typecheck, lint, the unit tests, `gen:api:check`, a production build, and a look in the browser (the row at seven widths,
  the current link after each click, the phone menu). The e2e were not run (`e2e/home-sections.spec.ts` lists the new names).

## Order forms draw only the custom fields (2026-11-26, owner's decision; `docs/decisions/007-fields-only-order-forms.md`, backend decision 070)

The checkout's built-in IMEI box and the merchant form's One IMEI / Several IMEIs switch, IMEI box and bulk list are removed: both forms draw the
service's own fields in the service's order, then nothing else but the quantity (and the file of a File service). On an IMEI service the field the API
flags `isMainInput` holds the IMEI (numeric box, the 15-digit and check-digit checks, sent as digits under `inputs[key]`); an IMEI service without
one shows "can't be ordered" with a support link and cannot be submitted. An error the server reports on a path with no drawn box becomes the form's
message (`lib/checkout/field-errors.ts`, `mapOrderFieldErrors`). Bulk ordering left the shop. Built by a Sonnet implementer, reviewed by an Opus
reviewer (one fix round), final review by the lead. Checks: gen:api against the backend, typecheck, lint, the touched unit tests (73 pass); e2e specs
updated, not run. Needs the backend's decision 070 first. Merged and pushed on the owner's word.

## IMEI is a field type (2026-11-26, owner's decision; `docs/decisions/008-imei-is-a-field-type.md`, backend decision 073)

The forms no longer treat an IMEI service specially: every field is drawn and checked by its own type and Required tick (the owner's report: a main
input set to select or textarea was still drawn as the IMEI box). A field of the new type `imei` is a one-line numeric box with the 15-digit and
check-digit checks, sent as digits; the "can't be ordered" notice of decision 007 is gone (a service is ordered with the fields it has). Built by a
Sonnet implementer, reviewed by an Opus reviewer (ok). Checks: gen:api against the backend, typecheck, lint, the touched unit tests (268 pass); e2e
specs updated, not run. Needs the backend's decision 073 first. Merged, not pushed (waiting for the owner's word).

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
- Retail rank (demo seed): `daniel.whitmore@mail.example` / `demo-password` (4 orders) — see handoff §9.2 for more (`ACCOUNTS.retail`
  in `e2e/helpers.ts`).
- Merchant rank: `ops@zainmobilehub.example` (active, vip rank) with password `Storefront-Test-4821` (set through forgot → Mailpit →
  reset on 2026-11-09; `ACCOUNTS.merchant`). Since decision 002 no account waits for approval, so the old pending merchant is gone.
- A test that changes data makes its own account: `freshAccount(page, { rank: "merchant" })` (staff create it, the invitation sets the
  password) or `signUpByLink(page)` (a retail account by the email link).

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

## Ten more field types; Cancel and Verify in the orders list (2026-11-27, owner's notes; `docs/decisions/009-ten-more-field-types.md`, `010-order-actions-in-the-list-and-their-reasons.md`, backend decisions 075 and 076)

Merged and pushed on the owner's order of 2026-11-27. **009:** both order forms (the retail checkout and the merchant order form) draw and check
`imei_bulk`, `imeisv`, `serial`, `iccid`, `eid`, `meid`, `ecid`, `mac_address`, `mi_lock_code` and `box_sn` with the server's rules and sentences
(one table, `lib/checkout/field-types.ts`, drawn by `components/forms/typed-field.tsx`); `imei_bulk` is a text area with a live count, one order
at one price. **010:** the merchant's orders list has an Actions column (Cancel, Verify); the order page says until when a button is there
(`cancelUntil`: website orders of a service with cancel on wait 2 minutes before they are sent; `verifyUntil`) and why it is missing
(`cancelBlocked`, `verifyBlocked`); an open order's page refreshes itself every 30 seconds and once when the cancel window ends. The four keys
are read as optional. `lib/api/schema.gen.ts` was regenerated against the backend's main. Built by two Sonnet implementers; the field types were
reviewed by an Opus reviewer with the backend; final review by the lead. **Checks:** `gen:api:check`, typecheck, lint, the whole Vitest suite
(1,863 tests). No e2e run. **Release order:** console, backend, shop.

## Sign-up with the full details (2026-11-28, owner's request; `docs/decisions/011-sign-up-with-details.md`, backend decision 079)

Merged and pushed on the owner's order. The owner's ruling: sign-up asks for email, password, first name, last name, country and phone, all
required. The sign-up page is one form (`components/auth/sign-up-form.tsx`, `POST /store/v1/auth/sign-up`); the mailed link opened in the
browser that filled the form creates the account with everything set; opened anywhere else (a phone's mail app) the confirm page shows "Finish
creating your account" with the details to check and a password box (`finish-account-form.tsx`, `POST /store/v1/auth/sign-up/finish`). An
emailed sign-in link no longer creates an account: the sign-in pages and the checkout's signed-out card point to sign-up. Become a merchant
collects the same details without a password and writes them into the WhatsApp message. Every form that holds a password or personal data is
`method="post"` and stays disabled until the script has loaded (`lib/use-mounted.ts`), so a value never reaches the URL. The country menus are
the shop's tax-rate countries, else the full list. `lib/api/schema.gen.ts` regenerated (109 operations). Built by a Sonnet implementer, reviewed
twice by an Opus reviewer with the backend, final review by the lead. **Checks:** `gen:api:check`, typecheck, lint, the whole Vitest suite
(1,994 tests). The e2e specs (`e2e/helpers.ts` `signUpByLink`, `auth.spec.ts`, `account.spec.ts`, `harness.spec.ts`) were rewritten for the
new flow and NOT run. **Release:** together with the backend (the deployer was held until both had passed their checks).

## Sign-in panel in the header; country and phone fields with search and flags (2026-11-28, owner's request)

**Sign-in panel.** The shop header's "Sign in" button opens a panel under it (`components/auth/sign-in-popover.tsx`, a native popover
placed by `components/ui/use-anchored-popover.ts`) with the email and password form, "Email me a sign-in link" and "Create an account"
(the sign-up page). It draws the same steps as the sign-in page: `sign-in-flow.tsx` now has `SignInSteps` (the typed steps, no address
read) and `SignInFlow` (the page: the steps plus the mailed link's landing and `?next=`). A finished sign-in closes the panel and
refreshes the route, so the visitor stays on the page. The steps and Turnstile load on the first opening. On phones the header keeps its
icon link to the sign-in page (a full page suits a small screen and its keyboard better than a panel), and so does the checkout header.

**Country and phone fields.** The owner pointed at the shadcn country dropdown and phone input (`uixmat/shadcn-country-dropdown`). They
were rebuilt on the site's own primitives instead of installed: that component needs cmdk, Radix, country-data-list, libphonenumber-js and
react-circle-flags (which loads every flag from another site), and its styles are shadcn's, not this site's tokens. Same experience, no new
dependency: `CountrySelect` (a button with the flag and the name, a panel with a search box and the list) and `PhoneInput` (the flag of the
number's country follows what is typed; its list writes a calling code, search by name or by code), both on `CountryList`. Flags are the
MIT "circle-flags" files in `public/images/flags` (docs/LOGOS.md); calling codes are a copy of libphonenumber's data
(`lib/phone/dial-data.ts`). Used by sign-up, "finish your account", the merchant application (the country now comes before the phone and
writes its calling code into an empty phone box), both profile forms and the checkout's country. The phone's value is still the string as
typed and the server still judges it; a box that holds only a calling code counts as empty.

**Checks:** typecheck, lint, the whole Vitest suite (2,052 tests), a production build, and in a real browser against the isolated API:
`e2e/sign-in-panel.spec.ts` (new, 6/6), the sign-up, become-a-merchant, sign-in page, profile, checkout-opening and quantity specs on
desktop and the sign-up ones on mobile. The demo database of the isolated API was behind the backend (`e2e/global-setup.ts` stops on its
first step), so the suite was run with `E2E_SKIP_SETUP=1`; the tests that failed did so on data the setup would have made (the merchant
demo password, offered currencies, a stocked service), not on this change. Two expectations of `customer-profile.spec.ts` that assumed a
new account has no country were corrected (staff now give one).
