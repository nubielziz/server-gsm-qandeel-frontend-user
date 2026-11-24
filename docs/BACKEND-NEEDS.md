# Backend changes the storefront needs

> **Status 2026-11-15: items 1 to 8 below are closed.** Backend feature 22 (`STOREFRONT-BACKEND-HANDOFF.md` §2) added
> availability (`in_stock` / `on_request`, never a count), categories with counts, staff-editable listing content, a
> delivery time per language (`deliveryMinutes`, `etaText`), best sellers (`_sort=popular`) and new arrivals
> (`_sort=listedAt`), a picture per service (`imageUrl`) and the server filters (`type`, `categoryId`, `availability`,
> `minPrice`/`maxPrice`). The customer wallet and the notification feed, once out of scope, were built too (features 21
> and 23). The site uses all of them since waves 1 to 3 of `IMPLEMENTATION-PLAN.md`. What the backend still lacks is the
> list under "Open (2026-11-15)" at the end; the items 1 to 8 stay below as the record of the requests.
>
> **Language, 2026-11-16 (decision 039):** English is the only language of the system, so everything below that speaks of
> "a language", "the requested `locale`" or "per language" is the record of a request made while the site had two languages.
> The API no longer takes or sends a language (backend feature 30), the site sends no `locale`, and the delivery time
> (item 4), the category names and the listing rows are English only. Nothing here asks the backend for a language any more.

For the backend lead and the owner. Each item says what the store's design (the owner's mockups in `screenshots/`)
wants, what the API offers today, a suggested change, and where the storefront would use it. The storefront never
edits `backend/` (CLAUDE.md), so these are requests only. Already decided as out of scope in the handoff (§1.7): cart of
several services, favourites, customer wallet (phase 2W), notification feed, social sign-in.

## 1. Availability (stock) on store cards — "In stock only" filter

- **Design:** the home page's "All services" sidebar has "Availability: In stock only (16)"; cards show "In stock".
- **Today:** `GET /store/v1/services` cards have no stock field and no stock filter. Stock exists only for services
  that deliver codes from the inventory (`inventory_codes`, `catalog/application/inventory-stock.ts`): with enough
  available codes an order is delivered at once; with fewer, the order is still accepted and goes to the supplier or
  the manual queue. So every listed service can be bought, and "in stock" really means "delivered instantly from
  stock". The storefront cannot read the inventory itself (staff-only data).
