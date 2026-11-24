# 001 Merchant extras retired

**Context.** On 2026-11-23 the owner decided to retire a set of extras of the merchant portal and of the support tickets that
nobody needs: referrals and commissions, outgoing webhooks and the merchant REST API, the chat-app notification channel and the
notification sound, the rating and the typing line of a ticket, the per-device session list and three cards of the
merchant dashboard. The backend removes their routes and data later and the admin console drops its own side of them. This is
the first numbered decision of the shop: a bare "decision 039" elsewhere in this repository is a backend decision.

**Update 2026-11-24.** Decision 002 moved the merchant pages under `/en/account`. The addresses and page names below are the ones this
decision was made with: the merchant application page is now `/en/become-a-merchant`, the API keys page is `/en/account/settings/api-keys`, the
settings are `/en/account/settings`, and the old addresses of this decision (referrals, webhooks, the verification page) answer a 308
straight to `/en/account`, `/en/account/settings/api-keys` and `/en/account/settings`.

**Decision.** The shop removes each feature completely and keeps what is named below.

1. **Referrals and commissions.** Gone: the merchant Referrals page (referral code and link, commission plan, referred
   merchants, the commission list with its status tabs and month filter), its navigation entry, its messages, the `Referrals` and
   `Commission` types and their tests, and the referral code row of the settings "Account details" card. Kept: the merchant
   application page (`/en/merchant/register`, WhatsApp). It no longer reads a query: it is fully static (its client component
   and `<Suspense>` are gone), the prefilled message carries no code and the page shows no note; an old shared link that still
   has `?ref=` opens it unchanged. The statement kind label "Commission" stays, so old ledger rows keep their stored word.
   Old addresses: `/en/merchant/referrals` and `/merchant/referrals` answer 308 to `/en/merchant` (a query rides along and
   is ignored). Routes no longer called: `GET /client/referrals`, `GET /client/commissions`.
2. **Outgoing webhooks and the merchant REST API.** Gone: the Webhooks list, the delivery log of an endpoint, their manager
   component, the navigation entry, the messages, the three webhook types, the `delivery` status family of `StatusBadge`, the
   `invalid_scope` error text, and the REST API parts of the API keys page (the scope list of the create form, the scope
   badges of a key, the help block with the `Authorization` example and the `/v1` base URL). Kept: API keys as Dhru
   credentials (name, allowed addresses, expiry, rate limit, "Made by support", the Dhru help block with the username, the
   access key and the base URL). The create form sends `scopes: ["dhru"]` because the API still requires a non-empty list;
   the scopes of an existing key are never shown or edited. The order source label `v1` ("REST API") stays, so an old order
   still reads right. Old addresses: every address under `/en/merchant/webhooks` and `/merchant/webhooks` answers 308 to
   `/en/merchant/api-keys`, before any sign-in check. Routes no longer called: the six `/client/webhooks…` routes.
3. **The chat-app channel and the notification sound.** Gone from the merchant notification preferences: the Telegram link card, its
   button and status badge, the second switch of each event, the "link first" hint, the unavailable notice and the field text
   of `telegram_not_linked`. Gone from the customer and the merchant notifications pages: the sound switch and its stored
   setting (the browser key `gsm.notification-sound` is read by nothing), and the sound itself: the bell's arrival chime (its
   player `lib/notifications/chime.ts`, its test and its wiring in the bell and in `lib/notifications/bell-motion.ts`; it had no
   audio file). Nothing in the shop plays a sound now. Kept: the preferences page as one card (the low-balance threshold and one
   Email switch per event), the inbox and the bell with its swing, badge pop, rolling number, title badge and live updates.
   Compatibility: an event row that the GET showed with a `telegram` flag goes back with that same value (the current PUT
   requires it and accepts the shown value); a row shown without one goes back without it. Route no longer called:
   `POST /client/telegram/link`.
4. **The rating and the typing line of a ticket.** Gone: the satisfaction rating of a resolved ticket (the form, its thank-you
   state, `POST /store/v1/tickets/:token/csat`) and the typing indicator both ways (the visitor's ping,
   `POST /store/v1/tickets/:token/typing` and `POST /client/tickets/:id/typing`, and the "Support is typing" line;
   `ticket.typing` left the stream's event names). Kept: seen marks (`ticket.read`, the read routes, "Sent" and "Seen"), live
   arrival of new messages (the stream and its refetch fallback), attachments, the closed notice, the reply form, the ticket
   lists and their unread badges. Compatibility: `Ticket` leaves out `canRate` and `csatScore`, and the event parser drops
   them and `ticket.typing`. No address goes away.
5. **Device sessions and dashboard extras.** Gone from the merchant security page: the per-device session list (device,
   address, last active, "End session" per row, signing out of this device with its confirmation), its component files, its
   User-Agent summary helper, its messages and the `MerchantSession` type. Gone from the merchant dashboard: the quick-order
   box, the order-status summary bar and the "order again" cards (the header search and the orders page do their jobs). Kept:
   the password and two-step cards (changing the password or switching two-step sign-in still ends the merchant's other
   sessions on the server, and their texts say so), signing out in the account menu, and on the dashboard the balance card, the
   four order counters, the recent orders (now full width), the help card and the waiting area of a merchant who is not active
   yet. The old anchor `/en/merchant/settings/security#sessions` opens the page at the top. Routes no longer called:
   `GET /client/sessions`, `DELETE /client/sessions/:id`; `GET /client/dashboard` is still read and none of its fields go.
6. **Two dead values.** The order detail no longer reads `clientNote` (nothing writes it) and the invoices filter no longer
   offers the kind `statement` (nothing makes such an invoice); an old invoice row keeps its kind label.

**Compatibility and release order.** The shop is released first, the backend removes the routes and fields afterwards, and the
shop then regenerates `lib/api/schema.gen.ts` (`npm run gen:api`, from the backend's OpenAPI). The shop works against the
backend before and after the removal: it calls none of the retired routes, reads none of the retired fields and ignores what an
older backend still sends. Until the regeneration `schema.gen.ts` still lists the retired routes and fields; nothing reads them.
`docs/BACKEND-NEEDS.md` items 20 to 32 say what the backend removal must respect.

**After the regeneration.** These parts only bridge the window before the backend removal and go then:
- `lib/api/types.ts`: `NotificationPreferences` becomes the generated type again; `Ticket` drops `"canRate" | "csatScore"`
  from its `Omit`.
- `components/merchant-settings/notifications-form.tsx` and its test: the optional `telegram` of `EventState` and `EventRow`,
  the two branches of `toEventMap` and `changedEventRows`, and the "older API" tests; the saved-row assertion of
  `e2e/merchant-account.spec.ts` can become `toEqual`.
- The "older backend" tests of the ticket code (the rating keys, `ticket.typing`).
- `newKeyBody` (`components/merchant-settings/api-keys-manager.tsx`) stops sending `scopes` once the API no longer asks for it.

**Consequences.** Three pages and six components fewer; the merchant navigation lists no Referrals or Webhooks entry; an API key
is only a Dhru credential. The redirects are in `next.config.ts`; `PROGRESS.md` records the change.
