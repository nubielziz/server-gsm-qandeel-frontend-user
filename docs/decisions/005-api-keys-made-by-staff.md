# 005 API keys are made by staff

**Context.** On 2026-11-24 the owner decided that merchants no longer create, change or revoke their own API keys: the team makes
every key in the admin console (an Owner creates one; staff change its limits and allowed addresses, and revoke it). The backend
retires `POST /client/api-keys`, `PATCH /client/api-keys/:id` and `DELETE /client/api-keys/:id` (backend decision 067);
`GET /client/api-keys` stays. Keys that merchants made before keep working until staff revoke them.

**Decision.**

1. **The API keys page is read only** (`/en/account/settings/api-keys`, `components/merchant-settings/api-keys-list.tsx`, a Server
   Component). It lists the account's keys as before (live first with their allowed addresses, rate limit, last use, expiry and
   creation date; revoked ones as one dimmed line) and offers no way to create, edit or revoke a key, and no secret dialog.
2. **"Contact us"** stands in the section header: a WhatsApp chat with the team (`NEXT_PUBLIC_MERCHANT_WHATSAPP`,
   `lib/contact/whatsapp.ts`) with a typed message that names the account's username, opened in a new tab; without a number in the
   build it opens the support page. The empty state says the team creates keys. The help block keeps the Dhru details (username,
   access key, base URL) and now says to contact the team at once when a key may have leaked, since the merchant cannot revoke it.
3. **Gone:** the create, edit and revoke dialogs with their client component (`api-keys-manager.tsx` and its test of
   `newKeyBody` and `parseIps`), `secret-modal.tsx` (it had no other user), the "Made by support" badge (every new key is made by
   the team), the "{live} of {max} active keys" count, their messages, and the `ApiKeyCreated` type.
4. **e2e:** the create, edit and revoke test of the demo merchant becomes a read-only check; `e2e/merchant-account.spec.ts` shows a
   key staff made and proves the three retired routes answer 404 to a merchant session.

This supersedes the "Kept: API keys" line of decision 001 for everything but the list.