- **Suggested:** on the card and the service page, `availability: "in_stock" | "on_request"` (in stock = available
  codes ≥ the service's minimum quantity), optionally a capped `stock` (0–99) so exact inventory is not exposed; and a
  filter `availability=in_stock` on `GET /store/v1/services`. The cached store reads must change when codes are added
  or sold.
- **Storefront:** an "Availability" group in `components/store/list-filters.tsx` (+ an `inStock` flag in `ListFilter`,
  `lib/catalog-facets.ts`) and an "In stock" mark on `ServiceCard`. About an hour of work once the field exists.

## 2. Categories on store cards

- **Design:** "Categories" (IMEI Checking, GSM Servers, Tool Activations, Software Licenses, GSM Credits …) in the
  header menu, the tiles strip and the sidebar.
- **Today:** the store card has only `type` (`imei | server | remote | file`); the sidebar's "Categories" shows these
  four types. The catalog has real categories (`GET /client/services` rows carry `category {id, name}`), but the store
  API does not expose them and has no category filter.
- **Suggested:** `category: { id, slug, name }` (name in the requested `locale`) on store cards, a repeatable
  `category` filter, and `GET /store/v1/categories` (listed categories of a language with their service counts).
- **Storefront:** `homeList` swaps the type list for categories; the header can get the mockup's "All Categories" menu.

## 3. Listing content editable from the admin console

- **Today:** `PATCH /admin/service-listings/{id}` takes only `isListed` and `retailPrice`; `POST` takes the title and
  slug. `summary`, `descriptionMd`, `requirementsMd`, `etaText`, `brand`, `carrier`, `country`, `isFeatured`, `sort`,
  `seoTitle`, `seoDescription` exist in `service_listings` but only the demo seed writes them.
- **Effect:** on the owner's API the home page can never show featured services, brand/carrier tiles, featured
  collections, card summaries, service descriptions or requirements, and the sidebar's brand/carrier/country lists
  stay empty.
- **Suggested:** accept these fields in `POST`/`PATCH /admin/service-listings` (per language row).

## 4. Delivery time in the visitor's language

- **Today:** the card's `deliveryTime` is the catalog's English text ("2 min", "1 hour") on the Arabic site too.
- **Suggested:** a structured value (`deliveryMinutes`, or min/max) the store formats per language, or a localized text.

## 5. Best sellers (mockup)

- **Today:** no order counts on store cards and no popularity sort.
- **Suggested:** `_sort=popular` (orders of the last 30 days) on `GET /store/v1/services`, or a `sold30d` field.

## 6. New arrivals (mockup)

- **Today:** `_sort` allows `featured`, `sort`, `title` only; cards have no date.
- **Suggested:** `listedAt` on cards and `_sort=listedAt`.

## 7. A picture per service

- **Design:** each product card and quick view shows its own picture (Samsung, EFT Pro, MRST, Chimera …).
- **Today:** no picture per service anywhere. The `services` table has no image column; store cards and the service
  page carry no image; `service_listings.og_file_id` (a share image) exists but the store API does not return it and
  the admin API cannot set it. The suppliers send none either: their synced services (`supplier_services.raw`, the
  Dhru-style fields `SERVICEID, SERVICENAME, SERVICETYPE, CREDIT, TIME, INFO, QNT, MINQNT, MAXQNT, SERVER, CUSTOM`)
  have no picture. So the store shows one picture per service type (`public/images/service-<type>.jpg`).
- **Suggested:** an image per service (or per listing), uploaded in the console through the existing files module,
  and `imageUrl` (public, cache-friendly) on store cards and the service page.
- **Storefront:** `ServiceThumb` / `ServiceArt` (`components/store/service-art.tsx`) use `imageUrl` when present and
  keep the type picture as the fallback; `next.config.ts` `images` gets the files host.

## 8. Price and type filters on the server (later)

- **Today:** the home list filters by type and price in memory over the whole catalog of a language (at most 1000
  cards, cached; `lib/catalog.ts`). Fine at today's size.
- **Suggested, for a larger catalog:** `minPrice` / `maxPrice` (in the requested currency) and `type` filters, plus
  facet counts, on `GET /store/v1/services`.

## Open (2026-11-15): backend limitations the site meets (`IMPLEMENTATION-PLAN.md` §8; report, do not work around)

1. ~~No smart forgot-password route: the forgot page keeps a Customer or Merchant choice, each with its own Turnstile token.~~
   **Closed 2026-11-24:** one account type (`docs/decisions/002-one-account.md`): one forgot page, one route, one Turnstile token.
2. ~~`POST /client/auth/register` takes no language: the first verification mail is English; the site saves the language
   after the first sign-in in the same browser.~~ **Closed 2026-11-16:** the site no longer calls the route. Merchants
   apply on WhatsApp (`NEXT_PUBLIC_MERCHANT_WHATSAPP`) and staff create the account in the admin console, which sends the
   set-password link; nothing is saved in the browser any more.
3. ~~An email that is both a merchant and a customer reaches the customer area only through the magic link.~~ **Closed 2026-11-24:** an
   email belongs to one account (backend decision 064); a guest's orders reach it through the proven-mailbox claim at the sign-in link.
4. Cards carry no `quantity`: no "From" price on cards, no price sort or filter by the smallest purchase.
5. No stock count and no change signal: availability can be up to 5 minutes behind; `in_stock` speaks for the smallest
   order only.
6. The checkout session and tracking carry only the English `service.deliveryTime` and the catalog name (no
   `deliveryMinutes`, `etaText`, localized title, service id or slug); `/store/v1/me/orders` has no delivery time and no
   unit price.
7. The receipt PDF and the order emails show no quantity and no unit price; no order email carries the tracking link; the
   default order emails speak of an "unlock" for every service.
8. No signal while an on-request order waits; with `autoRefundFailed` off the timeline says "Refunded" while the refund is
   only requested.
9. Wallet events (credited, rejected, adjusted, on hold, refund to the balance) create no notification-center item.
10. Customers have no notification preferences beyond `marketingOptIn`; there is no public announcements feed.
11. Category `serviceCount` is not narrowed by other filters and the API has no facet counts: the site counts brands,
    carriers, countries and types over at most 1000 cached cards.
12. The merchant wallet statement has no date filter (the customer one has).
13. No route changes an email (customer or merchant); no ticket list, ticket attachments, cart, favourites, social
    sign-in, PayPal, Vodafone Cash or profile photo.
14. Data-export delivery is undefined; model, network and MEP options cannot be ordered.
15. ~~`GET /store/v1/help/:slug` has no language parameter.~~ No route has one any more (decision 039).
16. A supplier's TIME text can give a misleading `deliveryMinutes`: staff should check it before the site says
    "Delivered within …".
17. OpenAPI marks `createdByStaff` (and other always-sent fields) optional.
18. (Found in W3.) A receipt sent again on an `in_review` top-up answers `201` instead of `409`; cancelling a cancelled
    top-up answers `200`; top-up list rows carry no instructions.

Site limitation, kept: an unknown slug inside a streamed page answers 200 with `noindex`.
19. ~~**Referral code on staff-created merchants (2026-11-16).** Merchants now apply on WhatsApp and staff create the
   account with `POST /admin/clients`, whose body has no referral code; no staff route sets `referredById` (only the
   self-registration route did). The site still reads `?ref=CODE` and puts "Referral code: CODE." in the WhatsApp message,
   but staff cannot record it, so a referred merchant is not linked to the referrer and earns them no commission. Needs an
   optional `referralCode` on `POST /admin/clients` (422 `unknown_code` like the register route) and the field in the
   console's New merchant dialog.~~ **Closed 2026-11-23:** referrals and commissions are retired
   (`docs/decisions/001-merchant-extras-retired.md`); the site no longer reads `?ref=` and nobody needs the field.

## Retired features: what the backend removal must respect (2026-11-23, `docs/decisions/001-merchant-extras-retired.md`)

The shop stopped calling these routes and reading these fields before the backend removes them (shop first, backend last, then
`npm run gen:api`). Each item: what the shop does now, what the API does today, what the removal must keep.

20. **Referrals and commissions.** `GET /client/referrals` and `GET /client/commissions` are no longer called; `referralCode`
    on `GET /client/auth/me` and the profile answers is no longer read; the site never calls `POST /client/auth/register`,
    whose body has a `referralCode` (the e2e helper `freshAccount` does not call it either: staff create the account through
    the admin API and the invitation sets the password). All of them still answer today. The backend may remove them; nothing in
    the shop breaks either way.
21. **Statement kind `commission`.** Old ledger rows keep the kind; the merchant wallet statement keeps the label "Commission"
    (`lib/i18n/messages/wallet.ts`), so they keep their stored word.
22. **`POST /client/api-keys`.** The shop always sends `scopes: ["dhru"]` and never lets the merchant pick scopes. Today
    `scopes` is required: a non-empty subset of `dhru`, the REST scopes and their wildcards. When the REST API goes, the API
    must keep accepting `["dhru"]` (or make the field optional and ignore it), never reject it as unknown, until the shop stops
    sending it.
23. **`GET /client/api-keys`, `PATCH /client/api-keys/:id`.** `scopes` is read and never shown. A key made only with REST
    scopes is listed like any other key ("Active"); the backend's migration decides what happens to such keys (revoke them, or
    add `dhru`).
