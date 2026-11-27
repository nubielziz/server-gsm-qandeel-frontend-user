# 009 Ten more field types, drawn and checked in the shop

**Context.** On 2026-11-27 the owner asked for new type checks on custom fields. The backend (decision 076) gives a field ten more
types beside `text`, `number`, `select`, `textarea` and `imei`: `imei_bulk`, `imeisv`, `serial`, `iccid`, `eid`, `meid`, `ecid`,
`mac_address`, `mi_lock_code` and `box_sn`. The server trims the sent value, reads it into a stored form and judges that form; a
problem is reported on `inputs.<key>` with its own code. This decision does for the ten what 008 did for `imei`: the two order forms
(the shop's checkout drawer and the merchant order form) draw each type with a fitting control and check the value before the
request with the same rules, so the buyer sees the problem at once. The server stays the authority, and its field errors still show
under the field.

**Decision.**

1. **One table drives both forms.** `lib/checkout/field-types.ts` holds one row per type: how a typed value is read into the
   server's stored form, the first problem of that form (the server's code), and the control (a one-line box, or a text area for
   `imei_bulk`, with `inputMode`, `autoCapitalize`, a `maxLength` with room for separators). The rows copy the server's
   `FIELD_TYPE_RULES` (the codes are `invalid_imei` for a line of a list, `too_many_imeis`, `duplicate_imei`, `invalid_imeisv`,
   `invalid_serial`, `invalid_iccid`, `invalid_eid`, `invalid_meid`, `invalid_ecid`, `invalid_mac_address`,
   `invalid_mi_lock_code`, `invalid_box_sn`). `components/forms/typed-field.tsx` draws a field from the table for both forms
   (`Input` or `Textarea`, `spellCheck={false}`, `dir="ltr"`, `autoComplete="off"`, a hint line under the box, the form components'
   tokens only: it looks right in both themes). `imei` keeps its own code of 008.
2. **The same sentence as the server.** The text of a refusal is read by code from `lib/i18n/messages/errors.ts` (`fields`), for the
   local check and for a server error alike, so there is one wording. A problem on a line of a list has the line in its sentence ("Line
   3 is not a valid IMEI: each line must be 15 digits with a correct check digit."): the API's message starts with "Line N", and
   `lines` of the same file holds the two templates (`errorText.field` reads the line from the message; `errorText.line` takes it as an
   argument, for the local check). The merchant form's own `imeiBad` still words an `invalid_imei` that names no line (one `imei`
   field). The hint under each box (what to type) is in `lib/i18n/messages/field-types.ts`, shared by both namespaces.
3. **What is sent.** What was typed, trimmed; the server reads it into its stored form itself. Two things go further: Arabic-Indic and
   Persian digits are read as Latin ones (the API takes only Latin digits, and the IMEI box has always read them: group C), in the
   check and in the value sent; and a list of IMEIs goes out already in its stored form, one IMEI per line, because 30 IMEIs typed with
   spaces and commas can pass the 500 characters one value may have, and the server reads the stored form of a list as the same list.
   (Since the review fixes of backend decision 076 the API takes 2000 characters as typed and counts a list before it measures it, so
   this is no longer needed; it is kept, and so is the local check.)
   A field that holds nothing is left out, as before.
4. **`imei_bulk` is one order at one price.** A text area of six rows, the hint "One IMEI per line, up to 30.", a live count ("3
   IMEIs", in the danger colour above 30). Its check reports the first problem only, in the server's order: more than 30 items
   (`too_many_imeis`), then by line an item that is not a valid IMEI (`invalid_imei`) or that repeats an earlier one
   (`duplicate_imei`); a list with no item at all is line 1. It adds no quantity control and places no order per IMEI. As the
   main-input field it is shown on the summary line as its count, never as the numbers. After the checkout opens, the session's masked
   line of a list is the API's (backend decision 076: the first IMEI masked, then " +N more"); the session page lets it wrap on a phone
   (`wrap-anywhere` on its value, no new colour).
5. **Empty.** Empty follows the field's Required tick, as for every field. For these types, as on the server, only white space is
   empty: a box of dashes is a value that fails the type's rule (the `imei` box of 008 still counts spaces and dashes as empty).
6. **The merchant form** checks a field of these types with the field's own pattern last, matched against the stored form (the
   server's rule); the shop's drawer has no pattern.
7. **A type this code does not know** is drawn and checked as a plain text field, as 008 says; so a release that meets a newer API
   keeps working. The hand-written type layer (`lib/api/types.ts`) opens `fieldType` to any string for `StoreServiceDetail` and
   `MerchantServiceDetail`, so the code compiles with the generated union of today and with the one that lists the ten values.

**Consequences.** New: `lib/checkout/field-types.ts`, `components/forms/typed-field.tsx`, `lib/i18n/messages/field-types.ts`.
Changed: `lib/checkout/field-check.ts` (`fieldIssue`, `issueText`; `fieldProblem` and `sentValue` keep their meaning),
`lib/merchant/order-input.ts` (`checkFieldIssue`, `problemMessage`; `checkField` and `buildInputs` keep their meaning), both forms,
`lib/i18n/error-text-core.ts` (`line`, `errorLine`) and `messages/errors.ts`, `lib/format` (`latinDigits`, which `normalizeImei` now uses).
`lib/api/schema.gen.ts` is not touched: the lead regenerates it after the backend is merged.

**Release order.** The console first (staff can choose the types), then the backend, then the shop. Until the shop is released an
older page draws a field of one of these types as the plain text field it knows (008); the API judges it all the same.
