# 004 One name per field: the shop's side

**Context.** Backend decision 065 gives every custom field of a service one Name (what a supplier receives), keeps a hidden key that
never changes (the answers of an order stay stored under it, and the forms keep sending them by it) and the label that buyers read, and
replaces the old rule "the field keyed `imei` is the IMEI" with a flag on the field, `isMainInput`. On an IMEI service the main-input
field is the IMEI box itself. This is the shop's side of it (a bare "decision 065" in this repository is a backend decision).

**Decision.**

1. **The merchant order page lists the answers by label.** `/en/account/orders/<id>` reads `answers` of `GET /client/orders/:id`
   (key, label, value): the label of the field as it is now (the key itself when the field was deleted) and the value that was given,
   as text. It used to humanize the stored keys. The type is the generated one; an order read without `answers` (an API that does not
   send them yet) shows an empty list instead of failing (`components/merchant/order-answers.tsx`). A value that runs over several
   lines keeps its line breaks, and the label and the value each follow their own text direction (`dir="auto"`): a supplier writes the
   labels and people type the values, in any script.
2. **No second IMEI box.** `GET /client/services/:id` (the order form of a merchant rank) and `GET /store/v1/services/:slug` (the shop
   checkout) leave the main-input field of an IMEI service out of `fields`. The shop therefore draws every field the API sends:
   `visibleFields` filters nothing, and no key (`imei` was one) is special any more.
3. **The hidden key stays hidden.** Nothing in the shop shows it or asks for it; `inputs` of an order are still sent by it.

**Consequences.** A merchant reads what it was asked ("Serial number: …") instead of a key, and nobody is asked for the IMEI twice.

**Release order.** The backend of decision 065 first. Against an older API the field keyed `imei` of an IMEI service still arrives in
`fields` and, as the form no longer hides it, a second IMEI box shows; an order read has no `answers`, so the page lists none.
`lib/api/schema.gen.ts` comes from that backend: the `api-types` check of CI, which compares it with the backend branch named in
`ci/backend-ref`, passes once that backend is on `main`.