24. **Webhooks.** `GET` and `POST /client/webhooks`, `PATCH` and `DELETE /client/webhooks/:id`,
    `POST /client/webhooks/:id/test` and `GET /client/webhooks/:id/deliveries` are never called; the backend may remove them
    any time after the shop's release.
25. **Order source `v1`.** Old rows keep `orders.source = 'v1'`; the shop keeps the label "REST API" for them, and an unknown
    source shows its raw value.
26. **`PUT /client/notification-preferences`.** Rows are `{event, email}`; `telegram` is added only when the GET showed it
    for that event, with the shown value. Today the row's `telegram` is required, and a `true` that is not the shown value
    without a linked chat answers 422 `events.N.telegram` `telegram_not_linked`. The removal drops `telegram` from the row body,
    from the GET and PUT answers (the page's `telegram: {linked}` and each event's flag) and the `telegram_not_linked` code.
27. **`POST /client/telegram/link`.** No longer called; it goes with the bot webhook and the campaign channel.
28. **Ticket rating.** `POST /store/v1/tickets/:token/csat` is no longer called; `canRate` and `csatScore` in the ticket
    answers and in `ticket.updated` are not read. The backend may stop sending them.
29. **Ticket typing.** `POST /store/v1/tickets/:token/typing` and `POST /client/tickets/:id/typing` are never sent and the
    `ticket.typing` stream event is not listened to; the routes and the event go together.
30. **Device sessions.** `GET /client/sessions` and `DELETE /client/sessions/:id` are no longer called. `GET /client/dashboard`
    is still read (the wallet, the order counts, the latest orders); none of its fields go.
31. **Order note.** `clientNote` on `GET /client/orders/:id` is no longer read (the order detail shows no note). The backend may
    remove the field from the answer any time; after `npm run gen:api` nothing in the shop refers to it.
32. **Invoice kind `statement`.** The invoices filter offers `topup` and `manual` only and sends no other `kind`; a `?kind=statement`
    in an old address is ignored. Old rows keep their kind and the label "Statement" in the list. The backend may narrow the
    `kind` values of `GET /client/invoices`.
