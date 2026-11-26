# 007 Order forms draw only the service's fields

> Items 2 (the forced IMEI box) and 3 (the "can't be ordered" notice) are replaced by decision 008: an IMEI is a field type.

**Context.** On 2026-11-26 the owner ruled that an order form draws only the custom fields of the service. Until then two forms
added inputs of their own when a service's type is `imei`: the shop checkout (an "IMEI number" box, sent as `imei`) and the order
form of a merchant rank (a switch "One IMEI / Several IMEIs", an IMEI box and a bulk "IMEI list" of up to 100, sent as `imei` or
`imeis`). Decision 004 had the API leave the IMEI's own field out of `fields` so that nobody was asked twice. The backend now does
the opposite (its change of the same date): `GET /store/v1/services/:slug` and `GET /client/services/:id` list every custom field,
the main input of an IMEI service included, and each field carries `isMainInput`. Placement reads the IMEI from
`inputs[<key of the isMainInput field>]` and reports its problems (`required`, `invalid_imei`, `pattern`) on `inputs.<key>`; the
error code `INVALID_IMEI` stays.

**Decision.**

1. **Every field is drawn, the IMEI's included.** Both forms draw `fields` as the API sends them. There is no built-in IMEI box, no
   mode switch and no bulk list: `components/checkout/checkout-form.tsx` and `components/merchant/order-form.tsx` hold none. Both
   draw the fields in the service's own order, the IMEI's where the service puts it (in the merchant form after the quantity, as
   every field was; in the shop's drawer before it). `visibleFields`, which filtered nothing since decision 004, is gone.
2. **The main input is an input like any other, with the IMEI's checks.** On an IMEI service the field flagged `isMainInput` is a
   numeric box (any key, any label: its own label names it, also in the shop's summary line, which stays masked). It is always
   required. The form checks it before sending (15 digits and the check digit, with the messages the forms already had; the merchant
   form also keeps its "valid / not valid" hint) and sends it normalised, digits only (spaces and dashes removed, Arabic-Indic and
   Persian digits read as Latin ones), under `inputs[<its key>]`. `imei` and `imeis` are never sent.
3. **No field, no order.** An IMEI service that lists no `isMainInput` field cannot be ordered: the form shows "This service can't be
   ordered right now. Please contact support." with a link to support, keeps its button off and points that button at the notice
   (`aria-describedby`); in the shop the drawer is not offered either. Nothing is sent.
4. **A server error is never lost.** A problem of the IMEI arrives on `inputs.<key>` and lands on its box. An error on a path the form
   draws no box for (`imei` or `imeis` of an older API, `body`, an `inputs.<key>` the service no longer lists, which the backend
   answers `unknown_field` when staff remove or rename a field while the page is open, a `fileId` on a service that takes no file)
   is the message of the whole form: the shop's checkout alert (`lib/checkout/field-errors.ts`), the merchant form's banner. The
   merchant form maps errors against the keys it really draws (`mapOrderFieldErrors`) and shows the first such message also when
   other errors sit on boxes; it used to answer with "check the highlighted fields" and nothing highlighted.
5. **Bulk ordering leaves the shop.** The list, its per-line problems, its limit of 100 and the link to the orders list after a bulk
   order are gone. One request places one order; the form leads to that order's page, and the total is the price times the quantity.
   The Idempotency-Key rules do not change: one key per body, the IMEI now being one of the inputs of that body.

**Consequences.** What a buyer is asked is what the service lists, in one rule for every type; staff name the IMEI's box (its label, its pattern,
which field is the main input) in the console like any other field. A merchant who ordered in bulk orders one at a time here
(`imeis` is the backend's to keep or retire). Decision 004 item 2 ("the API leaves the main input out") no longer holds; its other
items do. `lib/format` gains `imeiProblem`; `lib/merchant/order-input.ts` loses `parseImeiLines`, `summarizeImeiLines`,
`MAX_BULK_IMEIS`, `ImeiLine`, `visibleFields` and the `imeis.N` mapping, and gains `mainInputOf` and `checkMainInput`. The e2e specs read the IMEI
field of a service from the API (`imeiBox` in `e2e/helpers.ts`), so none names its key or label; the demo data must give every
IMEI service a main-input field.

**Release order.** The backend first. Against an older API the main input of an IMEI service is not in `fields` and no field has
`isMainInput`, so every IMEI service shows the notice of item 3 and cannot be ordered until the backend is live. `isMainInput` was
added to `lib/api/schema.gen.ts` by hand; the `api-types` check of CI, which compares that file with the backend branch named in
`ci/backend-ref`, passes once the generated file carries it.
