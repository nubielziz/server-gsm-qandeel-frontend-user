# 011 Sign-up collects the full details; a link signs in, it no longer creates an account

**Context.** On 2026-11-27 the owner ordered: "Account creation must collect the full required info": email, password, first name, last
name, country and phone number, all required. Until now the sign-up page asked for an email only and the emailed link created the
account on first use. The backend (decision 079, released before this change is deployed) adds `POST /store/v1/auth/sign-up` (public,
Turnstile, the CSRF handling of the other sign-in routes) with the body `{ email, password, firstName, lastName, country, phone }`
(names 1 to 60 characters, the first name, a space and the last name together at most 120, a two-letter country, a phone of an optional
leading + and 7 to 15 digits). It answers 204 for every valid body, whether or not the address has an account; a 422 names the field.
`POST /store/v1/auth/magic-link` no longer creates accounts: an address with no account is mailed a note with the sign-up address.

An attack review of the first round (2026-11-27) changed two things, and the backend followed (its decision 079, fix round J):

- **The link decides by the browser that opens it.** Opened in the browser that sent the form (it holds the asking-browser cookie) the
  link makes the account and applies the details AND the password: `passwordSet: true`. Opened in any other browser (phone mail apps
  open links in their own, so this will be common) the account is made and signed in with NOTHING applied, because a stranger could have
  typed any name, phone, country or password for this address: the answer is `passwordSet: false` with `pendingDetails` (the four
  details as typed, never the password), for the person who proved the mailbox to confirm or correct. When a login account already
  existed, the link is a plain sign-in: neither key.
- **A new route, `POST /store/v1/auth/sign-up/finish`**, for the signed-in account that has no password yet: body `{ firstName,
  lastName, country, phone, password }` with the rules of sign-up (session and CSRF like the other session routes; 409 when the account
  already has a password). It sets the details and the password and answers the account's own view.

**Decision.**

1. **The sign-up page is one form**: First name and Last name (side by side from `sm`), Email, Phone, Country (a menu), Password (the
   show/hide control and the rules text of the set-password form), the Turnstile box and "Create account". Autocomplete: `given-name`,
   `family-name`, `email`, `tel`, `country`, `new-password`. The links to Sign in and to Become a merchant stay. The page stays static:
   the form sits behind `<Suspense>` with a same-size skeleton (`SignUpSlot`, cached shared data, no session).
2. **The countries** (the sign-up form, the finish form and the merchant form, one list: `readShopCountries`) are the shop's tax-rate
   countries (`GET /store/v1/config`, `shopCountryOptions`) when the shop has any, else every country of `lib/countries.ts`, which is what
   the server accepts: while some tax window is in force it takes only their countries, and when none is in force it takes any code of the
   ISO list (production has no tax rate today, so the menu is the full list there). If the config cannot be read the full list is offered,
   so a form never fails to draw because of it (the server still judges the country, on its field). The three forms sit behind `<Suspense>`
   with a skeleton of their own size (`SignUpSlot`, `SignInSlot`, `MerchantApplySlot`).
3. **Client checks mirror the server's** (`components/auth/sign-up-fields.ts`, unit tested; the server stays the judge): everything is
   required; a name is 1 to 60 characters (counted in code points, as the server counts) once trimmed; the first name, a space and the last
   name together are at most 120 (the sentence sits under the last name); the invisible direction marks (U+200E, U+200F, U+202A to U+202E,
   U+2066 to U+2069) that a pasted name or number carries are dropped before the check and the send, because the server refuses them; the
   email has something before and after an @; the phone is an optional + and 7 to 15 digits once spaces, dashes, dots and brackets are
   removed (**Arabic-Indic and Persian digits become Latin ones before anything is sent**, as in the IMEI boxes; the cleaned number is what
   is sent); the country is one of the menu's; the password is 10 to 128 characters with at least 5 different ones (not trimmed). A failing
   form sends nothing and does not use up the Turnstile token.
4. **The server's field errors sit under their fields** (`feedbackFrom` with overrides, so a 422 reads like the form's own checks) and the
   focus goes to the first one. `password` keeps the policy's own text for `WEAK_PASSWORD`. A 429 or a network failure is the form's message
   with the wait and the request id. After a 204 the password leaves the page's state.
5. **After a 204** the page shows the neutral "check your email" state (it never says whether the address has an account) with one more
   line: "Open the link on this device to finish at once. On another device you will be asked to confirm your details."
