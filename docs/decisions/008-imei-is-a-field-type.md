# 008 An IMEI is a field type, not a rule of the service type

**Context.** On 2026-11-26 the owner ruled that the shop must not force an IMEI on an IMEI service: every field is drawn and
checked by its own type and its own Required tick. Decision 007 had the forms hang the IMEI's behaviour on two facts together,
"the service type is `imei`" and "the field is flagged `isMainInput`". The backend (change of the same date) gives custom fields a
fifth field type, the string `imei`, beside `text`, `number`, `select` and `textarea`. A field of type `imei` holds one IMEI: the value is
read as digits (spaces and dashes removed) and must be 15 digits with a valid Luhn check digit; a problem is reported on
`inputs.<key>` with code `invalid_imei` (the response's error code stays `INVALID_IMEI`, 422). The service type `imei` no longer forces
anything.

**Decision.** This replaces the parts of 007 about the forced box (item 2) and about the notice (item 3). The rest of 007 stands
(every field is drawn, a server error is never lost, no bulk ordering).

1. **A field is drawn by its `fieldType`, wherever it is and whatever the service type.** `text`, `number`, `select` and `textarea` as
   before. `imei` is a one-line numeric box (`inputMode="numeric"`, `autoComplete="off"`, `dir="ltr"`) with the existing IMEI hint.
2. **Required follows `field.required` for every field.** There is no "always required" for the IMEI.
3. **The local check of an `imei` field:** empty (spaces and dashes only count as empty) follows the field's Required tick like any
   field; otherwise the value must be 15 digits with a valid check digit, with the messages the forms already had. The merchant
   form keeps its live "valid / not valid" hint for such a field. The value is sent as digits only under `inputs[<key>]`; an empty
   field is left out. `imei` and `imeis` are still never sent.
4. **No notice, no disabled button.** "This service can't be ordered right now" is gone, with its button rule and its `isImei` prop.
   A service is ordered with whatever fields it has; with none, the form asks nothing, as a server service without fields does.
5. **The summary line** of the shop's checkout shows the field flagged `isMainInput` once it has a value, on any service type: an
   `imei` field masked to its last four digits, any other type as typed (spaces collapsed, cut at 40 characters).
6. **Server errors keep decision 007's rules:** an error on a drawn `inputs.<key>` goes under the field (`invalid_imei` uses the
   existing message), anything else is the message of the whole form.

**Consequences.** `lib/merchant/order-input.ts` loses `mainInputOf`, `checkMainInput` and the `mainKey` argument of `buildInputs`;
`checkField` handles the `imei` type. `OrderFormHrefs` loses `support`. `lib/checkout/field-check.ts` holds the shop's pure rules
(`fieldProblem`, `sentValue`, `summaryValue`); `maskImei` moves to `lib/format`. The messages `noMainInput` (both areas),
`form.contactSupport` and `form.imeiRequired` of the merchant area are removed. The e2e helpers `imeiBox` and `merchantImeiBox`
find the field by type `imei`, else by `isMainInput`.

**Release order.** The backend first: against an older API no field has type `imei`, so an IMEI service's box is drawn as the
plain text field it is and nothing checks the check digit locally (the API still does). `fieldType: "imei"` was added by hand to
the two field unions of `lib/api/schema.gen.ts`; the lead regenerates the file.
