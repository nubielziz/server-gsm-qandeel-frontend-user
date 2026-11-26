# 003 Own prices in the shop

**Context.** Decision 002 gave an account of a merchant rank its own price list in the account area (`/en/account/services`,
with a CSV export) and its order form one page deeper (`/en/account/services/<id>`). The shop itself showed it the retail
prices, a "Your price" box on the service page, a home banner pointing to the price list, and a card that refused the shop
checkout. The owner's request: an account with a merchant rank should not have a separate price list or page in the account
area; it should use the shop like any buyer, with its own prices shown in place of the others. Backend decision 066 adds the
one read this needs.

**Decision.**

1. **The price list is retired.** It leaves every menu and link: the rail, the drawer and the phone tab bar (a merchant rank's
   tabs are now the retail rank's with its wallet: Overview, Orders, Wallet, Notifications, Support), the header search of the
   account area (it searches the shop's services for every rank), the avatar menu, the home banner and the "New order" buttons
   and empty states (they open the shop's services). `/account/services` (with and without `/en`) answers a permanent redirect to
   `/en/services` (a row of `lib/account/legacy-paths.ts`). The old order form address `/account/services/<id>` keeps a page that
   only redirects: to the service's checkout address when the service has a shop page, else to `/en/services` (the lookup is the
   cached public catalog, `slugForService`). `capabilitiesOf` has no `priceList` flag any more. The backend routes stay.
2. **Own prices in the normal shop: a personal layer in the browser.** The shop's pages, their HTML and every public read stay
   as they are: cached, shared, retail. Each place that draws the price of a service wraps it in a slot of the layer
   (`components/store/own-price.tsx`; the state and the reads are `lib/store/own-prices.ts`, mounted once in the shop layout as
   `OwnPricesLayer`):
   - **Who.** The readable CSRF cookie of the portal family is the only sign that a merchant session may exist. Without it (a guest,
     a retail account) every slot shows what the server drew, at once: nothing is read, nothing waits, no placeholder ever shows.
     With it, `GET /client/auth/me` (once per session) says whether the rank is a merchant one; any other answer shows the public
     prices. The cookie can outlive a session the server has ended (a rank change, a suspension): the API then answers 401 (or 403), the
     slots show the public prices at once and the rule that hides them (below) is lifted, so nobody is left on a placeholder. A read
     that fails some other way shows no price at all and is tried again later.
   - **What is read.** The service ids of the slots on the page, collected within one tick, are read together from
     `GET /client/services?ids=…` (at most 100 ids a request, sorted, each once; `_start=0&_end=<n>` so every row comes back). The
     read goes through the browser client (`no-store`, the session's own cookies) and is kept in memory for the tab only (five
     minutes, then a page that shows the price reads it again). A price never goes into anything cached or shared: no change in
     `lib/api/public.ts`, no cache tag, no server read. The API remembers every price it shows, so the price-change guard of an
     order keeps working. A new session (another cookie value) forgets everything read before; signing out shows the public prices.
   - **What shows.** Until its price arrives, a merchant rank sees a neutral placeholder of the same size, never the retail price.
     Then its own price, in the currency of its wallet and without the tax line, as its order form shows it (the service page and
     the quick view keep the notes: "per unit", "From", the packs). A service the API leaves out (not sold to the account, or no
     price for it) says "Not available for your account" and its buy action is off. A read that fails shows no price at all
     (a dash, with a line for screen readers) and tries again on a later page.
   - **Before hydration.** The server's HTML holds the retail prices. An inline script in the root layout runs before the first
     paint and marks `<html>` when the merchant cookie is there; `app/globals.css` then hides every price the server drew
     (marked by its slot) until the page is live. Guests and retail accounts have no such cookie, so nothing is hidden for them.
     When the account read says the cookie is a leftover, the browser takes the mark off `<html>` again (`liftOwnPricesGuard`).
   - **Where.** The cards (`ServiceCard`, `ServiceCardMini`: home featured, best sellers, new arrivals, the home list and
     `/services`), the rows of the home collections, the header search suggestions, the service page's price block and "Buy now",
     and the quick view's price block and "Buy now". The shop has no related-services list. Two prices sum up many services at their
     public prices: the hero's "Starting from" and a collection's "From". The account's own lowest price would need the whole catalog
     read, so these two are hidden from a merchant rank, not replaced by its own lowest price (the hero keeps the line's height).
   - **Known limits.** The price sort and the price filter of the lists (and the slider's span) keep using the public prices. The
     hero's "Starting from" and a collection's "From" are hidden from a merchant rank (above). With JavaScript off, nothing of the
     layer runs: a merchant rank sees the retail prices of the server's page (with their tax note), nothing is hidden or replaced,
     and ordering needs JavaScript here as everywhere in the shop; its order form shows the account's true price.
3. **Buying like everybody.** "Buy now" of the service page and the quick view, and a card's order link, go to the same checkout
   address for every buyer, `/checkout?service=<slug>`. For a merchant rank that page mounts its existing order form
   (`MerchantCheckout`: single orders, custom fields, file services, one Idempotency-Key per submission, the
   price-change guard; decision 007 took the list of IMEIs away), paid from the wallet through `POST /client/orders`; the retail form never mounts, so no checkout session is
   created. A file service, which the shop checkout does not sell, opens the order form for a merchant rank too (the service page
   and the quick view offer it "Buy now"); everybody else gets the notice to order it through support, which is also the
   boundary's fallback, so a guest sees it at once. The card that refused the checkout is gone from that page; the same notice
   stays where the shop's checkout still meets a merchant session (an open `/checkout/<token>` started before signing in, a
   403 `RANK_NOT_ALLOWED` to the retail form) and now leads to the order form at the checkout address. The refusal of a payment from
   the store balance (the same 403) points to the service page, not to another payment method: the pay step refuses a merchant rank
   whatever the method. Money does not change: the
   backend still refuses the retail checkout to a merchant rank and no ledger rule moves.
4. **The API addition.** `GET /client/services` takes `ids` (comma-separated positive ids, at most 100); the answer holds only those
   services, in the row shape of the list. The shop types the parameter itself (`OwnPricesQuery` in `lib/store/own-prices.ts`):
   `lib/api/schema.gen.ts` is regenerated from the backend's OpenAPI by the lead.

**Consequences.** One shop for every rank: a merchant rank browses, searches and buys where everybody does, at its own prices, and
the account area keeps only what an account owns (orders, wallet, invoices, settings). Guests and retail accounts get the same
HTML, the same reads and the same speed as before. The costs: a merchant rank pays one account read and one price read per page of
new services, and sees the price slots empty until the page is live on a full load (a leftover cookie of an ended session shows the
same flash, until the account read answers). Without JavaScript it sees the retail prices, not its own (see the known limits). A service
without a shop page can no longer be ordered on the website by a merchant rank (the API still serves it) until it is published.
The CSV export of prices leaves with the page. While the account is read on the checkout of a file service, a merchant rank sees
the support notice for a moment before its order form.

**Release order.** The backend of decision 066 first: a list route answers 422 to a query parameter it does not know, so without it
every price read of a merchant rank fails and its slots show no price (never the retail one). The old addresses keep working
whatever the order.