6. **The confirm page** (`LinkConfirm`) reads the answer of `POST /store/v1/auth/verify`:
   - `passwordSet: true`: nothing extra (everything was applied; as built). Neither key: an ordinary sign-in.
   - `pendingDetails` with `passwordSet` not true: the page stops after the exchange (above, the lines it always shows: the orders added,
     and "You are signed in as da•••@example.com" with "Not you? Sign out", which matters most here: the details may be a stranger's) and shows
     **"Finish creating your account"**: one line, "Check these details. If they are not yours, change them.", the four details prefilled
     and editable (a country the menu no longer offers starts on its prompt), and an empty Password box with the usual rules. The submit sends
     `POST /store/v1/auth/sign-up/finish` `{ firstName, lastName, country, phone, password }` through the browser client (the session's CSRF
     token, no Turnstile), the checks are the sign-up ones, the field errors sit under the fields, and on success the page goes where it goes
     after a normal sign-in. A 409 (the account already has a password: finished in another tab) says so and offers "Continue". The password
     leaves the state when it was sent. `passwordSet: false` with no (or malformed) details asks for nothing: the page never invents values.
   - The first round's notice that sent the person to the security settings is gone.
   The two keys and the new route are typed by hand (`LinkExchangeAnswer`, `PendingDetails`, `SignUpFinishInput`, `ACCOUNT_ROUTES.signUpFinish`);
   `schema.gen.ts` is not edited, so the code compiles before and after it carries them.
7. **Sign in**: the words no longer say that an emailed link creates an account. The email-link step says "It works for an account you
   already have."; the line under the form is "New here? Create an account", pointing to sign-up. The checkout's signed-out card ("Sign in or
   create an account to continue") gets a second button, "Create an account", that points to the sign-up page. The sign-in mechanics are unchanged.
8. **Become a merchant** has a short form (first name, last name, email, phone, country; no password) above its WhatsApp button; the form is
   checked like the sign-up one (`checkDetails`). The button opens the chat in a new tab with the existing sentence followed by one line per
   detail; a blocked pop-up falls back to the same tab. Nothing is sent to our API and nothing is kept. The countries are the list of item 2.
9. **The password must never reach a URL** (review B3). Every form here is server-rendered, and a server-rendered `<form>` with no method
   that is submitted before its script has loaded sends a GET to its own address with every named field in the query string: the password
   would land in the address bar, the history, the logs of the servers and proxies on the way and the Referer of the next page. So each
   form that holds a password, a code or personal data (1) says `method="post"` (a submit the script does not catch carries a body, never a
   query) and (2) keeps its submit button disabled until the component has mounted in the browser (`useMounted`, `lib/use-mounted.ts`:
   `useSyncExternalStore` with a server snapshot of false; a disabled default button also blocks the Enter key). Forms checked:
   - **Changed (post + disabled until mounted):** sign-up, finish-your-account, the merchant application, sign-in (the password form and
     the forced new-password form), the email sign-in link form, forgot password, set password, the two-step code form, the account's change
     password, profile and preferences forms, the three support forms (a visitor's new ticket, a signed-in new ticket, a ticket reply), and
     the order, top-up and receipt forms of the wallet and of a merchant rank (the order form's boxes are named `inputs.<key>`, so an IMEI or
     an account detail typed there would have travelled in the address too).
   - **Changed (post only), because their button is already off until the script runs:** the checkout form (its button waits for the
     Turnstile token), the merchant profile and notification forms (their button waits for a change), and the two two-step set-up forms (they
     are drawn only after a click).
   - **Left as they are, with the reason:** every search and filter form (`SearchInput`, the list toolbars and filters, the merchant filter
     form, the statement range form) is a GET on purpose and holds no personal data; the checkout drawer's form is `method="dialog"` (a press
     before hydration only closes the drawer instead of a GET); the unsubscribe form carries the token of its own link, which is already in the
     address by design (and a POST there would drop nothing: the page's own query stays); the track form takes a tracking token and goes to its
     page by a script navigation.
   `components/forms-before-script.test.tsx` renders each changed form on the server and asserts `method="post"`, no `action`, and a disabled
   submit button.

**Consequences.** New: `components/auth/sign-up-fields.ts`, `sign-up-form.tsx`, `sign-up-slot.tsx`, `sign-in-slot.tsx`,
`merchant-apply-slot.tsx`, `shop-countries.ts`, `sign-up-skeleton.tsx`, `details-fields.tsx` (the inputs the forms share; `hideEmail` for
the finish form), `finish-account-form.tsx`, `pending-details.ts`, `merchant-apply.ts`, `merchant-apply-form.tsx`; `shopCountryOptions` in
`lib/countries.ts`; `useMounted`; `ACCOUNT_ROUTES.signUp` and `signUpFinish`; `requestSignUp` and `finishSignUp`. `LinkOutcome` lost its
password notice and `LinkNotices` was split out. `MerchantWhatsAppActions` is the submit button and the number (no link) and takes `disabled`.
`MagicLinkForm` stays for the sign-in step only. Messages: `auth.fields`, `auth.signUp.errors` (with `nameTogether`), `auth.signUp.form.sentDevice`,
`auth.signIn.finish`, `auth.becomeMerchant.detailsNote`, `checkout.start.signUpAction`.

**e2e.** `signUpByLink` (`e2e/helpers.ts`) now fills the sign-up call, reads the mail and opens the link through the same browser context, so
the account has its password and details; `signUpInAnotherBrowser` sends the form from a request context of its own and opens the link through
the page (no password, nothing applied; used where a spec needs an account with no password); `openAnotherBrowser` is a second context. The
sign-in-link specs of `e2e/auth.spec.ts` take an address that has an account (`freshAccount`), because a link no longer makes one; new specs
cover the sign-up in the same browser, the other-browser path that fills the finish form, and the note an unknown address gets. They typecheck
and lint but were NOT run: there is no stack in the worktree where they were written, so the lead runs them against the isolated backend once
the backend is merged.

**Release order.** The backend first (decision 079, both rounds): this page posts to routes older backends do not have, and the finish form
needs `pendingDetails` and `sign-up/finish`.
