# GSM storefront: implementation plan for the backend handoff of 2026-11-11/12

> **Superseded in part, 2026-11-16 (owner's request):** the merchant application is no longer a form. `/[lang]/merchant/register`
> sends the visitor to the team's WhatsApp number and staff create the account (see `PROGRESS.md`, "Merchant application on
> WhatsApp"). Everything below about `merchant-register-form.tsx`, Turnstile on merchant register, the sign-up language
> marker (`lib/merchant/signup-locale.ts`, D4) and the e2e check "after `/ar/merchant/register` … `locale: \"ar\"`" is history:
> do not rebuild it.

> **Superseded in part, 2026-11-16 (owner's decision, backend decision 039, feature 30): English is the only language of the
> system.** Everything below about Arabic, `/ar`, two languages, `defineMessages({ en, ar })`, the language switcher, the saved
> language, `hreflang`, right-to-left layout, the "Arabic page" acceptance lines and the `locale` parameters is history: do not
> rebuild it. The cleanup wave (S6 to S9) also removed `getLocale()`, `getMessages()`, `localePath(locale, …)` (now `sitePath(path)`)
> and the `next/root-params` read, and renamed the folder `app/[lang]` to `app/en`: a file path below that names `app/[lang]`
> means `app/en` today. Every old `/ar/…` address answers a permanent redirect to `/en/…`. What stays is Arabic text that people or
> suppliers type (group C: `dir="auto"`, `<bdi>`, Arabic-digit parsing). The rules now are in `CLAUDE.md` ("Language") and the
> status in `PROGRESS.md` ("English only").

> **Owner decisions (2026-11-13), applied on top of this plan:** commit once per finished and verified wave (after a baseline commit of the earlier uncommitted work), local only, never pushed; every feature is tested against the isolated demo backend `http://localhost:3100` only (nothing is submitted through `:3000`/`:5175`, which sends real email). At most 4 agents at once; Fable 5.2 was called once, for this plan, and is not called again.

Master plan for `/home/saifi/gsm-project/storefront` (Next.js 16.4 App Router). It was written once, from the two handoff files, the regenerated API contract, the backend contracts and the working tree as it stood on 2026-11-13. Nothing was run while writing it: every "verify" below is a step for an agent or the lead.

Sources, cited by section number:
- **BH** = `/home/saifi/gsm-project/STOREFRONT-BACKEND-HANDOFF.md`
- **SH** = `/home/saifi/gsm-project/STOREFRONT-HANDOFF.md`
- **Contract** = `/home/saifi/gsm-project/storefront/lib/api/schema.gen.ts` (106 operations)
- **Next docs** = `/home/saifi/gsm-project/storefront/node_modules/next/dist/docs/`

## 0. Rules for running this plan

1. **Features and waves.** There are 16 features in 4 waves (W0 to W3), at most 4 agents at once. Each feature gets at most 3 agent calls: implement (Sonnet), review (Opus), fix (Sonnet). The lead's wave check is the second review round.
2. **File ownership.** A feature may create or edit only the files in its "Files" list. Inside a wave the lists are disjoint. A file may change owner between waves.
3. **Spec fallout.** If a change breaks an assertion in an e2e spec the feature does not own, the agent does not edit that spec. It lists the fallout in its hand-off note (spec file, test title, new expected text) and the lead applies it during the wave check.
4. **Unplanned strings.** A feature that needs a string in a message file it does not own puts it in its own file `/home/saifi/gsm-project/storefront/lib/i18n/messages/<feature-area>.ts` and reports it. The lead folds it in later.
5. **New pages** declare their props by hand, for example `{ params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }`, not `PageProps<"/new/route">`. The route types come from `next typegen`, which agents do not run.
6. **Agents never** touch git, spawn agents, run `next build`, `next start` or Playwright, add a dependency, edit `backend/` or `frontend-admin/`, or call anything through `:5175` or `:3000` (that API sends real email). Implementers run `npx vitest run <files>`, `npx tsc --noEmit` (fixing only their own files), `npx eslint <their files>`, `curl` against `http://localhost:3100` and the Mailpit API `http://localhost:8025/api/v1/…`. Reviewers may also run their feature's spec against the lead's build: `E2E_RUN=$(date +%s) E2E_BASE_URL=http://localhost:5176 npx playwright test e2e/<spec> --project=desktop`.
7. **CLAUDE.md rules apply to every feature:**
   - Server Components by default.
   - Personal data only through `lib/api/session.ts` or `lib/api/server.ts`, inside `<Suspense>`, never in `'use cache'`.
   - Mutations through the browser `api` client, then `router.refresh()`. No Server Actions.
   - Money as 4-decimal strings with `formatMoney`, `sumMoney`, `compareMoney`.
   - `defineMessages` with `en` and `ar` (Modern Standard Arabic).
   - Logical CSS only; lucide icons; no SVG artwork.
   - Real labels, `aria-describedby`, focus to the first error, `aria-live`, 44 px targets.
   - Turnstile reset after every submit.
8. **Hand-off note** (the last message of every implementer and fixer, at most 200 words): files changed; contract checks run (curl and status); tests added and their result; spec fallout; unplanned strings; open risks.

## 1. Context and goals

The backend merged features 20 to 26. The site must now use them: the store catalog (categories, availability, pictures, server filters and sorts), the customer wallet, the notification center and unsubscribe page, the merchant account changes, the one-form sign-in with Turnstile on merchant auth, `Idempotency-Key` on merchant orders, customer profile editing, service quantities, and a production image.

The working tree holds uncommitted, working code (home redesign, shared service list, quick view, logos). It is the baseline; every feature builds on it. `npx tsc --noEmit` has exactly one error today (`/home/saifi/gsm-project/storefront/lib/catalog-facets.test.ts:18`).

Goals:
1. Every item of BH §12 and every acceptance list (BH §2.8, §3.8, §4.4, §5.5, §6.3, §7.3, §14.11) is implemented, with unit tests and e2e specs, in English and Arabic.
2. No endpoint is invented. Every route below exists in the Contract. Admin routes appear only in test setup and come from the backend contracts.
3. The site ships as a Docker image that fits `backend/deploy/compose.prod.yaml` (service `site`, port 3000).
4. What the backend lacks is reported in §8, not worked around.

## 2. Inventory

State: **done** = implemented, **partial**, **missing**. Evidence paths are in the working tree.

### 2.1 BH §12 checklist, with §13 and §14

| # | Item | State | Evidence | Feature |
|---|---|---|---|---|
| A1 | `gen:api` after the merges; isolated backend restarted and migrated | done (lead) | `/home/saifi/gsm-project/storefront/lib/api/schema.gen.ts` (106 ops); fixture error at `/home/saifi/gsm-project/storefront/lib/catalog-facets.test.ts:18` | F00 fixes the fixture |
| A2 | "In stock only" filter | missing | `/home/saifi/gsm-project/storefront/components/store/service-list.tsx:7` ("Availability needs the backend") | F12 |
| A3 | "In stock" mark | missing | `/home/saifi/gsm-project/storefront/components/store/service-card.tsx` (no availability) | F13 |
| A4 | Server-side type, category and price filters | missing | in-memory list at `/home/saifi/gsm-project/storefront/lib/catalog.ts:85-108`; the reader knows only brand, network, country, featured at `/home/saifi/gsm-project/storefront/lib/api/public.ts:36-75` | F00, F12 |
| A5 | Categories menu and counts | missing | the sidebar "Categories" are the four service types (`/home/saifi/gsm-project/storefront/components/store/service-list.tsx:105`); no menu in `/home/saifi/gsm-project/storefront/components/layout/store-header.tsx` | F12 (sidebar), F31 (menu) |
| A6 | Best sellers and new arrivals | missing | sorts are `featured` and `title` only (`/home/saifi/gsm-project/storefront/components/store/list-toolbar.tsx:87-90`); home "More services" sorts by title (`/home/saifi/gsm-project/storefront/app/[lang]/(store)/page.tsx:222-241`) | F12 (sorts), F31 (home) |
| A7 | Delivery in the page's language | partial | the service page shows `etaText` (`/home/saifi/gsm-project/storefront/app/[lang]/(store)/services/[slug]/page.tsx:83`); cards print the English `deliveryTime` (`/home/saifi/gsm-project/storefront/components/store/service-card.tsx:88-91`); `deliveryMinutes` is unused | F01, F13 |
| A8 | Pictures through `next/image` | missing | no `imageUrl` in `/home/saifi/gsm-project/storefront/components/store/service-art.tsx`; no `images` in `/home/saifi/gsm-project/storefront/next.config.ts` | F00, F13 |
| A9 | Language switch with `alternates` | missing | id match through the whole catalog at `/home/saifi/gsm-project/storefront/components/store/resolve-service.ts:28` | F13, F22 |
| A10 | Sitemap from `/store/v1/pages` | missing | `/home/saifi/gsm-project/storefront/app/sitemap.ts:2` | F32 |
| A11 | Help vote | missing | `/home/saifi/gsm-project/storefront/app/[lang]/(store)/help/[slug]/page.tsx` | F32 |
| A12 | Production `Dockerfile` | missing | no `Dockerfile` in the storefront folder | F02 |
| A13 | Server calls forward cookies and `X-Forwarded-For` | done | `/home/saifi/gsm-project/storefront/lib/api/server.ts:22-26` | F02 documents |
| A14 | No site pages under `/client/*` or `/store/v1/*` | done | rewrites at `/home/saifi/gsm-project/storefront/next.config.ts:33-41`; matcher at `/home/saifi/gsm-project/storefront/proxy.ts:66`; `app/` holds only `[lang]` | F02 adds a guard test |
| A15 | Customer Wallet page | missing | `/home/saifi/gsm-project/storefront/app/[lang]/account/layout.tsx:3` ("No wallet") | F21 |
| A16 | Add Funds (manual first) | missing | no customer top-up page | F33 |
| A17 | Header balance | partial | merchant only (`/home/saifi/gsm-project/storefront/components/layout/account-area.tsx:68-84`) | F21 |
| A18 | Pay from balance in the checkout | missing | only `/pay` at `/home/saifi/gsm-project/storefront/components/checkout/session-view.tsx:180-223` | F30 |
| A19 | New error texts | missing | no `WALLET_*` in `/home/saifi/gsm-project/storefront/lib/i18n/messages/errors.ts` | F00 |
| A20 | Merchant `next: 'password'` step | missing | any `next` other than `totp` counts as done (`/home/saifi/gsm-project/storefront/components/auth/sign-in-flow.tsx:232-235`) | F10 |
| A21 | Verification resend button | missing | "contact support" text at `/home/saifi/gsm-project/storefront/lib/i18n/messages/merchant-settings.ts:64-66` | F22 |
| A22 | `locale`, address and tax id in the profile | missing | four fields only (`/home/saifi/gsm-project/storefront/components/merchant-settings/profile-form.tsx:18`) | F22 |
| A23 | "Made by support" keys | missing | `createdByStaff` is unused in `/home/saifi/gsm-project/storefront/components/merchant-settings/api-keys-manager.tsx` | F22 |
| A24 | Bell and notifications page, both areas | missing | no such files | F11 |
| A25 | Unsubscribe page | missing | no `app/[lang]/(store)/unsubscribe`; the mail link 404s | F11 |
| A26 | Announcements in the merchant preferences | partial | the row shows with the API label only (`/home/saifi/gsm-project/storefront/components/merchant-settings/notifications-form.tsx:30-37,173`); the unlink handler flips every Telegram switch off (`:124-126`) | F22 |
| A27 | One `Idempotency-Key` per merchant order submission | missing | `/home/saifi/gsm-project/storefront/components/merchant/order-form.tsx:8-9,239` | F23 |
| A28 | Customer edits name, phone, country | missing | `/home/saifi/gsm-project/storefront/app/[lang]/account/settings/page.tsx:3` | F23 |
| A29 | JOD with two display decimals | done | every store amount passes `decimals` from `/config` (`/home/saifi/gsm-project/storefront/lib/currency.ts`, `/home/saifi/gsm-project/storefront/components/store/service-card.tsx:129-134`) | F13 (regression e2e), F20 (one `?? 2` fallback) |
| A30 | One sign-in form on `POST /client/auth/sign-in` with Turnstile | missing | Customer or Merchant switch at `/home/saifi/gsm-project/storefront/components/auth/sign-in-flow.tsx:92-103` | F00, F10 |
| A31 | Magic-link option always visible | partial | customer tab only (`sign-in-flow.tsx:165-168`) | F10 |
| A32 | `X-Turnstile-Token` on merchant register, forgot, login | missing | `/home/saifi/gsm-project/storefront/components/auth/merchant-register-form.tsx:76`, `/home/saifi/gsm-project/storefront/components/auth/forgot-password-form.tsx:63` | F10 |
| A33 | Translate `WALLET_FROZEN`, `WALLET_DISABLED`, `FORBIDDEN`; the two special 401s are not sign-outs | missing | `/home/saifi/gsm-project/storefront/lib/i18n/messages/errors.ts:15` (generic `FORBIDDEN` only) | F00, F10, F30 |
| A34 | Quantity control tested with a real range and real packs | partial | control at `/home/saifi/gsm-project/storefront/components/checkout/checkout-form.tsx:631-661`; e2e sends quantity 1 only (`/home/saifi/gsm-project/storefront/e2e/checkout.spec.ts:71`) | F03, F20 |
| A35 | "per unit" and "From" on the service page and quick view | missing | rule text only at `/home/saifi/gsm-project/storefront/components/store/service-parts.tsx:45-50` | F13 |
| A36 | `invalid_quantity` text built from `options` or `min`/`max` | missing | always "between {min} and {max}" (`/home/saifi/gsm-project/storefront/lib/i18n/messages/checkout.ts:79`); generic text at `/home/saifi/gsm-project/storefront/lib/i18n/messages/errors.ts:92` | F01, F20, F23 |
| A37 | One control per mode; the rule is read again after a server `invalid_quantity` | partial | a single pack is a one-choice select; the re-fetch sets the price only (`checkout-form.tsx:113-135`) | F20 |
| A38 | Session totals under a subtotal label | missing | label "Price" at `/home/saifi/gsm-project/storefront/components/checkout/session-view.tsx:363` | F20 |
| A39 | `on_request` shows its delivery line; `in_stock` shows "In stock"; never "Pre-order" or "Out of stock" | missing | no availability anywhere in the UI | F13 |
| A40 | Neutral pending text on tracking | missing | "It will be processed shortly" at `/home/saifi/gsm-project/storefront/lib/i18n/messages/store.ts:320` | F01 (text), F32 |
| A41 | Keep the quantity when a checkout restarts | missing | `/home/saifi/gsm-project/storefront/app/[lang]/(checkout)/checkout/resume/page.tsx:99-103`, `/home/saifi/gsm-project/storefront/app/[lang]/(checkout)/checkout/[token]/page.tsx:79` | F20 |
| A42 | e2e for a range, packs and an exact N | missing | no such services in the demo data | F03 (fixtures), F20 |
| A43 | Codes of a stocked order on tracking, one per line, copyable | partial | one `<pre>` and one Copy button (`/home/saifi/gsm-project/storefront/app/[lang]/(store)/track/[token]/page.tsx:128-134`) | F32 |

### 2.2 Acceptance lists

| Source | Acceptance point | State | Feature |
|---|---|---|---|
| BH §2.8 | Availability filter and mark, no stock number | missing | F12, F13 |
| BH §2.8 | Menu and sidebar show `serviceCount`; a category link filters by `categoryId` | missing | F12, F31 |
| BH §2.8 | Best sellers = `_sort=popular&_order=desc`; new arrivals = `_sort=listedAt&_order=desc` | missing | F00, F12, F31 |
| BH §2.8 | Delivery = `etaText`, else `deliveryMinutes` in the page's language | partial | F01, F13 |
| BH §2.8 | `imageUrl` through `next/image`, the type picture when `null` | missing | F00, F13 |
| BH §2.8 | The language switch on a service page uses `alternates` | missing | F13, F22 |
| BH §3.8 | `enabled: false`: no Add Funds, no balance payment, a non-zero balance still shown | missing | F21, F30, F33 |
| BH §3.8 | Manual top-up: form, receipt, `in_review`, credited | missing | F33 |
| BH §3.8 | One-click balance payment lands on the order; a double click pays once; a guest checkout never offers it | missing | F30 |
| BH §3.8 | Every new error code translated; a 401 on balance payment asks to sign in | missing | F00, F30 |
| BH §4.4 | Bell count ("99+" at 100), updated after reading | missing | F11 |
| BH §4.4 | Text rendered safely, locale-prefixed link | missing | F11 |
| BH §4.4 | Read-all keeps newer items unread | missing | F11 |
| BH §4.4 | Unsubscribe page shows both outcomes | missing | F11 |
| BH §4.4 | Preferences form shows Announcements | partial | F22 |
| BH §5.5 | Temporary password: new password, 2FA when on, portal | missing | F10 |
| BH §5.5 | "Resend verification email" with its 409 and 429 | missing | F22 |
| BH §5.5 | Language change saves `locale`; address and tax id editable | missing | F22 |
| BH §5.5 | Staff-made keys show "made by support" | missing | F22 |
| BH §6.3 | One form opens the right area by `kind`; the two CSRF tokens stay apart | missing | F00, F10 |
| BH §6.3 | Wrong email and wrong password look the same; 429 shows the wait; Turnstile resets | partial (one 401 text exists) | F10 |
| BH §6.3 | Magic link always visible for customers | partial | F10 |
| BH §6.3 | Merchant register, forgot (and login) send `X-Turnstile-Token` | missing | F10, F03 (helper) |
| BH §7.3 | One key per submission; a double click creates one order | missing | F00, F23 |
| BH §7.3 | Customer settings edit name, phone, country; show 422s; refresh the currency | missing | F23 |
| BH §14.11 | Range = bounded number box; packs = packs only; one per order and exact N = no control | partial | F20 |
| BH §14.11 | Pack or range text in both languages, from the client check and the server | missing | F01, F20 |
| BH §14.11 | "per unit" and "From"; "Estimated" before the session; subtotal label on review | partial ("Estimated total" exists) | F13, F20 |
| BH §14.11 | No "Pre-order" or "Out of stock"; no count of codes; pending text promises no time | missing | F13, F01 |
| BH §14.11 | Codes on tracking, one per line, copyable | partial | F32 |
| BH §14.11 | e2e covers a range, packs and an exact N | missing | F20 |

### 2.3 Open items of the old handoff (SH)

| Source | Item | State | Feature or decision |
|---|---|---|---|
| SH §11.4 | Smart sign-in | missing | F10 |
| SH §11.4 | Customer wallet | missing | F21, F30, F33 |
| SH §11.4 | Working payment gateways | blocked | owner decision (§8) |
| SH §11.4 | Notification feed, store categories, availability | missing | F11, F12, F13, F31 |
| SH §11.4 | Cart, favourites, social sign-in, PayPal, Vodafone Cash, ticket lists and attachments, profile photo, email change | no API | not planned (§8) |
| SH §11.4 | `notFound()` inside streamed pages answers 200 with `noindex` | open | not planned: the status is sent before the streamed part runs; `noindex` stays (§8) |
| SH §11.4 | Site images are placeholders; `logo-mark.png` is missing | owner | owner adds the files |
| SH §11.6 | Production setup | missing | F02 |
| SH §6.4 | Model, network and MEP options cannot be ordered | no API | unchanged (§8) |
| SH §6.4 | No email carries the tracking link | done on the site | the return page saves it (`/home/saifi/gsm-project/storefront/components/checkout/return-poller.tsx`); backend gap in §8 |
| SH §8.3 trap 7 | Double merchant orders | missing | F23 |
| SH §8.3 trap 10 | Email links to pages that do not exist: `/unsubscribe?token=`, `/account/wallet?topUp=<id>` | missing | F11, F21 and F33. `/merchant` and `/merchant/settings/notifications` exist |
| SH §8.3 trap 13 | Maintenance also blocks the balance payment | missing | F30 |
| SH §8.3 trap 16 | Slugs differ per language | partial (id match) | F13 |
| SH §8.3 trap 18 | `403 ACCOUNT_SUSPENDED` on balance payment is not a sign-out | missing | F30 |
| SH §8.3 traps 19, 20 | Per-unit prices; no pre-order, stock count or sold-out label | missing | F13, F20 |
| PROGRESS | `e2e/merchant.spec.ts` "custom field … instant order" fails: service 15 has no codes left | failing | F03 (global setup refills the stock) |
| CLAUDE.md | Says Turnstile is "for the 6 store routes" | stale | the lead updates it in the final pass |

## 3. Architecture decisions

**D1. Smart sign-in replaces the switch.** The sign-in page has one email and password form on `POST /client/auth/sign-in` with Turnstile. The answer's `kind` picks the area.
- `next` steps:

  | `kind` | `next` | Step |
  |---|---|---|
  | merchant | `password` | `POST /client/auth/password/change { password }` → `{ next: 'totp' or 'done' }` |
  | merchant | `totp` | `POST /client/auth/2fa { code }` |
  | customer | `password` | `POST /store/v1/me/password { currentPassword, newPassword }` (the step that exists) |
  | either | `done` | go to the target |
- The magic-link button is always visible.
- A 401 is "wrong email or password": never a sign-out, never a hint that the email exists.
- The forgot-password page keeps a Customer or Merchant choice, because the backend has two forgot routes and no smart one (§8).

**D2. The CSRF token of the smart sign-in belongs to the surface `kind` names.** `lib/api/browser.ts` stores the `X-CSRF-Token` answer header by request path, so the `/client/auth/sign-in` answer of a customer would be stored as the merchant token. F00 adds `api.signIn()`, which skips the automatic store and saves the token under `client` or `store` by `kind`. Code that asks "is a merchant signed in?" through `csrfToken('client')` then stays correct.

**D3. Where sign-in lands.** `targetAfterSignIn(kind, next, locale)`:
- a `next` under `/<lang>/merchant` is honoured only for a merchant;
- a `next` under `/<lang>/account` only for a customer;
- any other safe same-site path for both;
- otherwise the kind's home.

This stops a loop when a customer signs in on a link that came from the portal.

**D4. Merchant language.**
- A language switch by a signed-in merchant sends `PATCH /client/profile { locale }`, as it already does for customers.
- After an Arabic sign-up the register form leaves a marker `{ locale, at }` in `localStorage` (no email in it). The first merchant sign-in in that browser that reaches `done` reads `GET /client/auth/me`. If the account was created at or after the marker (10 minutes of slack) and its `locale` differs, it sends `PATCH /client/profile { locale }`. The marker is then removed.
- Signing in on the other language's page never changes a saved language.

**D5. `mustChangePassword` on a full session.** The merchant layout renders a client gate. It replaces the route with `/<lang>/merchant/settings/security#password` unless the merchant is already there, and shows a warning. The form there is the existing `POST /client/security/password`.

**D6. One wallet component set for both account types.** `WalletBalanceCards` and `StatementTable` in `components/wallet/` take the shared field names (`balance`, `reserved`, `creditLimit`, `available`). The merchant wallet page is refactored onto them. For a customer the reserved and credit cards are hidden. The top-up forms stay separate, because the routes differ (`/client/invoices` against `/store/v1/me/wallet/top-ups`).

**D7. When the customer wallet is visible.** `show = enabled || balance != 0`. With `enabled: false`: no Add Funds and no balance payment; a non-zero balance and the statement still show. With `enabled: false` and a zero balance: no nav item and no header pill. Wallet reads use `apiSessionGet` (`cache: 'no-store'`, after `connection()`), inside `<Suspense>`.

**D8. Top-ups.**
- Manual: form → `201` → detail page with `instructions` (plain text) → upload to `POST /store/v1/files` → `POST …/receipt` → `in_review`.
- Automatic: the browser goes to `paymentUrl` and returns to `/account/wallet?topUp=<id>`. A client poller reads `GET …/top-ups/:id` every 5 s (15 s once `in_review`), stops after 2 minutes or on a final state, honours `Retry-After`, then calls `router.refresh()`.
- Every wallet POST carries an `Idempotency-Key` from the shared helper (D13).

**D9. Balance payment in the checkout.**
- The checkout is already opened with the session: the browser client sends the store CSRF token when one exists.
- The review page reads the wallet on the server only when `session.balancePayable` is true and a customer is signed in.
- "Store balance" is a payment choice beside the gateways.
- `POST …/balance-payment` is sent with no body and no `Content-Type`, with its own key. The balance key is never the key a `/pay` call used.
- `201` goes straight to `/<lang>/track/<order.trackingToken>`.
- 401 asks to sign in; 403 `FORBIDDEN` offers a new checkout while signed in. Neither signs out.

**D10. Notification bell.**
- It is a link (not a dropdown) in `WorkspaceShell.headerSlot` of both layouts.
- The server passes the first count (no flash).
- A client store polls `…/unread-count` at most once a minute and only while `document.visibilityState === 'visible'`. It refreshes after a read action and stops on 401 or 403.
- "99+" at 100.

**D11. Notification items.**
- `title` and `body` are React text nodes, with `whitespace-pre-line` for line breaks. Never `dangerouslySetInnerHTML`.
- Each item sets `lang` and `dir` from `item.locale`.
- `notificationHref(link, locale, area)` accepts only a root-relative path: one leading `/`, no `//`, no backslash, no control character, no scheme, at most 200 characters. In the merchant area the path must be `/merchant` or start with `/merchant/`.
- The result is `localePath(locale, link)`; a path that already starts with `/en` or `/ar` is used as is. Anything else renders without a link.
- The list always sends `locale=<page lang>`.

**D12. Catalog: what moves to the server and what stays on the site.**

| Piece | Source |
|---|---|
| Rows and total | `GET /store/v1/services` with `type`, `categoryId`, `brand`, `network`, `country`, `availability`, `minPrice`, `maxPrice`, `q`, `_sort`, `_order`, paging |
| Category names and counts | `GET /store/v1/categories` (`serviceCount`, not narrowed by the other filters) |
| Option counts for type, brand, carrier, country; the "In stock only" count; the price slider span | worked out in memory over the cached catalog (`allListedServices`, at most 1000 cards), with the same rules. Cards now carry `category` and `availability` |

- The in-memory in-stock count equals the `x-total-count` read of BH §14.5 and costs no request.
- URL parameter for a category: `category=<slug>`. The id is the number before the first `-`.
- Sorts: `featured` (default), `popular` desc, `newest` (`listedAt` desc), `price_asc`, `price_desc`, `title`.

**D13. One idempotency helper.** `createIdempotencyKeys()` gives the same key for the same request signature (the JSON of the body) and a new key when the signature changes. It is reset after a success. Users: merchant orders, wallet top-ups, receipt, cancel, balance payment, `/pay`.

**D14. Cache life for availability.** The `catalog` profile becomes `{ stale: 60, revalidate: 30, expire: 300 }`.
- Worst case for a page nobody opened: 5 minutes instead of an hour.
- `expire: 300` is not under 5 minutes, so catalog reads stay in the static shell (Next docs `01-app/03-api-reference/04-functions/cacheLife.md`, "Prerendering behavior").
- Personal data never uses `cacheLife` (Next docs `01-app/01-getting-started/08-caching.md`).

**D15. Pictures.**
- `images.localPatterns` gets `/images/**` and `/store/v1/media/**`, both with `search: ''`. Once `localPatterns` is set every other local path is refused, so `/images/**` must be listed or every existing site image breaks (Next docs `01-app/03-api-reference/02-components/image.md`, "localPatterns").
- Service pictures use `next/image` with `fill` and `sizes`.
- The optimizer fetches a local path through the server's own router, so through the `/store/v1/*` rewrite. F13 checks this on the lead's build. If `/_next/image?url=%2Fstore%2Fv1%2Fmedia%2F…` does not answer an image, F13 sets `unoptimized` on service pictures (one constant) and reports it.

**D16. Language switch.** A service page declares `hreflang` alternates from `service.alternates`. A slug of the other language redirects through `alternates` (no id match). The switcher prefers the page's `<link rel="alternate" hreflang>` target when it is a same-origin path. Checkout restart and resume keep `slugForService`, because a session has only the service id.

**D17. Quantity.**
- One pure module `lib/quantity.ts` decides the mode: packs when `options` has two or more entries; "exact N" when `min === max` or there is one pack; "single" when that N is 1; else a range.
- The checkout drawer shows a number box (range), radio buttons (packs) or no control.
- Texts are keyed on `invalid_quantity` and built from the rule.
- The quantity travels as `?quantity=` from the review and resume pages back to `/checkout`, where it is checked against today's rule.
- Estimates before the session say "Estimated". The review page shows the session's own totals.

**D18. No time-based "New" badge.** `Date.now()` during a prerender is an error under Cache Components (Next docs `08-caching.md`, "Random values and timestamps"). "New arrivals" is a section and a sort, not a badge.

**D19. Docker image.**
- `output: 'standalone'` only when `NEXT_OUTPUT=standalone` (the Dockerfile sets it), so the lead's `next build` and `next start -p 5176` are unchanged. `next start` only warns with standalone output, but the warning is avoided (Next docs `01-app/03-api-reference/05-config/01-next-config-js/output.md`).
- The build needs a reachable API: cached public reads run during the prerender, and a failed read fails the build.
- Rewrite destinations are fixed at build time, so a second build variable `GSM_API_REWRITE_ORIGIN` (default: `GSM_API_ORIGIN`) carries the in-network address `http://api:3000`. `GSM_API_ORIGIN` is the API the build can reach.
- At run time compose sets `GSM_API_ORIGIN=http://api:3000` for server reads.
- `NEXT_PUBLIC_*` values are build arguments.
- `.env*` files never enter the image.

**D20. Static params are capped.** The service page prerenders at most 50 slugs per language (featured first); the rest render on demand. A build through the public shop host stays under the 300 requests a minute limit.

**D21. JOD decimals.** No code change beyond one fallback: every store amount already takes `decimals` from `/store/v1/config`. A JOD fixture with `decimals: 2` and an e2e assertion guard it.

**D22. e2e data.** A Playwright global setup makes the isolated demo database hold what the new specs need. It is idempotent and never switches anything off.
- Tests that change accounts use throwaway customers and merchants.
- A staff session is cached in `e2e/.auth/` (git-ignored), because a TOTP code works once.
- Specs that must flip a global setting are "exclusive": they run only with `E2E_EXCLUSIVE=1`, by the lead, alone.

**D23. Turnstile on merchant auth.** The site sends the header on merchant register and forgot password. Merchant sign-in goes through the smart route, which always requires it. The lead tests once with `TURNSTILE_MERCHANT_AUTH=true`, then tells the backend lead to turn the switch on.

**D24. Root parameter and proxy.** The language stays the root parameter read with `next/root-params` (Next docs `01-app/03-api-reference/04-functions/next-root-params.md`). `proxy.ts` is not changed: it already redirects `/unsubscribe?token=…` and `/account/wallet?topUp=…` to a language (Next docs `01-app/01-getting-started/16-proxy.md`).

## 4. Features

Each feature lists what it covers, its files (ownership), the API it uses, the design, strings, tests and risks. Type names are aliases in `lib/api/types.ts` (F00 adds the new ones).

### Wave 0: foundation

#### F00. API layer and configuration

**Covers:** A1, A4 (reader), A8 (config), A19, A30 (client part), D2, D13, D14, D15, D19 (config).

**Files:**
```
/home/saifi/gsm-project/storefront/lib/api/types.ts
/home/saifi/gsm-project/storefront/lib/api/public.ts
/home/saifi/gsm-project/storefront/lib/api/store-query.ts            (new)
/home/saifi/gsm-project/storefront/lib/api/store-query.test.ts       (new)
/home/saifi/gsm-project/storefront/lib/api/browser.ts
/home/saifi/gsm-project/storefront/lib/api/browser.test.ts           (new)
/home/saifi/gsm-project/storefront/lib/api/idempotency.ts            (new)
/home/saifi/gsm-project/storefront/lib/api/idempotency.test.ts       (new)
/home/saifi/gsm-project/storefront/lib/i18n/messages/errors.ts
/home/saifi/gsm-project/storefront/lib/i18n/error-text-core.ts
/home/saifi/gsm-project/storefront/lib/i18n/i18n.test.ts
/home/saifi/gsm-project/storefront/lib/catalog-facets.test.ts        (fixture only)
/home/saifi/gsm-project/storefront/next.config.ts
/home/saifi/gsm-project/storefront/.env.example
```

**Work:**
1. **Aliases** in `types.ts`:
   - catalog: `StoreCategory`, `StorePageListItem`, `ServiceAvailability`, `StoreQuantityRule`;
   - wallet: `CustomerWallet`, `CustomerStatementLine`, `TopUpMethod`, `TopUp`, `TopUpDetail`, `TopUpStatus`, `BalancePaymentResult`, `StoreUploadedFile`;
   - notifications: `NotificationItem`, `NotificationCategory`, `UnreadCount`;
   - auth and profile: `SmartSignInResult`, `MerchantPasswordChangeResult`, `MerchantProfileInput`, `StoreMeInput`.
2. **`store-query.ts`** (pure): `storeServicesQuery(args): QueryInput`.
   - `ServiceListArgs` gains `brand`, `network`, `country` as `string | string[]`, `type?: ServiceType[]`, `categoryId?: number[]`, `availability?`, `minPrice?`, `maxPrice?`, and `sort?: "featured" | "sort" | "title" | "popular" | "listedAt" | "price"`.
   - Default order: `desc` for `featured`, `popular`, `listedAt`; `asc` otherwise.
   - Empty arrays and empty strings are left out. A list route answers 422 to an unknown parameter.
3. **`public.ts`:**
   - `listStoreServices` uses the builder.
   - New `listStoreCategories(locale)`: `'use cache'`, `cacheLife('catalog')`, tag `store-categories`.
   - New `listContentPages({ locale, kind?, start?, end? })`: `cacheLife('content')`, tag `store-pages`, at most 100 a page.
4. **`idempotency.ts`:** `newIdempotencyKey()` moves here (still re-exported from `browser.ts`), plus `createIdempotencyKeys(make?)` with `keyFor(signature)` and `reset()`.
5. **`browser.ts`:**
   - Skip the automatic CSRF store when the path is `/client/auth/sign-in`.
   - Add `api.signIn(body, turnstileToken): Promise<SmartSignInResult>` (D2).
   - Fix the header comment: Turnstile now covers 7 routes plus merchant auth; `Idempotency-Key` covers pay, balance payment, wallet and merchant orders.
6. **`errors.ts`:**
   - Add codes `WALLET_FROZEN`, `WALLET_DISABLED`.
   - Reword `IDEMPOTENCY_IN_PROGRESS` ("Your request is still being processed. Wait a moment.") and `IDEMPOTENCY_KEY_REUSED` ("This request changed while it was being sent. Try again."): they no longer speak only of payments.
   - Add field codes `fee`, `daily_count`, `daily_amount`, `max_balance`, `type`.
   - Add `retryInMinutes: "Try again in about {minutes} min."`; `error-text-core.ts` uses it when `retryAfter >= 120`.
7. **`next.config.ts`:**
   - `images.localPatterns` (D15).
   - `cacheLife.catalog` (D14).
   - `output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined`.
   - `outputFileTracingRoot: path.join(__dirname)`.
   - `rewriteOrigin = GSM_API_REWRITE_ORIGIN ?? apiOrigin`, used by both rewrites.
8. **Fixture:** the `card()` helper of `catalog-facets.test.ts` gains `category`, `availability`, `deliveryMinutes`, `etaText`, `listedAt`, `imageUrl`.

**Unit tests:** query builder (arrays repeat the key, default orders, nothing empty is sent); key store (same signature gives the same key, a new signature a new key, reset); `api.signIn` with a mocked `fetch` (the token lands under `store` for `kind: 'customer'`, under `client` for a merchant, never both); minute wording at 900 s.

**Acceptance:** `npx tsc --noEmit` is clean. Existing call sites of `listStoreServices` compile unchanged.

**Risks:** the optimizer through the rewrite (D15, checked in F13); `expire: 300` at the prerender threshold (the lead confirms `/[lang]` and `/[lang]/services` are still partial prerenders in the build output).

#### F01. Shared helpers, shared strings, small primitives

**Covers:** A7 and A36 (helpers), A40 (text), strings later waves need without owning the file.

**Files:**
```
/home/saifi/gsm-project/storefront/lib/quantity.ts                   (new)
/home/saifi/gsm-project/storefront/lib/quantity.test.ts              (new)
/home/saifi/gsm-project/storefront/lib/store/delivery.ts             (new)
/home/saifi/gsm-project/storefront/lib/store/delivery.test.ts        (new)
/home/saifi/gsm-project/storefront/lib/i18n/messages/common.ts
/home/saifi/gsm-project/storefront/lib/i18n/messages/portal.ts
/home/saifi/gsm-project/storefront/lib/i18n/messages/store.ts
/home/saifi/gsm-project/storefront/components/ui/status-badge.tsx
/home/saifi/gsm-project/storefront/components/forms/file-upload.tsx
```

**`lib/quantity.ts`** (pure; rule = `{ min, max, options }`):
- `quantityMode(rule)` → `{ kind: "single" }`, `{ kind: "exact", value }`, `{ kind: "range", min, max }` or `{ kind: "packs", options }` (D17)
- `defaultQuantity(rule)`
- `isAllowedQuantity(rule, n)`
- `parseQuantityInput(text)`: whole number 1 to 100000; Arabic-Indic digits accepted
- `coerceQuantity(rule, wanted)` → `{ quantity, changed }`
- `fromMerchantRule({ minQty, maxQty, qtyOptions })`
- `quantityRuleText(rule, t, locale)` and `invalidQuantityText(rule, t, locale)`, where `t` is `common.quantity`
- `fromPrice(unitGross, rule)`: 4-decimal string through `mulMoney`

**`lib/store/delivery.ts`:**
- `deliveryTime({ etaText, deliveryMinutes }, locale)` → `{ text, isNote }`: the trimmed `etaText` when not empty, else `formatMinutes` from `lib/merchant/format.ts`
- `deliveryLine(service, locale, t)`: the note as written, else "Delivered within {time}"
- `stockHint(service, locale, t)`

**Strings.** English is given; Arabic is written for all, with the handoff's own wording where BH §14 gives it.
- `common.nav`: `allCategories: "All categories"`, `categories: "Categories"`.
- `common.header`: `notifications: "Notifications"`, `storeBalance: "Store balance"`, `myWallet: "Wallet"`.
- `common.availability`: `inStock: "In stock"` (ar "متوفر"), `onRequest: "On request"` (ar "عند الطلب"), `instant: "Instant delivery"` (ar "تسليم فوري").
- `common.delivery`: `label: "Delivery"`, `within: "Delivered within {time}"` (ar "يُسلَّم خلال {time}"), `whileStock: "Instant delivery while stock lasts, otherwise within {time}"`, `whileStockNote: "Instant delivery while stock lasts. Otherwise: {note}"`.
- `common.quantity`:
  - `one: "1 per order"`, `exact: "{count} per order"`, `range: "{min} to {max} per order"`, `packs: "Packs of {options}"`
  - `invalidRange: "Enter a quantity from {min} to {max}."` (ar "أدخل كمية من {min} إلى {max}.")
  - `invalidPacks: "Choose one of these quantities: {options}."` (ar "اختر إحدى هذه الكميات: {options}.")
  - `perUnit: "per unit"`, `from: "From {price}"`, `exactFor: "{count} for {price}"`, `packFor: "{count} for about {price}"`
  - `subtotal` (plural forms; `other: "Subtotal ({count} units)"`, `one: "Subtotal (1 unit)"`), `estimated: "Estimated"`
- `common.status.topUp`: `awaiting_payment: "Awaiting payment"`, `in_review: "In review"`, `credited: "Credited"`, `rejected: "Rejected"`, `cancelled: "Cancelled"`.
- `portal`: `merchantNav.notifications`, `customerNav.wallet`, `customerNav.notifications`, `storeBalance`.
- `store.catalog`: `type: "Service type"`, `availability: "Availability"`, `inStockOnly: "In stock only"`, `sortPopular: "Best sellers"`, `sortNewest: "New arrivals"`, `sortPriceAsc: "Price: low to high"`, `sortPriceDesc: "Price: high to low"`.
- `store.track`:
  - `pendingText: "We received your order. This page shows the result as soon as it is ready."`
  - `timeline`: `accepted: "Your order is being worked on"`, `rejected: "We could not complete this order"`, `refund: "Refunded"`, `reopened: "Being checked again"`. `created`, `paid`, `completed` keep their text in both languages (an existing test reads "Order received" and "استلمنا الطلب").
  - `codesTitle: "Your codes"`, `copyAll: "Copy all"`, `copyCode: "Copy code {n}"`.
- `store.help`: `voteQuestion: "Was this article helpful?"`, `voteYes: "Yes"`, `voteNo: "No"`, `voteThanks: "Thank you for your feedback."`, `voteError: "We could not record your answer. Try again later."`.

**Primitives:**
- `status-badge.tsx` gains the kind `topUp` (awaiting and in review = warning, credited = success, rejected = danger, cancelled = neutral).
- `file-upload.tsx` gains `endpoint?: "/client/files" | "/store/v1/files"` (default client) and `maxBytes?: number` (default 25 MiB).

**Unit tests:**
- Every mode, with the BH §14.2 table as cases.
- A single pack is "exact".
- `coerceQuantity` with a quantity that is no longer allowed.
- Both invalid texts in both languages.
- `fromPrice("1.2500", packs 5/10/25)` = `"6.2500"`.
- Delivery: a note wins; 90 minutes in English and Arabic.

**Acceptance:** nothing visible changes except the tracking texts. The i18n parity check (`defineMessages`) compiles.

#### F02. Production image

**Covers:** A12, A13, A14, SH §11.6, D19.

**Files:**
```
/home/saifi/gsm-project/storefront/Dockerfile                        (new)
/home/saifi/gsm-project/storefront/.dockerignore                     (new)
/home/saifi/gsm-project/storefront/docs/DEPLOY.md                    (new)
/home/saifi/gsm-project/storefront/lib/app-routes.test.ts            (new)
```

**Dockerfile** (exact text; three stages, no new dependency):
```dockerfile
# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:26-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM ${NODE_IMAGE} AS build
WORKDIR /app
ARG GSM_API_ORIGIN
ARG GSM_API_REWRITE_ORIGIN=http://api:3000
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_TIME_ZONE=UTC
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone \
    GSM_API_ORIGIN=${GSM_API_ORIGIN} GSM_API_REWRITE_ORIGIN=${GSM_API_REWRITE_ORIGIN} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=${NEXT_PUBLIC_TURNSTILE_SITE_KEY} \
    NEXT_PUBLIC_TIME_ZONE=${NEXT_PUBLIC_TIME_ZONE}
RUN test -n "$GSM_API_ORIGIN" && test -n "$NEXT_PUBLIC_SITE_URL" && test -n "$NEXT_PUBLIC_TURNSTILE_SITE_KEY"
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 GSM_API_ORIGIN=http://api:3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/robots.txt').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server.js"]
```

**`.dockerignore`:** `node_modules`, `.next`, `.git`, `.env*` (but not `.env.example`), `e2e`, `test-results`, `playwright-report`, `screenshots`, `.serena`, `*.tsbuildinfo`, `docs`, `*.md`.

**`docs/DEPLOY.md`:**
- the variables and when each is read:

  | Variable | Read |
  |---|---|
  | `GSM_API_ORIGIN` | at build (the API the build reaches) and at run time (server reads) |
  | `GSM_API_REWRITE_ORIGIN` | at build |
  | `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_TIME_ZONE` | at build |
  | `PORT`, `HOSTNAME` | at run time |
- the production build command, with `--build-arg GSM_API_ORIGIN=https://<SHOP_HOST>` (public GET routes through Caddy) and `--build-arg GSM_API_REWRITE_ORIGIN=http://api:3000`;
- deploy the API before building the site;
- the build needs internet for the two Google fonts;
- `SITE_IMAGE` in `backend/deploy/.env` and `--profile site`;
- Caddy sends `/client/*` and `/store/v1/*` to the API, so the site serves no page there;
- the site forwards `Cookie` and `X-Forwarded-For`; the API trusts the compose subnet;
- backend values the site depends on: `STORE_BASE_URL`, `PORTAL_BASE_URL=https://<SHOP_HOST>/merchant`, `CORS_ORIGINS` with the shop origin, `TURNSTILE_HOSTNAMES`;
- how to check the rewrite destination after a build: `grep -o '"destination":"[^"]*"' .next/routes-manifest.json`.

**Unit test** `lib/app-routes.test.ts`: walks `app/` and fails when a first-level segment is `client` or `store`, or when a folder under `app/[lang]` (route groups looked through) is named `client` or `store`.

**Acceptance (lead):** the image builds against the isolated API, starts, `/robots.txt` and `/en` answer 200, and the health check turns healthy (commands in §7).

**Risks:** the `node:26-slim` tag (override with `NODE_IMAGE`); sharp is traced into the standalone output for the build platform, which is why build and runtime share one base image.

#### F03. e2e harness and demo fixtures

**Covers:** A42 (fixtures), D22, the failing `merchant.spec.ts` stock test, the helpers every later spec needs.

**Files:**
```
/home/saifi/gsm-project/storefront/e2e/helpers.ts
/home/saifi/gsm-project/storefront/e2e/admin.ts                      (new)
/home/saifi/gsm-project/storefront/e2e/global-setup.ts               (new)
/home/saifi/gsm-project/storefront/e2e/harness.spec.ts               (new)
/home/saifi/gsm-project/storefront/playwright.config.ts
```

**`helpers.ts` additions** (moved from the specs that copy them today; the old specs keep their private copies until their owner feature touches them):
- `stubTurnstile(page)`, `go(page, url)`, `uniqueEmail(prefix)`, `waitForLink(page, address, pattern, skip?)`
- `freshCustomer(page, withPassword?)`
- `freshMerchant(page, { verify? })`: `POST /client/auth/register` with `Origin` and the dev Turnstile token; returns `{ email, password }`
- `signInMerchant` and `signInCustomer` now also send `X-Turnstile-Token` (so they pass with `TURNSTILE_MERCHANT_AUTH=true`)
- `fixtures()` reads `e2e/.auth/fixtures.json`

**`admin.ts`** (admin API of `E2E_API_ORIGIN ?? http://localhost:3100`; headers `Origin: http://localhost:5175`, `X-Forwarded-For: 127.0.0.1`, cookie, `X-CSRF-Token`):

| Helper | Admin routes |
|---|---|
| `staff(request)` | `POST /admin/auth/login`, `POST /admin/auth/2fa`. The session is cached in `e2e/.auth/staff.json` (written with a rename) and checked with `GET /admin/auth/me`. On a used TOTP code it tries the next and the previous 30-second step before waiting |
| `ensureCustomerWallet()` | `PATCH /admin/settings {"wallet.customer.enabled": true}`; `GET` then `POST /admin/payment-gateways` for the gateway below |
| `customerIdByEmail(email)` | `GET /admin/customers?q=` |
| `creditCustomer(id, amount)` | `POST /admin/customers/:id/wallet/adjust` with `Idempotency-Key`, `{ amount, direction: "credit", reason }` (at most $500 a call) |
| `freezeCustomerWallet(id)`, `unfreezeCustomerWallet(id)` | `POST /admin/customers/:id/wallet/freeze`, `…/unfreeze` with `Idempotency-Key`, `{ reason }` |
| `approveTopUp(customerId)`, `rejectTopUp(customerId, reason)` | `GET /admin/payments?customerId=&status=pending`, then `POST /admin/payments/:id/approve` or `…/reject { reason }` |
| `setQuantityRule(serviceId, rule)` | `PATCH /admin/services/:id { minQty, maxQty, qtyOptions }` |
| `availableCodes(serviceId)`, `importCodes(serviceId, n)` | `GET /admin/inventory-codes?serviceId=&status=available&_start=0&_end=1` (`x-total-count`); `POST /admin/services/:id/inventory/import { codes }` (unique codes, 6 to 128 characters, no spaces) |
| `sendCampaign({ to, title, body, ar?, link?, purpose?, channels? })` | `POST /admin/notification-campaigns` with `audience: { include: [{ type, id }] }`, then `POST /admin/notification-campaigns/:id/send { confirmRecipients }` |
| `merchantIdByEmail(email)`, `approveMerchant(id)` | `GET /admin/clients?q=`, `PATCH /admin/clients/:id { status: "active" }` |
| `temporaryMerchantPassword(id)`, `temporaryCustomerPassword(id)` | `POST /admin/clients/:id/password { mode: "temporary_password" }`, `POST /admin/customers/:id/password { mode: "temporary_password" }` |
| `staffApiKeyFor(merchantId, name)` | `POST /admin/clients/:id/api-keys { name, scopes: ["orders:read"] }` |
| `completeOrder(orderId, code)` | `POST /admin/orders/:id/reply { code }` |

Gateway body for `ensureCustomerWallet()`:
```json
{ "code": "cliq-e2e", "driver": "manual", "name": "CliQ transfer (e2e)", "audience": "b2c",
  "feePercent": "0", "feeFixed": "0", "minAmount": "5", "maxAmount": "500", "allowedGroupIds": [],
  "supportsRefunds": false, "supports3ds": false, "isManual": true,
  "instructions": "Send the amount by CliQ to the alias GSMSHOP and write the top-up number in the note.",
  "holdHours": 0, "isActive": true }
```

**`global-setup.ts`** (registered in `playwright.config.ts`; skipped with `E2E_SKIP_SETUP=1`; idempotent; it never switches anything off). Service ids come from `GET /store/v1/services/<slug>?locale=en`.
1. Staff session.
2. `ensureCustomerWallet()`.
3. Quantity rules. No existing spec uses these three services:

   | Slug | Rule |
   |---|---|
   | `vodafone-uk-iphone-unlock` | range 2 to 50 |
   | `ee-uk-unlock` | packs `[5, 10, 25]` |
   | `orange-france-unlock` | exact 5 (`minQty = maxQty = 5`, no packs) |
4. Stock: `blacklist-status-gsma` holds at least 20 available codes (the "In stock" fixture); the service with code `SRV-Z3X-10` at least 30 (repairs the failing `merchant.spec.ts` test).
5. Currency `JOD`: `POST /admin/currencies { code: "JOD", name: "Jordanian dinar", rateToBase: "0.70900000", isStorefront: true, decimals: 2 }` when missing; `PATCH` when `decimals` is not 2.
6. Picture: when the listing `samsung-kg-lock-fix` has no `imageUrl`, upload `/home/saifi/gsm-project/storefront/public/images/service-imei.jpg` with `POST /admin/service-listings/:id/image` (multipart part `file`).
7. Write `e2e/.auth/fixtures.json`: `{ gatewayId, range, packs, exact, stocked, pictured }`, each with `{ id, slug }`.

**`harness.spec.ts`** (API only): the fixtures file exists; the three rules read back from `GET /store/v1/services/:slug`; the stocked service reads `availability: "in_stock"`; `/store/v1/config` lists JOD with `decimals: 2`; `freshCustomer` and `freshMerchant` work; `sendCampaign` to a fresh customer raises `GET /store/v1/me/notifications/unread-count` to 1 within 20 s.

**Rules for every later spec:**
- Import `test` and `expect` from `./fixtures`.
- Use throwaway accounts for anything that changes data.
- Never switch a global setting off outside an exclusive spec.
- A test that depends on a freshly changed catalog value wraps its first assertion in `expect(async () => { await page.reload(); … }).toPass({ timeout: 90_000, intervals: [5_000] })`, because the site caches catalog reads for about 30 s.

**Risks:** implementers do not run Playwright, so the F03 implementer proves each admin call with curl (Appendix A). The reviewer runs `harness.spec.ts`. The lead may let the implementer run this one API-only spec against the running `:5176`.

### Wave 1

#### F10. Smart sign-in, password step for both kinds, Turnstile on merchant auth

**Covers:** A20, A30 to A33 (sign-in part), BH §5.1, §6, §5.3 (sign-up language), D1, D3, D4.

**Files:**
```
/home/saifi/gsm-project/storefront/components/auth/sign-in-flow.tsx
/home/saifi/gsm-project/storefront/components/auth/sign-in-skeleton.tsx
/home/saifi/gsm-project/storefront/components/auth/forgot-password-form.tsx
/home/saifi/gsm-project/storefront/components/auth/merchant-register-form.tsx
/home/saifi/gsm-project/storefront/components/auth/sign-up-chooser.tsx
/home/saifi/gsm-project/storefront/components/auth/safe-next.ts
/home/saifi/gsm-project/storefront/components/auth/safe-next.test.ts          (new)
/home/saifi/gsm-project/storefront/lib/merchant/signup-locale.ts              (new)
/home/saifi/gsm-project/storefront/lib/merchant/signup-locale.test.ts         (new)
/home/saifi/gsm-project/storefront/lib/i18n/messages/auth.ts
/home/saifi/gsm-project/storefront/app/[lang]/(auth)/sign-in/page.tsx
/home/saifi/gsm-project/storefront/e2e/auth.spec.ts
/home/saifi/gsm-project/storefront/e2e/smart-sign-in.spec.ts                  (new)
```

**API:**
- `POST /client/auth/sign-in { email, password }` + `X-Turnstile-Token` → `200 { kind, next }`
- `POST /client/auth/password/change { password }` → `200 { next: "totp" | "done" }`
- `POST /client/auth/2fa { code }` → 204
- `POST /store/v1/me/password { currentPassword, newPassword }` → 204
- `POST /store/v1/auth/magic-link`
- `POST /client/auth/register` and `POST /client/auth/password/forgot`, now with `X-Turnstile-Token`
- `GET /client/auth/me`, `PATCH /client/profile { locale }`

**Design:**
- **One form:** email, password, Turnstile, "Sign in". Under it, always: "Email me a sign-in link (customers)", "Forgot password?", "Create account", "Apply as a merchant". The Customer or Merchant control is removed. `?as=` stays readable only to pick the default tab of the forgot page and to keep old links valid.
- **Submit:** `ts.ensureToken()` → `api.signIn()` → `ts.reset()` in `finally`.
- **Steps:** `password` (the form), `magic`, `totp`, `customer-new-password` (existing step), `merchant-new-password` (new), `link` (`?token=`).
- **Merchant new password:** new password and confirmation → `password/change`. `totp` goes to the code step; `done` finishes.
- **Finish:** for a merchant, apply the sign-up language marker (D4); errors are ignored. Then `router.replace(targetAfterSignIn(kind, next, locale))` and `router.refresh()`.
- **Register form:** Turnstile widget, token on the request, reset after every submit. On success, when the page language is not `en`, write the marker.
- **Forgot form:** Turnstile for both choices.

**Errors:**

| Where | Answer | Shown |
|---|---|---|
| sign-in | 401 | one sentence, "The email or password is incorrect.", for every cause |
| sign-in | `403 ACCOUNT_SUSPENDED`, `403 IP_NOT_ALLOWED`, `403 CSRF_FAILED` | by code |
| sign-in | `403 TURNSTILE_FAILED` | text and widget reset |
| sign-in | `429` | text with the wait (minutes from F00) |
| sign-in | `422` | on the fields |
| `password/change` | `422 WEAK_PASSWORD` on `password` (also when it equals the temporary one) | field text |
| `password/change` | 401 | back to the form with "Your sign-in expired. Start again." |
| `password/change` | 403 or 429 | by code |

**Strings (`auth.ts`):**
- `signIn.magicLinkCustomers: "Email me a sign-in link (customers)"`
- `signIn.expired`
- `signIn.merchantNewPassword { title, text, submit }`
- `signIn.oneFormHint: "One form for customers and merchants."`
- `forgot.chooseHint`
- Remove the `surfaces` use on sign-in; the keys stay for the forgot page.

**Unit tests:**
- `targetAfterSignIn`:
  - customer with a merchant `next` → `/en/account`;
  - merchant with `/en/merchant/orders` → kept;
  - `/en/checkout?service=x` kept for both;
  - an external URL → the home.
- Marker: applied only when the account is not older than the marker minus 10 minutes and the language differs; removed after one use; a malformed value is ignored.

**e2e:**
- `auth.spec.ts`: update the tests that read the radios "Customer" and "Merchant".
- `smart-sign-in.spec.ts`:
  1. One form, no account-type radios; the magic-link button is visible.
  2. The request goes to `/client/auth/sign-in` with `x-turnstile-token`.
  3. The demo customer lands on `/en/account`; the demo merchant on `/en/merchant`; the pending merchant on the portal.
  4. A wrong password and an unknown email show the same sentence.
  5. A second submit sends a fresh token (the stub is asked twice).
  6. A 429 mocked with `Retry-After: 900` shows "about 15 min".
  7. Merchant temporary password (`freshMerchant` + `temporaryMerchantPassword`) → new password step → portal; a weak password is refused on the field.
  8. The same with 2FA on (enabled through the API as `auth.spec.ts` does today): password step, then code step.
  9. Customer temporary password still works through the one form.
  10. A customer signing in on `?next=/en/merchant/orders` lands on `/en/account`.
  11. Register and forgot (merchant) requests carry `x-turnstile-token`.
  12. After `/ar/merchant/register` and a first sign-in, `GET /client/auth/me` reads `locale: "ar"`.

**Backend checks:**
- `curl -i -X POST http://localhost:3100/client/auth/sign-in -H 'Origin: http://localhost:5175' -H 'Content-Type: application/json' -H 'X-Turnstile-Token: XXXX.DUMMY.TOKEN.XXXX' -d '{"email":"daniel.whitmore@mail.example","password":"demo-password"}'` → `200 {"kind":"customer","next":"done"}`, a store session cookie and `X-CSRF-Token`.
- Without the Turnstile header → `403 TURNSTILE_FAILED`.

**Risks:** five tries per email and address in 15 minutes: specs use throwaway emails for failures; the smart route charges both counters.

#### F11. Notification center and unsubscribe page

**Covers:** A24, A25, BH §4.1, §4.2, §4.4, D10, D11.

**Files:**
```
/home/saifi/gsm-project/storefront/components/notifications/bell.tsx                   (new, client)
/home/saifi/gsm-project/storefront/components/notifications/bell-slot.tsx              (new, server)
/home/saifi/gsm-project/storefront/components/notifications/notification-list.tsx      (new, server)
/home/saifi/gsm-project/storefront/components/notifications/notification-actions.tsx   (new, client)
/home/saifi/gsm-project/storefront/components/notifications/category-icon.tsx          (new)
/home/saifi/gsm-project/storefront/lib/notifications/link.ts                           (new)
/home/saifi/gsm-project/storefront/lib/notifications/link.test.ts                      (new)
/home/saifi/gsm-project/storefront/lib/notifications/unread-store.ts                   (new)
/home/saifi/gsm-project/storefront/lib/notifications/unread-store.test.ts              (new)
/home/saifi/gsm-project/storefront/lib/i18n/messages/notifications.ts                  (new)
/home/saifi/gsm-project/storefront/app/[lang]/account/notifications/page.tsx           (new)
/home/saifi/gsm-project/storefront/app/[lang]/(portal)/merchant/notifications/page.tsx (new)
/home/saifi/gsm-project/storefront/app/[lang]/(store)/unsubscribe/page.tsx             (new)
/home/saifi/gsm-project/storefront/components/store/unsubscribe-form.tsx               (new, client)
/home/saifi/gsm-project/storefront/app/[lang]/account/layout.tsx
/home/saifi/gsm-project/storefront/app/[lang]/(portal)/merchant/layout.tsx
/home/saifi/gsm-project/storefront/e2e/notifications.spec.ts                           (new)
/home/saifi/gsm-project/storefront/e2e/unsubscribe.spec.ts                             (new)
```

**API** (the surface prefix is `/client/notifications` or `/store/v1/me/notifications`):
- `GET …?_start&_end&unread=true&locale=<lang>` → `NotificationItem[]` + `x-total-count`
- `GET …/unread-count` → `{ unread }`
- `POST …/:id/read` → 204
- `POST …/read-all { upToId }` → `{ updated }`
- `POST /store/v1/marketing/unsubscribe/:token` (no body) → 204 or `410 TOKEN_INVALID`

**Design:**
- **Bell:** `bell-slot.tsx` reads the first count on the server (`apiSessionGet`, errors become 0) inside `<Suspense>` with a 44 px skeleton. `bell.tsx` is a link to the notifications page; accessible name "Notifications, {count} unread"; badge "99+" at 100.
- **Unread store:** `subscribe`, `getSnapshot`, `refresh(surface)`, a visibility listener, a 60 s floor between polls, back-off on 429 from `Retry-After`. It stops for good on 401, `ACCOUNT_SUSPENDED` or `IP_NOT_ALLOWED`. It never signs out by itself.
- **Layouts:**
  - the customer layout gets a "Notifications" nav item and the bell in `headerSlot`;
  - the merchant layout gets the bell before the wallet pill, also for pending merchants, and a nav item (kept in the short pending nav);
  - on screens under `sm` the wallet pill hides when the header would overflow (check at 360 px).
- **Page:** 20 a page; tabs All and Unread (`?unread=1`); each item shows a category icon (unknown category → the bell icon), title, body, time, an unread mark with visible text, "Mark as read", and its link when `notificationHref` accepts it.
- **Mark all:** "Mark all as read" appears only on page 1 and sends `upToId` = the newest id on screen. After any action: `router.refresh()` and `refresh(surface)`.
- **Item link:** following an item's link also marks it read (not awaited).
- **Empty states** for both tabs.
- **Unsubscribe:** static page in the store group, `noindex`. The form reads `?token=`. With no token it shows "This link is not valid". Otherwise a button "Stop marketing emails" posts the token.

  | Answer | Shown |
  |---|---|
  | 204 | "You will get no more marketing emails." |
  | 410, 404 or 422 | "This link is not valid." |
  | 429 | the wait |
  | other | the generic text with the reference |

  It is never auto-submitted (mail scanners open links). The token is not logged and is passed through `encodeURIComponent`.

**Errors:**
- 401 on a list page → the layout already redirects to sign-in.
- `404` on mark-read → refresh the list.
- `403 CSRF_FAILED` → shown; no sign-out.

**Strings (`notifications.ts`):**
- page: `title`, `subtitle`, `tabsLabel`, `tabAll`, `tabUnread`, `emptyTitle`, `emptyText`, `emptyUnreadTitle`
- item: `unread`, `markRead`, `markAllRead`, `markedAll: "{count} marked as read"`, `open: "Open"`
- `bell: "Notifications, {count} unread"`, `bellNone: "Notifications"`
- `categories { announcement, marketing, order, payment, wallet, billing, support, account, alert }`
- `unsubscribe { metaTitle, title, text, submit, doneTitle, doneText, invalidTitle, invalidText, backHome }`

**Unit tests:**
- `notificationHref` refuses `//evil.test`, `https://x`, `/\\evil`, `javascript:…`, a control character, a 201-character path.
- It prefixes `/account/orders` → `/ar/account/orders` and keeps `/en/account`.
- In the merchant area it refuses `/account/orders`.
- Unread store, with fake timers and a fake visibility: no poll while hidden; one poll a minute; refresh after an action; stop after a 401.

**e2e:**
- `notifications.spec.ts`:
  1. Customer: a campaign to a fresh customer with link `/account/orders`, English and Arabic text → the bell shows 1 → the page shows title and body as text. A body with `<b>x</b>` and a line break shows the literal characters and two lines.
  2. The item link is `/en/account/orders`. On `/ar/…` the Arabic text shows with `dir="rtl"`. A campaign with no Arabic text shows English with `lang="en"`.
  3. Mark one read → the bell shows 0 and the unread tab is empty.
  4. Read-all keeps newer: two items; intercept the `read-all` request and assert `upToId` equals the newest id on screen; send a third campaign before clicking → it stays unread after the click.
  5. Merchant: the same with a fresh merchant (pending is allowed) and link `/merchant/settings/notifications`.
  6. 99+: a mocked `unread-count` of 100.
  7. No horizontal overflow of the header at 360 px.
- `unsubscribe.spec.ts`: fresh customer with `marketingOptIn: true` → marketing campaign on the `email` channel → Mailpit link `/unsubscribe?token=` → `/en/unsubscribe?token=…` → button → success text → `GET /store/v1/me` reads `marketingOptIn: false`. A bad token → "This link is not valid". Arabic page is right-to-left.

**Backend checks:** `curl -i -X POST http://localhost:3100/store/v1/marketing/unsubscribe/aaaaaaaaaaaa` → `410 TOKEN_INVALID`; list and count with a customer cookie jar (Appendix A).

**Risks:** the campaign fan-out needs the worker of the isolated backend; specs poll the count for up to 20 s.

#### F12. Catalog list: server filters, categories, availability, sorts

**Covers:** A2, A4, A5 (sidebar), A6 (sorts), BH §2.2, §2.3, D12.

**Files:**
```
/home/saifi/gsm-project/storefront/lib/catalog.ts
/home/saifi/gsm-project/storefront/lib/catalog-facets.ts
/home/saifi/gsm-project/storefront/lib/catalog-facets.test.ts
/home/saifi/gsm-project/storefront/components/store/service-list.tsx
/home/saifi/gsm-project/storefront/components/store/list-filters.tsx
/home/saifi/gsm-project/storefront/components/store/list-toolbar.tsx
/home/saifi/gsm-project/storefront/components/store/active-filters.tsx
/home/saifi/gsm-project/storefront/components/store/search-params.ts
/home/saifi/gsm-project/storefront/components/store/home-products.tsx
/home/saifi/gsm-project/storefront/app/[lang]/(store)/services/page.tsx
/home/saifi/gsm-project/storefront/e2e/store.spec.ts
/home/saifi/gsm-project/storefront/e2e/catalog-filters.spec.ts        (new)
```

**API:** `GET /store/v1/services` with every filter of D12; `GET /store/v1/categories?locale=`.

**Design:**
- **`ListFilter`** gains `category: number[]` and `inStock: boolean`. `ListSort` becomes the six values of D12. `passes()` also checks category and availability, so the in-memory counts follow them.
- **`catalogList()`** reads, in parallel, the cached catalog (counts, price span), the server page (rows, total) and the categories. When the server page is empty and the total is above zero it reads the last page instead. `allListedServices` and `slugForService` stay.
- **Sidebar order:**
  1. Categories (real ones, with `serviceCount`)
  2. Availability (one checkbox "In stock only (N)", parameter `stock=1`)
  3. Price range
  4. Service type (the four types)
  5. Brand, Carrier, Country
- **Chips** for a category (its name), stock and type.
- **Toolbar:** the six sorts.
- **URL state** as today, plus `category`, `stock`, and `sort` in `popular | newest | price_asc | price_desc | title`.
- **Bad input:** an unknown category id is ignored and shown as a removable chip; a reversed price range is turned round before the request (the server answers 422 `invalid` on `maxPrice`).
- The home list (`home-products.tsx`) and `/services` share the component as today.

**Strings:** pre-seeded by F01 (`store.catalog.type`, `availability`, `inStockOnly`, `sortPopular`, `sortNewest`, `sortPriceAsc`, `sortPriceDesc`). This feature does not edit `store.ts`.

**Unit tests:** category and stock in `passes`; counts with a category selected; the in-stock count; the sort-to-query mapping; the page clamp.

**e2e:**
- `store.spec.ts`: the "Categories" group now holds real categories (assert one from `GET /store/v1/categories`, with its count); the types sit under "Service type".
- `catalog-filters.spec.ts`:
  1. `/en/services?category=<slug>` lists exactly `serviceCount` services and shows the chip.
  2. Two categories add up.
  3. `?stock=1` lists at least the stocked fixture, and every listed service reads `in_stock` on `GET /store/v1/services?availability=in_stock`. The "In stock only (N)" number equals the list total.
  4. `?sort=price_asc` and `price_desc` order the card prices.
  5. `?sort=popular` and `?sort=newest` answer a non-empty list, and the request the server makes is accepted (no error state).
  6. `?max=14` still lists 6 services.
  7. Arabic: category names come from the API and the page is right-to-left.
  8. No stock number appears anywhere.

**Backend checks:**
- `curl -s 'http://localhost:3100/store/v1/services?locale=en&categoryId=<id>&_start=0&_end=1' -D -` → `x-total-count` equals the category's `serviceCount`.
- `…&minPrice=20&maxPrice=10` → 422 on `maxPrice`.
- `…&_sort=popular&_order=desc` → 200.

**Risks:** counts are truncated beyond 1000 listed services (§8); the service-card label type is owned by F13 (this feature only passes `serviceCardLabels(t, c)` through).

#### F13. Service card, service page, quick view

**Covers:** A3, A7, A8, A9, A29 (e2e), A35, A39, BH §2.1, §2.4, §14.3 to §14.5, D15, D16, D18, D20.

**Files:**
```
/home/saifi/gsm-project/storefront/components/store/service-card.tsx
/home/saifi/gsm-project/storefront/components/store/service-art.tsx
/home/saifi/gsm-project/storefront/components/store/card-labels.ts
/home/saifi/gsm-project/storefront/components/store/service-parts.tsx
/home/saifi/gsm-project/storefront/components/store/quick-view.tsx
/home/saifi/gsm-project/storefront/components/store/resolve-service.ts
/home/saifi/gsm-project/storefront/app/[lang]/(store)/services/[slug]/page.tsx
/home/saifi/gsm-project/storefront/lib/i18n/messages/store.ts
/home/saifi/gsm-project/storefront/e2e/service-display.spec.ts        (new)
```

**API:** card and detail fields `category`, `availability`, `deliveryMinutes`, `etaText`, `imageUrl`, `quantity`, `alternates`; `GET /store/v1/media/:name` through `next/image`.

**Design:**
- **Cards** (both sizes):
  - Delivery = `deliveryTime(service, locale).text`, with the full sentence for screen readers.
  - A small "In stock" badge for `in_stock`; nothing more for `on_request`.
  - Cards stay without "per unit" (they carry no quantity).
- **Pictures:** `ServiceArt`, `ServiceThumb` and `ServiceMark` take `imageUrl`. It is used only when it starts with `/store/v1/media/`. Order: service picture, then brand logo, then type picture, then icon. `fill`, `sizes` given, `alt=""` (the title beside it names the service).
- **Service page and quick view:**
  - an availability badge;
  - the delivery row (`deliveryLine`);
  - under the price: "per unit" for every mode except single;
  - "From {unit × min}" for packs and a range above 1; "{N} for {unit × N}" for an exact N;
  - packs listed with "about" estimates;
  - for an `in_stock` service with a range or packs, the "while stock lasts" hint;
  - never "Pre-order" or "Out of stock".

  The price block streams in the visitor's currency as today.
- **Alternates:**
  - metadata `languages` come from `service.alternates`;
  - `resolveService` redirects a slug of the other language through `alternates`;
  - a service with no page in this language stays a 404.

  The import of `slugForService` leaves these two files.
- **`generateStaticParams`** is capped at 50 slugs per language.
- **Optimizer check** (D15): after the lead's Wave 0 build is on `:5176`, `curl -sI 'http://localhost:5176/_next/image?url=%2Fstore%2Fv1%2Fmedia%2F<name>&w=96&q=75'` must answer `200` with an image type. If not, set `unoptimized` and report.

**Strings (`store.ts`, owned here):** `card.inStock`, `service.availability`, `service.perUnitNote`, `service.packsTitle`, `quickView.*` additions. The shared ones come from `common` (F01).

**e2e `service-display.spec.ts`:**
1. English cards show a delivery time in English units or the staff note. Arabic cards show Arabic text.
2. The stocked fixture shows "In stock" on its card and page. "Pre-order", "Out of stock" and any "N left" appear nowhere on `/en`, `/en/services` and the three fixture pages.
3. Packs fixture page: "per unit", "From {5 × unit}" (computed in the test from the API price with integer math) and the three packs.
4. Range fixture page: "2 to 50 per order" and "From {2 × unit}".
5. Exact fixture page: "5 per order" and "5 for {5 × unit}".
6. Quick view of the packs fixture shows the same.
7. `/ar/services/icloud-clean-lost-check` redirects to `/ar/services/fahs-icloud`. The `hreflang="ar"` link of the English page points there. An English-only service has no Arabic alternate.
8. The pictured fixture card renders an image whose `naturalWidth` is above 0 and whose `src` names `/store/v1/media/`.
9. With the cookie `gsm_currency=JOD`, the service price shows exactly two decimals.

**Backend checks:** `curl -s 'http://localhost:3100/store/v1/services/icloud-clean-lost-check?locale=en'` shows `alternates: [{ locale: "ar", slug: "fahs-icloud" }]`, `availability`, `deliveryMinutes`.

**Risks:** the largest UI feature; reviewer screenshots at 1440 and 390 px in both languages; card heights are fixed by design, so the badge must not change them (reserve its space).

### Wave 2

#### F20. Checkout quantities

**Covers:** A34, A36 to A38, A41, A42, BH §13, §14.2, §14.3, §14.6, D17.

**Files:**
```
/home/saifi/gsm-project/storefront/components/checkout/checkout-form.tsx
/home/saifi/gsm-project/storefront/components/checkout/quantity-control.tsx   (new)
/home/saifi/gsm-project/storefront/components/checkout/session-view.tsx
/home/saifi/gsm-project/storefront/app/[lang]/(checkout)/checkout/page.tsx
/home/saifi/gsm-project/storefront/app/[lang]/(checkout)/checkout/[token]/page.tsx
/home/saifi/gsm-project/storefront/app/[lang]/(checkout)/checkout/resume/page.tsx
/home/saifi/gsm-project/storefront/lib/i18n/messages/checkout.ts
/home/saifi/gsm-project/storefront/e2e/checkout.spec.ts
/home/saifi/gsm-project/storefront/e2e/quantity.spec.ts                       (new)
```

**API:** `POST /store/v1/checkout-sessions { …, quantity }`; `GET /store/v1/services/:slug` from the browser (no-store); `GET /store/v1/checkout-sessions/:token`.

**Design:**
- **The rule is state,** not a constant. It starts from the server-rendered service and is replaced by every browser re-read (currency, country, region change, and after a server `invalid_quantity`).
- **Control by mode:** none for single and exact (text "1 per order" or "N per order"); a number input with `min`, `max`, `step=1` and the range hint; radio buttons for packs (a select above six packs).
- **Default** = `defaultQuantity`. `?quantity=` is read by `checkout/page.tsx` with `intParam` and passed as `initialQuantity`. `coerceQuantity` falls back to the default and shows a notice when the rule changed.
- **Texts:** `invalidQuantityText` for the client check and for a server `422` on `quantity` with code `invalid_quantity`, `too_small`, `too_big` or `invalid_type`. After the server error the form reads the service again, redraws the control and moves focus to it.
- **Summary:** "Price per unit", "Subtotal (N units)", "Estimated total" above one unit. Delivery line from `deliveryLine`. The in-stock hint beside the control for a range or packs.
- **Review page:** the first row label is the plural "Subtotal (N units)". The totals are the session's own.
- **Restart:** `restartHref` and the resume link carry `&quantity=<session.quantity>`.
- **Fallback:** `decimals ?? 2` where the currency is not found (A29).

**Strings (`checkout.ts`):**
- `start.drawer.quantityHint`
- `start.info.quantityChanged: "The quantities this service sells have changed. We chose an allowed one."`
- `start.summary.subtotal` (uses `common.quantity.subtotal`)
- Remove `errorQuantity`.

**e2e:**
- `checkout.spec.ts`: review label; the resume link now ends with `&quantity=1`.
- `quantity.spec.ts` (IMEI services, so each test also enters the IMEI):
  1. Range: number box with `min=2`, `max=50`; 60 shows "Enter a quantity from 2 to 50."; 3 posts `quantity: 3`; the summary says "Estimated total"; the review page shows "Subtotal (3 units)" and the session totals.
  2. Packs: three radios and no number box; choosing 10 posts `quantity: 10`.
  3. Exact: no control, "5 per order", posts `quantity: 5`.
  4. Server `invalid_quantity` (mocked 422), with the service re-read mocked to a new rule `[20, 40]`: the pack text is shown and the control redraws with the new packs.
  5. Arabic: the pack text in Arabic.
  6. Resume and expired review keep the quantity; a quantity that is no longer allowed falls back with the notice.

**Backend checks:** against a fixture service, `POST /store/v1/checkout-sessions` with `quantity: 7` on the packs service → `422`, `errors[0].code = "invalid_quantity"`; with 10 → `201`, `quantity: 10`.

**Risks:** the review and tracking pages can only show the English `service.deliveryTime` (§8).

#### F21. Customer wallet: page, shared components, header balance

**Covers:** A15, A17, BH §3.1, §3.2, §3.6, D6, D7.

**Files:**
```
/home/saifi/gsm-project/storefront/components/wallet/balance-cards.tsx               (new)
/home/saifi/gsm-project/storefront/components/wallet/statement-table.tsx             (new)
/home/saifi/gsm-project/storefront/components/wallet/statement-range-form.tsx        (new, client)
/home/saifi/gsm-project/storefront/lib/wallet/view.ts                                (new)
/home/saifi/gsm-project/storefront/lib/wallet/view.test.ts                           (new)
/home/saifi/gsm-project/storefront/lib/wallet/convert.ts                             (new)
/home/saifi/gsm-project/storefront/lib/wallet/convert.test.ts                        (new)
/home/saifi/gsm-project/storefront/lib/i18n/messages/wallet.ts                       (new)
/home/saifi/gsm-project/storefront/app/[lang]/account/wallet/page.tsx                (new)
/home/saifi/gsm-project/storefront/app/[lang]/account/layout.tsx
/home/saifi/gsm-project/storefront/components/layout/account-area.tsx
/home/saifi/gsm-project/storefront/app/[lang]/(portal)/merchant/wallet/page.tsx
/home/saifi/gsm-project/storefront/e2e/wallet.spec.ts                                (new)
/home/saifi/gsm-project/storefront/e2e/wallet-disabled.spec.ts                       (new, exclusive)
```

**API:**
- `GET /store/v1/me/wallet` → `CustomerWallet`
- `GET /store/v1/me/wallet/statement?createdAt_gte&createdAt_lte&_start&_end` → `CustomerStatementLine[]` + `x-total-count`
- `GET /store/v1/config` (currencies, for the approximate amount)

**Design:**
- **`walletCapabilities(wallet)`** → `{ show, canAddFunds, canPay, frozen, negative }` (D7).
- **Page:**
  - balance cards (available, balance, pending top-ups when `count > 0`);
  - notices: on hold since `frozen.at` (no reason is ever shown), negative balance, switched off;
  - "Add funds" button only when `canAddFunds` (it links to `/account/wallet/add-funds`, built in F33);
  - the visitor-currency approximation ("about {amount}") through `convertMoney(usd, fxRate)` when the shop currency is not USD.
- **Statement:**
  - a GET form with `from` and `to` dates, sent as `T00:00:00.000Z` and `T23:59:59.999Z`;
  - 25 a page;
  - the kind is translated (`deposit`, `b2c_payment`, `refund`, `adjustment`, `chargeback`; an unknown kind is humanized);
  - `memo` is never shown;
  - a row with `orderId` shows the order label `SF-<id>`.
- **Layout:** nav item "Wallet" and a header pill (available balance) when `show`. The F11 bell stays.
- **Store header (`account-area.tsx`):** the merchant pill as today; else the customer pill when `show`; a "Wallet" menu item for the customer.
- **Merchant wallet page:** same look and texts, now built from `WalletBalanceCards` and `StatementTable` with the merchant strings.
- `?topUp=<id>` is accepted and ignored until F33 adds the poller.

**Strings (`wallet.ts`):**
- page: `title`, `description`, `addFunds`
- cards: `available`, `availableHint`, `balance`, `pending: "{count} top-ups waiting: {amount}"`, `approx: "about {amount}"`
- notices: `frozenTitle`, `frozenText`, `negativeText`, `disabledTitle`, `disabledText`
- statement: `title`, `from`, `to`, `apply`, `clear`, `columns`, `kinds`, `order: "Order {id}"`, `emptyTitle`, `emptyText`

**Unit tests:** capabilities for enabled, disabled with zero, disabled with a balance, frozen, negative; `convertMoney("50.0000", "0.70900000")` = `"35.4500"`, with half-up rounding at the fourth decimal.

**e2e:**
- `wallet.spec.ts`:
  1. Fresh customer with a zero balance, wallet on: nav item, page, "Add funds" button.
  2. After `creditCustomer(id, "20.0000")`: the header pill and the card show $20.00; the statement has one "Adjustment" row and no memo text.
  3. The date range filters: tomorrow's date gives an empty state.
  4. Frozen (`freezeCustomerWallet`): the hold notice, available $0.00, no reason shown.
  5. Arabic page is right-to-left with translated kinds.
  6. The merchant wallet page still shows its four cards and the statement (regression of the refactor).
  7. A response check: `GET /store/v1/me/wallet` carries `Cache-Control: no-store`.
- `wallet-disabled.spec.ts` (only with `E2E_EXCLUSIVE=1`): switch the setting off; a customer with $20 still sees the balance and statement but no "Add funds" and no balance choice in a checkout; a zero-balance customer sees no nav item; switch it back on in `finally`.

**Backend checks:** Appendix A (customer cookie jar; `GET /store/v1/me/wallet`).

**Risks:** one extra personal read per page for signed-in customers (the same cost the merchant pill has today).

#### F22. Merchant account

**Covers:** A9 (switcher), A21, A22, A23, A26, BH §4.3, §5.2 to §5.4, D4 (switch), D5, D16 (switcher).

**Files:**
```
/home/saifi/gsm-project/storefront/components/merchant-settings/profile-form.tsx
/home/saifi/gsm-project/storefront/components/merchant-settings/verify-email-resend.tsx      (new, client)
/home/saifi/gsm-project/storefront/components/merchant-settings/api-keys-manager.tsx
/home/saifi/gsm-project/storefront/components/merchant-settings/notifications-form.tsx
/home/saifi/gsm-project/storefront/components/merchant/must-change-password-gate.tsx         (new, client)
/home/saifi/gsm-project/storefront/app/[lang]/(portal)/merchant/settings/page.tsx
/home/saifi/gsm-project/storefront/app/[lang]/(portal)/merchant/layout.tsx
/home/saifi/gsm-project/storefront/components/layout/language-switcher.tsx
/home/saifi/gsm-project/storefront/lib/i18n/messages/merchant-settings.ts
/home/saifi/gsm-project/storefront/e2e/merchant-settings.spec.ts
/home/saifi/gsm-project/storefront/e2e/merchant-account.spec.ts                              (new)
```

**API:**
- `POST /client/auth/verify-email/resend` (no body) → 204, `409 CONFLICT`, 429
- `PATCH /client/profile { name?, company?, phone?, country?, locale?, address?, taxId? }`
- `GET /client/auth/me` (`locale`, `address`, `taxId`, `mustChangePassword`)
- `GET /client/api-keys` (`createdByStaff`)
- `GET` and `PUT /client/notification-preferences`
- `POST /client/security/password`

**Design:**
- **Profile:** new fields address (textarea, 300), tax id (40), and "Language of our emails" (`locale`). Only changed keys are sent.
- **Resend:** while `emailVerifiedAt` is null the email field shows a button "Resend verification email".

  | Answer | Shown |
  |---|---|
  | 204 | "We sent a new link. Older links no longer work." |
  | 409 | "Your email is already verified." and `router.refresh()` |
  | 429 | the wait |
- **API keys:** a badge "Made by support" when `createdByStaff === true` (the field is optional in the type; treat missing as false).
- **Notifications:**
  - map `broadcast.announcement` to translated copy; an unknown event keeps the API label;
  - while Telegram is not linked the switches stay disabled, and a row is sent back with the Telegram value the GET showed;
  - `onLinkedChange(false)` no longer changes any value.
- **Layout:** `MustChangePasswordGate` (D5). After a successful password change the form calls `router.refresh()`.
- **Language switcher:**
  - when `csrfToken('client')` exists, also send `PATCH /client/profile { locale }`, racing the same 1.2 s wait (both PATCH calls when both are signed in);
  - the target is the page's `link[rel="alternate"][hreflang=<other>]` when it is a same-origin path, else the swapped path.

**Strings (`merchant-settings.ts`):** `profile.address`, `profile.taxId`, `profile.emailLanguage`, `profile.emailLanguageHint`, `profile.resend`, `profile.resendSent`, `profile.alreadyVerified`, `profile.emailHintUnverified` (new text), `apiKeys.madeBySupport`, `notifications.eventList.broadcastAnnouncement { title, text }`, `security.mustChange { title, text }`.

**e2e:**
- `merchant-settings.spec.ts`: the Telegram test title and its expectation (the Announcements Telegram switch is disabled and checked).
- `merchant-account.spec.ts`:
  1. Fresh unverified merchant: resend → success text → a new mail in Mailpit.
  2. After verifying in another tab, resend shows "already verified" and the badge turns to Verified.
  3. A mocked 429 shows the wait.
  4. Address and tax id save and survive a reload; a 301-character address is refused on its field.
  5. Changing the email language sends `{ locale: "ar" }`.
  6. The header switcher on a portal page sends `PATCH /client/profile { locale: "ar" }` before it navigates.
  7. `approveMerchant` + `staffApiKeyFor` → the key row shows "Made by support".
  8. The Announcements row shows its translated title; saving the Email switch alone answers 200 (no "Link Telegram first").
  9. `mustChangePassword` (mocked in the browser on `GET /client/auth/me` is not possible for server reads): covered by a unit-level render test of the gate's decision function, and by the lead's manual check in §7.
  10. On a service page the switcher's link target is the alternate slug.

**Backend checks:** `curl -i -X POST http://localhost:3100/client/auth/verify-email/resend` with a merchant jar → 204 then, once verified, 409.

**Risks:** the resend limiter (5 an hour per merchant): one throwaway merchant per test.

#### F23. Site API gaps: merchant order key, customer profile

**Covers:** A27, A28, A36 (merchant), BH §7, §14.7, SH trap 7.

**Files:**
```
/home/saifi/gsm-project/storefront/components/merchant/order-form.tsx
/home/saifi/gsm-project/storefront/lib/merchant/order-input.ts
/home/saifi/gsm-project/storefront/lib/merchant/order-input.test.ts
/home/saifi/gsm-project/storefront/lib/i18n/messages/merchant.ts
/home/saifi/gsm-project/storefront/app/[lang]/(portal)/merchant/services/[id]/page.tsx
/home/saifi/gsm-project/storefront/components/account/profile-form.tsx               (new, client)
/home/saifi/gsm-project/storefront/app/[lang]/account/settings/page.tsx
/home/saifi/gsm-project/storefront/app/[lang]/account/page.tsx
/home/saifi/gsm-project/storefront/lib/i18n/messages/account.ts
/home/saifi/gsm-project/storefront/e2e/account.spec.ts
/home/saifi/gsm-project/storefront/e2e/merchant.spec.ts
/home/saifi/gsm-project/storefront/e2e/merchant-order-idempotency.spec.ts            (new)
/home/saifi/gsm-project/storefront/e2e/customer-profile.spec.ts                      (new)
```

**API:**
- `POST /client/orders` + `Idempotency-Key` → `201 { orders }`; `409 IDEMPOTENCY_IN_PROGRESS` with `Retry-After`; `409 IDEMPOTENCY_KEY_REUSED`
- `PATCH /store/v1/me { name?, phone?, country? }` → `StoreMe`
- `GET /store/v1/config` (`taxRates` countries)

**Design, merchant order:**
- The key = `keys.keyFor(JSON.stringify(body))`. It is the same while the same submission is retried and new when anything in the body changes. It is reset on success.
- A replay answers 201 with the first body: the form goes to the order page, which reads the current status.
- `IDEMPOTENCY_IN_PROGRESS`: wait `Retry-After` (at most 3 tries) with the same key, with a visible "still processing" state.
- `IDEMPOTENCY_KEY_REUSED`: reset the key and show the generic text.
- The synchronous in-flight guard stays. The header comment is corrected.
- Quantity: `quantityRule` treats a single pack as fixed. The invalid text comes from `invalidQuantityText`, also for a server `invalid_quantity`. The service page shows "Packs of 5, 10, 25".

**Design, customer profile:**
- A "Profile" card in the settings: name (2 to 120), phone (40; empty clears), country (the countries of `taxRates`, plus the saved one).
- Only changed keys are sent.
- `422` on `country` with code `unsupported` → "We do not sell to this country yet."
- After a country change: set or clear the `gsm_currency` cookie from the answer's `currency`, then `router.refresh()`.
- The email is read-only with a note.
- The overview replaces "contact support to change your name…" with a link to the settings. The email note stays.

**Strings:**
- `merchant.ts`: `form.stillProcessing`, `form.problems.option` (rule text).
- `account.ts`: `settings.sections.profile`, `settings.profile { title, description, name, phone, country, countryHint, emailNote, save, saved, countryUnsupported, currencyChanged }`, `overview.profile.edit`; remove `overview.profile.note`.

**Unit tests:** `quantityRule` for one pack; the body signature is stable for equal bodies (key order).

**e2e:**
- `account.spec.ts`: the overview test (remove the "no wallet" assertion and the read-only note; assert the edit link).
- `merchant-order-idempotency.spec.ts`:
  1. The request carries `idempotency-key`.
  2. Lost answer: `page.route` lets the first `POST /client/orders` reach the server with `route.fetch()` and then aborts it. The second click sends the same key, the answer is the same order id, and `GET /client/orders` shows one new order.
  3. Changing the IMEI gives a new key.
  4. A mocked `IDEMPOTENCY_IN_PROGRESS` with `Retry-After: 1` retries and succeeds.
- `customer-profile.spec.ts` (fresh customer):
  1. Save name and phone; reload keeps them.
  2. A one-letter name is refused on the field.
  3. A country change updates the currency select and the cookie from the answer.
  4. A mocked 422 `unsupported` shows the country text.
  5. Clearing the phone sends `""`.
  6. Arabic page.

**Backend checks:** two `POST /client/orders` with one key and one body → the second answers 201 with `idempotency-replayed: true` and the same id; `PATCH /store/v1/me {"country":"ZZ"}` → 422 on `country`.

**Risks:** merchant orders spend the demo merchant's wallet (small amounts, service 1, cancelled when the API allows, as `merchant.spec.ts` does).

### Wave 3

#### F30. Pay a checkout from the store balance

**Covers:** A18, A33 (balance part), BH §3.4, §11, SH traps 13 and 18, D9.

**Files:**
```
/home/saifi/gsm-project/storefront/components/checkout/session-view.tsx
/home/saifi/gsm-project/storefront/components/checkout/balance-option.ts            (new, pure)
/home/saifi/gsm-project/storefront/components/checkout/balance-option.test.ts       (new)
/home/saifi/gsm-project/storefront/app/[lang]/(checkout)/checkout/[token]/page.tsx
/home/saifi/gsm-project/storefront/lib/i18n/messages/checkout.ts
/home/saifi/gsm-project/storefront/e2e/checkout.spec.ts
/home/saifi/gsm-project/storefront/e2e/balance-payment.spec.ts                      (new)
```

**API:**
- `GET /store/v1/checkout-sessions/:token` (`balancePayable`, `amounts.usd.gross`)
- `GET /store/v1/me/wallet`
- `POST /store/v1/checkout-sessions/:token/consents`
- `POST /store/v1/checkout-sessions/:token/balance-payment` (no body; `X-CSRF-Token`, `Idempotency-Key`) → `201 { payment, order: { id, trackingToken }, wallet }`

**Design:**
- **Server:** when `session.balancePayable`, read the customer (`getCustomer`) and the wallet (errors become null). Pass `{ signedIn, wallet: { enabled, available, frozen } | null }`.
- **`balanceOption()`** → one of:

  | State | When | Shown |
  |---|---|---|
  | `hidden` | not payable and no wallet in play | nothing |
  | `sign-in` | payable, but nobody is signed in now | link to sign-in with `next` = this checkout |
  | `reopen` | signed in with the wallet on, but the checkout was opened as a guest | link to a new checkout with the same service and quantity |
  | `frozen` | the wallet is on hold | disabled choice with the reason |
  | `insufficient` | `available < amounts.usd.gross` | balance and total, link to Add funds |
  | `ready` | otherwise | the choice |
- **UI:** "Store balance" is the first payment choice, with "Available: {amount}". When the session currency is not USD: "This order takes {usd gross} from your balance."
- The Pay button is enabled when the balance choice is ready, even if `paymentMethods` is empty.
- **Pay:** consents as today, then the POST with `keys.keyFor("balance")`. A gateway payment keeps its own key per gateway. On 201: `router.replace(/track/<trackingToken>)`; the page stays busy until then.
- **Errors:**

  | Answer | Shown |
  |---|---|
  | 401 | "Sign in to pay from your balance" with the sign-in link; no sign-out |
  | `403 FORBIDDEN` | the reopen text and link |
  | `402 INSUFFICIENT_FUNDS` | balance and total, link to Add funds, the other methods stay usable |
  | `409 WALLET_FROZEN`, `409 WALLET_DISABLED` | by code |
  | `409 INVALID_TRANSITION` | reload the session |
  | `422` on `consent` | consent text |
  | `403 ACCOUNT_SUSPENDED` | shown with the support link; no sign-out |
  | `409 IDEMPOTENCY_KEY_REUSED` | new key and retry once |
  | `409 IDEMPOTENCY_IN_PROGRESS` | wait `Retry-After`, at most 3 tries |
  | `503 MAINTENANCE` | with the expected end |

**Strings (`checkout.ts`):** `session.balance { title, available, takesUsd, signIn, reopen, reopenAction, frozen, insufficient, addFunds, paying }`; `session.errors.forbidden`, `session.errors.insufficient`.

**Unit tests:** every state of `balanceOption`, with money compared as strings.

**e2e:**
- `checkout.spec.ts`: line 85 becomes "no PayPal or Vodafone" plus "no balance choice on a guest checkout".
- `balance-payment.spec.ts`:
  1. Fresh customer with $20, signed in, checkout of the $3.99 service through the UI: the balance choice shows; one click lands on `/en/track/<token>`; the wallet reads $20 minus the USD gross.
  2. A double click sends one key and creates one payment (count the requests and the statement rows).
  3. A guest checkout shows no balance choice.
  4. A checkout opened as a guest and then viewed signed in shows the reopen hint.
  5. Not enough balance: the choice is disabled with the Add funds link.
  6. A mocked 401 shows the sign-in text and the customer stays signed in (`GET /store/v1/me` is 200).
  7. A mocked `403 FORBIDDEN`, `409 WALLET_FROZEN` and `503 MAINTENANCE` show their texts.
  8. Arabic page.

**Backend checks:** the lead's verified flow, repeated with curl: signed-in session with CSRF → `balancePayable: true`; `POST …/balance-payment` with a key and no body and no `Content-Type` → 201. If that answers 400 the client sends `{}` as the body, which the lead verified.

**Risks:** the demo card gateway cannot pay, so the balance is the only complete payment path in the demo.

#### F31. Home sections and the category menu

**Covers:** A5 (menu), A6 (home), BH §2.3, §2.7.

**Files:**
```
/home/saifi/gsm-project/storefront/app/[lang]/(store)/page.tsx
/home/saifi/gsm-project/storefront/components/store/home-parts.tsx
/home/saifi/gsm-project/storefront/components/layout/store-header.tsx
/home/saifi/gsm-project/storefront/components/layout/category-menu.tsx       (new)
/home/saifi/gsm-project/storefront/lib/i18n/messages/store.ts
/home/saifi/gsm-project/storefront/e2e/store.spec.ts
/home/saifi/gsm-project/storefront/e2e/home-sections.spec.ts                 (new)
```

**API:** `GET /store/v1/services?_sort=popular&_order=desc&_end=4`; `…_sort=listedAt&_order=desc&_end=4`; `GET /store/v1/categories`.

**Design:**
- The panel beside "How it works" becomes "Best sellers" (four dense cards, "View all" → `/services?sort=popular`).
- A new section "New arrivals" (four dense cards, "View all" → `/services?sort=newest`) sits after the featured collections.
- Each section is hidden when its list is empty. Skeletons have the same size as today.
- **Category menu:** a server component reads `listStoreCategories(locale)` inside `try`/`catch` (the header must never break).
  - Desktop: an "All categories" menu in the nav row; each item is the category name with its count, linking to `/services?category=<slug>`.
  - Mobile drawer: the same list in a `<details>` block.
  - It is hidden when there are no categories.
- The brand and carrier tiles stay as they are.

**Strings (`store.ts`):** `home.bestSellers.title`, `home.newArrivals.title`.

**e2e:**
- `store.spec.ts`: the region "More services" becomes "Best sellers".
- `home-sections.spec.ts`:
  1. Both sections show at most four cards, and their "View all" links carry the sort.
  2. The first best-seller card equals the first row of `GET /store/v1/services?_sort=popular&_order=desc`.
  3. The menu lists every category of `GET /store/v1/categories` with its count; a click lands on the filtered list with the same total.
  4. The mobile drawer shows the list.
  5. Arabic names.

**Risks:** the header is in the static shell: a category change shows after the catalog cache turns over (30 s to 5 minutes).

#### F32. Content and tracking: sitemap, help vote, codes

**Covers:** A10, A11, A40 (page), A43, BH §2.5, §14.4, §14.5.

**Files:**
```
/home/saifi/gsm-project/storefront/app/sitemap.ts
/home/saifi/gsm-project/storefront/app/[lang]/(store)/help/[slug]/page.tsx
/home/saifi/gsm-project/storefront/components/store/help-vote.tsx              (new, client)
/home/saifi/gsm-project/storefront/app/[lang]/(store)/track/[token]/page.tsx
/home/saifi/gsm-project/storefront/components/store/result-codes.tsx           (new)
/home/saifi/gsm-project/storefront/components/store/result-codes.test.ts       (new)
/home/saifi/gsm-project/storefront/e2e/content.spec.ts                         (new)
/home/saifi/gsm-project/storefront/e2e/stock-delivery.spec.ts                  (new)
```

**API:**
- `GET /store/v1/pages?locale&_start&_end`
- `POST /store/v1/help/:slug/vote { helpful }` → 204
- `GET /store/v1/orders/:token`

**Design:**
- **Sitemap:** for each language, every page of `listContentPages` (100 a request until the total), skipping `noindex: true`, as `/pages/<slug>` with `lastModified = updatedAt`. Services take their alternates from the two cached catalogs as today. The stale comment is removed.
- **Vote:** two buttons under the article.
  - After a 204: "Thank you for your feedback." and both buttons disabled. The article id is remembered in `sessionStorage`.
  - 404 and other errors → the error text. 429 → the wait.
  - The answer never says whether the vote counted, and no count is shown.
- **Tracking:**
  - `splitCodes(result.code)`: when there are two or more lines and every line is 6 to 128 characters with no space, render a numbered list with a Copy button per code and "Copy all"; otherwise the `<pre>` of today.
  - The pending text and timeline labels come from F01.
  - The delivery row keeps the API's `deliveryTime` (the only value tracking has).

**Unit tests:** `splitCodes`: ten codes; one code; a staff reply with spaces stays one block; Windows line ends.

**e2e:**
- `content.spec.ts`: `/sitemap.xml` holds a `/en/pages/<slug>` entry for a published page and none for a `noindex` one. With no content page in the demo, the test creates and publishes one through `POST /admin/content-pages` and `POST /admin/content-pages/:id/publish`; the content cache lasts up to 10 minutes, so the assertion uses the `toPass` loop with a 10-minute ceiling and runs on desktop only. Vote: Yes sends `{ helpful: true }`, shows the thanks and disables the buttons; a mocked 404 shows the error.
- `stock-delivery.spec.ts`:
  1. Fresh customer with a password.
  2. Credit $200.
  3. `importCodes(packs fixture, 5)`.
  4. Through the API as the customer: open a checkout (`quantity: 5`, IMEI, country `US`), record the consents, `POST …/balance-payment`.
  5. Open `/en/track/<token>`: status Completed, five codes listed, each with a Copy button; "Copy all" puts five lines on the clipboard.
  6. The pending text of a second order (10 units, no stock) promises no time.
  7. Arabic labels.

**Backend checks:** `curl -i -X POST http://localhost:3100/store/v1/help/<slug>/vote -H 'Content-Type: application/json' -d '{"helpful":true}'` → 204, twice.

**Risks:** the content cache makes the sitemap test slow on its first run.

#### F33. Add Funds: customer top-ups

**Covers:** A16, BH §3.3, §3.6, D8, SH trap 10 (`/account/wallet?topUp=`).

**Files:**
```
/home/saifi/gsm-project/storefront/components/wallet/top-up-form.tsx                 (new, client)
/home/saifi/gsm-project/storefront/components/wallet/top-up-detail.tsx               (new)
/home/saifi/gsm-project/storefront/components/wallet/top-up-actions.tsx              (new, client: receipt, cancel)
/home/saifi/gsm-project/storefront/components/wallet/top-up-return-poller.tsx        (new, client)
/home/saifi/gsm-project/storefront/components/wallet/top-ups-table.tsx               (new)
/home/saifi/gsm-project/storefront/lib/wallet/top-up-errors.ts                       (new)
/home/saifi/gsm-project/storefront/lib/wallet/top-up-errors.test.ts                  (new)
/home/saifi/gsm-project/storefront/lib/i18n/messages/top-ups.ts                      (new)
/home/saifi/gsm-project/storefront/app/[lang]/account/wallet/add-funds/page.tsx      (new)
/home/saifi/gsm-project/storefront/app/[lang]/account/wallet/top-ups/[id]/page.tsx   (new)
/home/saifi/gsm-project/storefront/app/[lang]/account/wallet/page.tsx
/home/saifi/gsm-project/storefront/e2e/top-ups.spec.ts                               (new)
```

**API:**
- `GET /store/v1/me/wallet/top-up-methods`
- `POST /store/v1/me/wallet/top-ups { amount, gatewayId }` → 201 `TopUpDetail`
- `GET /store/v1/me/wallet/top-ups`, `GET …/:id`
- `POST /store/v1/files` (multipart `file`) → `201 { id }`
- `POST …/:id/receipt { fileId, reference? }` → 201
- `POST …/:id/cancel` (no body) → 200

Every POST carries `X-CSRF-Token` and `Idempotency-Key`.

**Design:**
- **Add-funds page:** the methods and the wallet limits are read on the server.
  - With `enabled: false` or no method: an explanation and a link back.
  - Otherwise the form: method cards (fee, limits, hold hours), amount, a preview of fee and net with `topUpFee`.
- **Client checks before the request:** method minimum and maximum (`"0.0000"` means none), `limits.room`, `limits.amountLeftToday`, `limits.topUpsLeftToday === 0`.
- **Submit:** key from `keys.keyFor(JSON.stringify([amount, gatewayId]))`. A manual method goes to the detail page. An automatic one goes to `paymentUrl` (only `http` or `https`).
- **Detail page:**
  - status badge (`topUp` kind), amounts, method;
  - `instructions` as plain text with line breaks;
  - while `awaiting_payment`, manual and no receipt: the receipt form (PDF, JPEG, PNG up to 5 MiB through `FileUpload` with the store endpoint) and Cancel;
  - `rejected` shows `rejectionReason` as text;
  - an automatic top-up that still awaits payment shows "Continue to payment".
- **Wallet page:** a "Top-ups" card (the last 10, each linking to its page), and the return poller when `?topUp=` is present.
- **`topUpErrorText(error, context)`:**

  | Answer | Text |
  |---|---|
  | `amount` `min`, `max` | with the limit |
  | `amount` `fee` | the fee would use up the amount |
  | `amount` `daily_count`, `daily_amount` | daily limit |
  | `amount` `max_balance` | with the room left |
  | `amount` `format`, `range` | enter a valid amount |
  | `gatewayId` `unavailable` | choose another method |
  | `fileId` `invalid` | upload again |
  | `reference` `taken` | this reference was already used |
  | `file` `type`, `empty` | file texts |
  | `413` | the file is larger than 5 MB |
  | `409 CONFLICT` on create | "You already have three unpaid top-ups. Pay or cancel one first." |
  | `409 CONFLICT` on cancel or receipt | "This top-up can no longer be changed." and a refresh |
  | `409 WALLET_DISABLED` | by code |
  | `409 WALLET_FROZEN` | by code, plus "a bank transfer still works" |
  | idempotency codes | as in F30 |
  | `429` | the wait |
  | `502 GATEWAY_ERROR` | by code |

**Strings (`top-ups.ts`):** form, preview, limits, detail, receipt, cancel, poller states (`waiting`, `inReview`, `credited`, `rejected`, `timeout`) and every error text above.

**Unit tests:** every row of the error table; limit checks with money strings.

**e2e `top-ups.spec.ts`:**
1. Fresh customer: the form lists "CliQ transfer (e2e)"; $2 is refused with the minimum; $25 creates a top-up and shows the instructions.
2. Upload a small PNG and a reference → status "In review".
3. `approveTopUp` → after a reload the status is "Credited" and the wallet shows $25.
4. A second top-up is cancelled → "Cancelled"; cancelling again through a mocked 409 shows the text.
5. `rejectTopUp(…, "Receipt not readable")` shows the reason as text.
6. Three unpaid top-ups, then a fourth → the 409 text.
7. The double-click guard: one request, one top-up.
8. Automatic return: `/en/account/wallet?topUp=<id>` with mocked detail answers `awaiting_payment` → `in_review` → `credited` shows the three poller states and then refreshes.
9. A 6 MB file is refused before upload.
10. Arabic pages.

**Backend checks:** Appendix A (create, upload, receipt, approve) with curl before writing the form.

**Risks:** the 10 new top-ups per 10 minutes limit is per customer: each test uses its own customer.

## 5. Waves, order and dependencies

| Wave | Features (parallel) | Depends on |
|---|---|---|
| W0 | F00 API and config · F01 shared helpers and strings · F02 Docker · F03 e2e harness | the baseline. F02 writes against the `next.config.ts` contract of F00 (`NEXT_OUTPUT`, `GSM_API_REWRITE_ORIGIN`) |
| W1 | F10 sign-in · F11 notifications · F12 catalog list · F13 card, page, quick view | W0 |
| W2 | F20 checkout quantities · F21 wallet core · F22 merchant account · F23 API gaps | W0. F21 and F22 edit the layouts F11 changed. F20 uses `lib/quantity.ts` |
| W3 | F30 balance payment · F31 home and menu · F32 content and tracking · F33 top-ups | F30: F20, F21. F31: F12, F13. F32: F00, F01, F03. F33: F21, F01 |

Files that change owner between waves:

| File (under `/home/saifi/gsm-project/storefront/`) | Owners by wave |
|---|---|
| `lib/i18n/messages/store.ts` | F01 (W0), F13 (W1), F31 (W3) |
| `lib/catalog-facets.test.ts` | F00 (W0), F12 (W1) |
| `e2e/store.spec.ts` | F12 (W1), F31 (W3) |
| `lib/i18n/messages/checkout.ts`, `components/checkout/session-view.tsx`, `app/[lang]/(checkout)/checkout/[token]/page.tsx`, `e2e/checkout.spec.ts` | F20 (W2), F30 (W3) |
| `app/[lang]/account/layout.tsx` | F11 (W1), F21 (W2) |
| `app/[lang]/(portal)/merchant/layout.tsx` | F11 (W1), F22 (W2) |
| `app/[lang]/account/wallet/page.tsx` | F21 (W2), F33 (W3) |

Per wave, the lead's sequence:
1. Start the 4 implementers.
2. When all are done: typecheck, lint, unit tests, build, start `:5176`, run `e2e/harness.spec.ts` once (this caches the staff session).
3. Start the 4 reviewers.
4. Start the fixers where a review asked for changes.
5. Rebuild; run the wave's specs and the regression set; apply spec fallout.
6. Commit per feature (explicit paths), if the owner allows commits.

A baseline commit of the uncommitted tree before W0 keeps the feature commits readable.

## 6. Review checklist (Opus reviewer, one call per feature)

The reviewer reads the feature section, the diff of the owned files and the hand-off note. It may run the feature's spec against `:5176`. Findings are ordered by severity, each with file and line.

1. **Contract.** Every route, parameter, body key, status and error code matches `schema.gen.ts` and the backend contract. No unknown query parameter on a list route. No body and no `Content-Type` on no-body routes. `{}` where a JSON body is required. Optional generated fields the server always sends are read safely.
2. **Security.**
   - CSRF: the token of the called surface; the smart sign-in token under the right surface.
   - `Idempotency-Key` on every wallet POST, balance payment, `/pay` and merchant order: one key per attempt, a new key when the body changes, never shared between `/pay` and the balance payment.
   - No personal data in `'use cache'`, in a cached function's arguments, or outside `<Suspense>`.
   - Notification `title`, `body`, top-up `instructions` and `rejectionReason` are text nodes.
   - Links from the API pass `notificationHref` or `isHttpUrl`; `?next=` passes `safeNext`.
   - Tokens (unsubscribe, checkout, tracking) are never logged, never put in a cache key, always `encodeURIComponent`-ed.
   - Sign-in never tells whether an email exists.
   - The special 401 and 403 answers do not sign anyone out.
3. **Turnstile.** The widget is reset after every submit, success or failure. The token goes in the header only.
4. **Money.** Strings and BigInt helpers only; no `Number()` on amounts used for a decision; display decimals from `/config`; USD wallet amounts labelled as such.
5. **Caching.** Public reads use `cacheLife('catalog')` or `('content')`. Session reads go through `apiSession*`. `router.refresh()` after mutations. No `Date.now()` or `Math.random()` in a prerendered component (Next docs `08-caching.md`).
6. **Language (since 2026-11-16, decision 039: English only).** Every string is English and lives in a message file. No `rtl:` variant, no `dir="rtl"`, no `locale` parameter or field. Logical utilities only. Text that people or suppliers type keeps its own direction (`dir="auto"`, `<bdi>`); numbers, IMEIs, codes and amounts stay left-to-right. `npm run lint` runs the English-only guard. (Before: both languages for every string, mirrored icons, `lang` and `dir` on content in another language.)
7. **Accessibility.** Real labels; errors tied with `aria-describedby`; focus to the first error or to the message; `aria-live` for async results; 44 px targets; keyboard reach of every new control; status never by colour alone.
8. **Layout.** No horizontal overflow at 360, 390, 768, 1440 px. Skeletons the size of the loaded content.
9. **Scope.** Only owned files changed. No new dependency. No Server Action for an API call. No SVG artwork. No invented endpoint, no mock data.
10. **Tests.** Unit tests cover the pure logic named in the feature. The spec asserts what the feature section lists and follows the F03 rules (throwaway accounts, no global switch-off, `toPass` for fresh catalog values).

## 7. Lead verification

**Before W0:**
- `scripts/dev-backend.sh start` (API `:3100`).
- Confirm `/home/saifi/gsm-project/storefront/.env.production.local` points at `:3100`.
- Commit the baseline if the owner allows.

**At the end of every wave** (from `/home/saifi/gsm-project/storefront`):
```bash
npm run typecheck && npm run lint && npm run test
npm run build            # check the route table: /[lang] and /[lang]/services still partial prerender
npm start                # :5176, reads .env.production.local
E2E_RUN=$(date +%s) E2E_BASE_URL=http://localhost:5176 npx playwright test e2e/harness.spec.ts --project=desktop
E2E_RUN=$(date +%s) E2E_BASE_URL=http://localhost:5176 npx playwright test <the wave's specs>
```

| Wave | Specs |
|---|---|
| W0 | `harness`, plus the regression set `routing`, `store`, `checkout`, `merchant` |
| W1 | `auth`, `smart-sign-in`, `notifications`, `unsubscribe`, `store`, `catalog-filters`, `service-display` |
| W2 | `checkout`, `quantity`, `wallet`, `merchant-settings`, `merchant-account`, `account`, `customer-profile`, `merchant`, `merchant-order-idempotency` |
| W3 | `balance-payment`, `store`, `home-sections`, `content`, `stock-delivery`, `top-ups` |

After W1 also check `curl -sI 'http://localhost:5176/_next/image?url=%2Fimages%2Fhome-hero.jpg&w=640&q=75'` → 200 (the `/images/**` pattern), and the service-picture URL from F13.

**Screenshots** for UI features, in en and ar, at 1440 and 390 px: sign-in; notifications page and bell; catalog sidebar; service card, page and quick view; checkout quantity drawer; wallet page; merchant profile; balance choice; home sections and menu; tracking codes; add funds and top-up detail.

**Manual checks no spec can make:**
1. `mustChangePassword`: no staff route sets the flag on its own, so mark a throwaway merchant in the demo database (`gsm_storefront` only), sign in, and confirm the gate lands on the security page and lifts after the change.
2. Turnstile on merchant auth: `scripts/dev-backend.sh stop && TURNSTILE_MERCHANT_AUTH=true scripts/dev-backend.sh start`, run `auth` and `smart-sign-in`, then restart without the variable. Afterwards tell the backend lead the site sends the header.

**Final acceptance (after W3):**
1. The full suite on both projects, with the exclusive specs, nothing else running:
   `E2E_EXCLUSIVE=1 E2E_RUN=$(date +%s) E2E_BASE_URL=http://localhost:5176 npx playwright test`
2. The Docker image, then the full suite against the container on `:5176` (stop `next start` first):
   ```bash
   docker build -t gsm-site:local --network host \
     --build-arg GSM_API_ORIGIN=http://localhost:3100 \
     --build-arg GSM_API_REWRITE_ORIGIN=http://localhost:3100 \
     --build-arg NEXT_PUBLIC_SITE_URL=http://localhost:5176 \
     --build-arg NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA \
     /home/saifi/gsm-project/storefront
   docker run --rm --network host -e PORT=5176 -e GSM_API_ORIGIN=http://localhost:3100 gsm-site:local
   ```
   Check the health status, `/robots.txt`, `/en`, an optimized site image, and that no `.env` file is in the image (`docker run --rm gsm-site:local ls -a`).
3. Walk the acceptance lists of §2.2 once by hand in both languages.
4. Update `PROGRESS.md`, `CLAUDE.md` (Turnstile routes, wallet, notifications, new helpers), `docs/BACKEND-NEEDS.md` (closed items; the list of §8).

## 8. Backend limitations and owner decisions

**Report, do not work around.**

Backend limitations:
1. There is no smart forgot-password route: the forgot page keeps a Customer or Merchant choice, and each route needs its own Turnstile token.
2. `POST /client/auth/register` takes no language: the first verification mail is English, and the site can only save the language after the first sign-in in the same browser (D4).
3. An email that is both a merchant and a customer can reach the customer area only through the magic link.
4. Cards carry no `quantity`: no "From" price on cards, and no price sort or filter by the smallest purchase.
5. No stock count, and nothing tells the site when availability changes: the site can be up to 5 minutes behind (D14). `in_stock` speaks for the smallest order only.
6. The checkout session and tracking carry only the English `service.deliveryTime` and the catalog name. They have no `deliveryMinutes`, `etaText`, localized title, service id or slug. `/store/v1/me/orders` has no delivery time and no unit price.
7. The receipt PDF and the order emails show no quantity and no unit price. No order email carries the tracking link. The default order emails speak of an "unlock" for every service.
8. No signal while an on-request order waits. With `autoRefundFailed` off the timeline says "Refunded" while the refund is only requested.
9. Wallet events (credited, rejected, adjusted, on hold, refund to balance) create no notification-center item.
10. Customers have no notification preferences beyond `marketingOptIn`. There is no public announcements feed.
11. Category `serviceCount` is not narrowed by other filters, and there are no facet counts on the API: the site counts brands, carriers, countries and types over at most 1000 cached cards.
12. The merchant wallet statement has no date filter (the customer one has).
13. No route changes an email (customer or merchant). No ticket list, no ticket attachments, no cart, favourites, social sign-in, PayPal, Vodafone Cash or profile photo.
14. Data-export delivery is undefined. Model, network and MEP options cannot be ordered.
15. `GET /store/v1/help/:slug` has no language parameter.
16. A supplier's TIME text can give a misleading `deliveryMinutes` (BH §14.9): staff should check before the site says "Delivered within …".
17. OpenAPI marks `createdByStaff` (and other always-sent fields) optional.

Site limitation, kept: an unknown slug inside a streamed page answers 200 with `noindex`.

Owner decisions:
1. Switch `wallet.customer.enabled` on (legal and accounting sign-off), and card top-ups.
2. The payment provider.
3. JOD `decimals` set to 2 in the console.
4. Whether to use the word "Pre-order" (the plan avoids it).
5. Production values: shop host, Turnstile site key and secret, time zone.
6. The missing `logo-mark.png`.
7. Allow commits (baseline, then one per feature).
8. The backend lead turns `TURNSTILE_MERCHANT_AUTH` on after the lead's check.

## 9. PROGRESS.md updates and agent usage

After each wave the lead adds a section to `/home/saifi/gsm-project/storefront/PROGRESS.md`:
- date;
- features done, with one line each on what changed for a visitor;
- checks run and their numbers (unit tests, e2e passed, skipped, failed, build page count);
- demo-database changes;
- open items;
- the usage table.

The first entry also records what the F03 global setup changes in the demo database, all of which `scripts/dev-backend.sh reset` undoes and the next e2e run recreates:
- quantity rules of three services;
- stock of two services;
- the JOD currency;
- the `cliq-e2e` gateway;
- the wallet switched on;
- one service picture.

Agent-usage table (one row per feature; the limit is 3):

| Feature | Wave | Implement (Sonnet) | Review (Opus) | Fix (Sonnet) | Calls used | Lead check | Commit |
|---|---|---|---|---|---|---|---|
| F00 API and config | W0 | | | | /3 | | |
| F01 Shared helpers and strings | W0 | | | | /3 | | |
| F02 Docker image | W0 | | | | /3 | | |
| F03 e2e harness | W0 | | | | /3 | | |
| F10 Smart sign-in | W1 | | | | /3 | | |
| F11 Notifications and unsubscribe | W1 | | | | /3 | | |
| F12 Catalog list | W1 | | | | /3 | | |
| F13 Card, page, quick view | W1 | | | | /3 | | |
| F20 Checkout quantities | W2 | | | | /3 | | |
| F21 Wallet core | W2 | | | | /3 | | |
| F22 Merchant account | W2 | | | | /3 | | |
| F23 Site API gaps | W2 | | | | /3 | | |
| F30 Balance payment | W3 | | | | /3 | | |
| F31 Home and category menu | W3 | | | | /3 | | |
| F32 Content and tracking | W3 | | | | /3 | | |
| F33 Add Funds | W3 | | | | /3 | | |
| **Total** | | | | | /48 | | |

## Appendix A: recipes against the isolated backend (`http://localhost:3100` only)

Staff session (the seeded Owner; a TOTP code works once, so wait for the next 30-second step if `2fa` answers 422):
```bash
API=http://localhost:3100; O='Origin: http://localhost:5175'; J=$(mktemp)
T=$(curl -s -D - -o /dev/null -c "$J" -H "$O" -H 'Content-Type: application/json' \
  -d '{"email":"rami@gsm-supply.example","password":"demo-password"}' $API/admin/auth/login \
  | awk 'tolower($1)=="x-csrf-token:"{print $2}' | tr -d '\r')
CODE=$(cd /home/saifi/gsm-project/backend && bun -e 'import { generate } from "otplib"; console.log(await generate({ secret: "4DP3DBKM62TVFPNM5QE6OO4P6STUYM3J" }))')
T=$(curl -s -D - -o /dev/null -b "$J" -c "$J" -H "$O" -H 'Content-Type: application/json' -H "X-CSRF-Token: $T" \
  -d "{\"code\":\"$CODE\"}" $API/admin/auth/2fa | awk 'tolower($1)=="x-csrf-token:"{print $2}' | tr -d '\r')
adm() { curl -s -b "$J" -H "$O" -H 'Content-Type: application/json' -H "X-CSRF-Token: $T" "$@"; }
```

Admin calls (paths from the backend contracts):
```bash
adm -X PATCH $API/admin/settings -d '{"wallet.customer.enabled": true}'
adm "$API/admin/customers?q=<email>"                                   # → [{ id, … }]
adm -X POST $API/admin/customers/<id>/wallet/adjust -H "Idempotency-Key: $(uuidgen)" \
    -d '{"amount":"20.0000","direction":"credit","reason":"e2e"}'
adm "$API/admin/payments?customerId=<id>&status=pending"               # the top-up payment to review
adm -X POST $API/admin/payments/<paymentId>/approve
adm -X PATCH $API/admin/services/<id> -d '{"qtyOptions":[5,10,25]}'
adm -X PATCH $API/admin/services/<id> -d '{"qtyOptions":[],"minQty":2,"maxQty":50}'
adm -X POST $API/admin/services/<id>/inventory/import -d '{"codes":["E2ECODE000001","E2ECODE000002"]}'
adm -X POST $API/admin/notification-campaigns -d '{"name":"e2e","purpose":"service","channels":["in_app"],
    "audience":{"include":[{"type":"customer","id":<id>}]},
    "content":{"en":{"title":"Hello","body":"Line 1\nLine 2"}},"link":{"customer":"/account/orders"}}'
adm -X POST $API/admin/notification-campaigns/<campaignId>/send -d '{"confirmRecipients":1}'
adm -X POST $API/admin/clients/<id>/password -d '{"mode":"temporary_password"}'   # → { temporaryPassword }
```

Customer session and wallet reads:
```bash
C=$(mktemp)
CT=$(curl -s -D - -o /dev/null -c "$C" -H 'Content-Type: application/json' -H 'X-Turnstile-Token: XXXX.DUMMY.TOKEN.XXXX' \
  -d '{"email":"<throwaway email>","password":"<password>"}' $API/store/v1/auth/login \
  | awk 'tolower($1)=="x-csrf-token:"{print $2}' | tr -d '\r')
curl -s -b "$C" $API/store/v1/me/wallet
curl -s -b "$C" "$API/store/v1/me/notifications?locale=en&_start=0&_end=20" -D -
curl -s -b "$C" -H "X-CSRF-Token: $CT" -H "Idempotency-Key: $(uuidgen)" -H 'Content-Type: application/json' \
  -d '{"amount":"25","gatewayId":<gatewayId>}' $API/store/v1/me/wallet/top-ups
curl -s -b "$C" -H "X-CSRF-Token: $CT" -F 'file=@/home/saifi/gsm-project/storefront/public/images/home-help.jpg;type=image/jpeg' $API/store/v1/files
```

Mail: `curl -s 'http://localhost:8025/api/v1/search?query=to:<address>&limit=5'`, then `…/api/v1/message/<ID>`. Links in mails point at `http://localhost:5175`; use their path and query on `:5176`.

## Appendix B: agent briefs

**Implementer (Sonnet):**
> You implement feature `<ID>` of `/home/saifi/gsm-project/storefront/IMPLEMENTATION-PLAN.md`. Read §0, §3, your feature section, `CLAUDE.md`, and the Next docs your feature cites. You may edit only the files in your "Files" list. Use absolute paths. Do not touch git, do not run `next build`, `next start` or Playwright, and do not call `:3000` or `:5175`. Check every route you use with curl against `http://localhost:3100` (Appendix A) before you code against it. Write the unit tests and the e2e spec your section lists (the spec is run by the reviewer). Finish with `npx vitest run <your tests>`, `npx tsc --noEmit` (your files clean) and `npx eslint <your files>`, then the hand-off note of §0 rule 8.

**Reviewer (Opus):**
> You review feature `<ID>` against its section of the plan and the checklist of §6. Read the hand-off note and the changed files. The lead's build of the current tree runs on `http://localhost:5176` against the isolated API. Run `E2E_RUN=$(date +%s) E2E_BASE_URL=http://localhost:5176 npx playwright test e2e/<feature spec> --project=desktop` (and `--project=mobile` for UI features), and take screenshots in en and ar. Change no file. Answer with findings by severity (file and line, what is wrong, what the fix is), the spec result, and a verdict: accept, or fix with the list.

**Fixer (Sonnet):**
> Apply the reviewer's findings for feature `<ID>`, within the same file ownership and rules as the implementer. Do not widen the scope. End with the same checks and a hand-off note that lists each finding and what you did.

### Critical Files for Implementation
- /home/saifi/gsm-project/storefront/lib/api/browser.ts
- /home/saifi/gsm-project/storefront/lib/api/public.ts
- /home/saifi/gsm-project/storefront/next.config.ts
- /home/saifi/gsm-project/storefront/components/auth/sign-in-flow.tsx
- /home/saifi/gsm-project/storefront/components/checkout/session-view.tsx
