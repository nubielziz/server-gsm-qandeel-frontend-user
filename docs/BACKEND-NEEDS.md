# Backend changes the storefront needs

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
