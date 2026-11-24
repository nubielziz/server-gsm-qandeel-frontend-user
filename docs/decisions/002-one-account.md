# 002 One account

**Context.** Until 2026-11-24 the shop knew two kinds of account that were separate people to it: a customer (the shop, the
`/en/account` area, the store routes and the `csrf_token_store` cookie) and a merchant (the portal under `/en/merchant`, the
`/client/*` routes and the `csrf_token_client` cookie). Sign-in asked for the kind, four session readers answered "is a
customer or a merchant signed in?", and every shared component took a "surface" prop. Backend decision 064 makes one account
type: an account has a rank, retail or merchant, and the rank decides what it can do. Console decision 023 does the same for the
staff pages. This is the shop's side of it.

**Decision.**

1. **One account area, `/en/account`.** Every signed-in account has the same frame (rail, drawer, tab bar, header, bell,
   account menu). The rank only adds places: a merchant rank has a price list, invoices, API keys and notification preferences
   beside the pages everyone has (overview, orders, wallet, notifications, support, settings with profile, security and privacy).
   The folders `app/en/(portal)` and `app/en/(auth)/merchant` are gone. A page that only one rank has asks for it with
   `requireRank("merchant", <its own address>)`; the other rank goes to `/en/account`. A refusal for the rank
   (`RANK_NOT_ALLOWED`) never signs anybody out.
2. **One session reader.** `getAccount()`, `requireAccount(next)`, `requireRank(kind, next)` and `signInPath(next)`
   (`lib/api/session.ts`) replace `getMerchant`, `getCustomer`, `requireMerchant` and `requireCustomer`. Both "me" routes answer one
   shape, `AccountMe`; a signed-out visitor, a suspended account, a blocked address and a refused rank all read as "nobody".
   `signInPath` carries `?next=` only: no sign-in address names a kind of account.
3. **The rank picks the routes, never the page.** `familyOf(me)` is `"client"` for the merchant rank and `"store"` for anything else
   (an unknown rank is retail: it fails closed). `lib/account/routes.ts` is the one table of API routes by family and
   `lib/account/capabilities.ts` the one table of what a rank may see. A component takes a `family` where it must pick a route and
   a rank where it must pick a text; there is no "surface" prop any more.
4. **One CSRF token.** The API still names the readable cookie after the rank's family, so the shop accepts either name, and only
   `lib/api/account-cookie.ts` knows them. The browser client keeps one token and sends it on every write to both route prefixes.
   `lib/account/one-account.test.ts` fails when any other file under `app`, `components` or `lib` names a cookie.
5. **One sign-in.** One form (`POST /client/auth/sign-in`), whose answer carries the next step and the rank; the shop reads
   `next` and `rank.kind` and never the old `kind` word. Sign-up is the email link only; forgot password, set password and verify
   email are one page each, with mailed links at the shop root (`/set-password`, `/verify-email`, `/sign-in?token=`). Merchant
   accounts are still opened by the team: `/en/become-a-merchant` (WhatsApp, as before) replaces `/en/merchant/register`. The
   retail two-step routes are `/store/v1/me/2fa/*`. The page of an emailed sign-in link shows a ticked box, "Add the orders I
   placed as a guest with this email", and sends `claimGuestOrders`; it tells how many orders were added, and says so when the
   backend could not do it just now.
6. **Wallets by rank.** `readAccountWallet()` reads the one wallet of the request: the store balance for a retail rank (shown while
   the store wallet is on or the balance is not zero) and the merchant wallet for a merchant rank. Add funds is one address with two
   bodies: top-ups for a retail rank, invoices for a merchant rank (their create call carries an `Idempotency-Key`). An order row of
   a retail rank links to its tracking page; one of a merchant rank links to its order page.
7. **Shop and checkout.** The price hint and "Order at your price" show for a merchant rank only. `checkoutAccess(me, guestCheckout)`
   answers `guest-form`, `sign-in`, `account-form` or `price-list`: a merchant rank gets a card that sends it to its price list and the
   checkout form never mounts for it. On the home page a merchant rank sees a banner that links to
   its price list; it reads the account only when the readable cookie of the merchant family exists, so a visitor costs no request.
   (Replaced by decision 003: no price list; a merchant rank sees its own prices in the shop and orders at the checkout address.)
8. **Privacy.** The data export is offered to every account; the erasure request is offered to the retail rank only. A merchant rank
   sees a sentence in place of the erasure button (move the account to the retail rank first) and no request is sent.
9. **Old addresses.** `lib/account/legacy-paths.ts` is the one table of the retired addresses (every page under `/merchant`, the
   old ticket list, the merchant register, set-password and verify-email pages, and the pages retired by decision 001).
   `next.config.ts` turns each row into two permanent redirects, with and without `/en`, before `proxy.ts` runs; `proxy.ts` knows
   no portal address. A stored link (a notification, a mailed link, a bookmark) is rewritten with `legacyAccountPath`. The sign-in
   page does the same for a `?next=` value. `/en/account…` without either CSRF cookie goes to `/en/sign-in?next=…`.
10. **Removed with it.** The sign-up chooser, the Customer | Merchant switch, the portal layout, the pending-approval notice and its
    error code text, `MerchantBanner`, `MerchantPriceHint`, the two header wallet readers, and the message groups only the portal
    used.

**Compatibility and release order.** The shop of this decision needs the backend of decision 064: it asks `GET /client/auth/me` for
a merchant rank and `GET /store/v1/me` for a retail one, and the same shape back, it calls the retail two-step routes, and it
sends `claimGuestOrders`. The old customer routes answer 410 on that backend, so the two are released together, in one
maintenance window, and `lib/api/schema.gen.ts` is regenerated (`npm run gen:api`) from the merged backend's OpenAPI before the shop is
built. The shop's pull request reads the backend branch named in `ci/backend-ref` (one line: the branch the `api-types` check
generates from); it is `main` outside a pull request that needs a stage branch. The backend's contract release comes days later;
until the types are regenerated after it, `lib/api/types.ts` keeps aliases of routes it retires (`StoreLoginResult`,
`MerchantLoginResult`, `MerchantPasswordChangeResult`) and the sign-in answer still carries the old `kind` word, which nothing reads.

**Consequences.** One set of pages, one frame and one session reader instead of two; every address that was published still works
through the table; a new rank-only page is one `requireRank` call and one `capabilities` flag. The cost is that retail and merchant
share files, so a text that differs by rank sits in a rank-named body (`RetailWalletBody`, `MerchantWalletBody`) and each body is
unit-tested on its own. `PROGRESS.md` records the change.
