# 010 Cancel and Verify are visible in the orders list, and the order page says why and until when

**Context.** On 2026-11-27 the owner switched "Send For Verification" and "User Can Cancel Order" on for a service, placed orders as a
merchant and concluded that the website had neither feature. Both existed, but only inside the Actions card of the order's own page,
which said only "No actions are available for this order." when a button was missing. The orders list had no action at all. The
backend (decision 075, released before this change is deployed) now sends four more keys on every merchant order, list row and detail:
`cancelUntil` (ISO time, set only while the order can be cancelled and waits in its 2-minute cancel window), `cancelBlocked`
(`closed`, `not_allowed`, `already_sent`, `in_progress`, null exactly when `canCancel`), `verifyUntil` (ISO time, set only while
verification can be asked) and `verifyBlocked` (`already_requested`, `not_allowed`, `not_completed`, `window_passed`, null exactly when
`canVerify`). Only a merchant rank has these actions; retail accounts are unchanged.

**Decision.**

1. **The orders list has a last column "Actions"** (`MerchantOrdersTable`): a small "Cancel" button where `canCancel`, a small "Verify"
   button where `canVerify`, an em dash otherwise. Both do exactly what the order page's buttons do, through one flow
   (`runOrderAction`, `lib/merchant/order-actions.ts`): Cancel keeps its confirmation modal (its title names the order, "Cancel order
   #42?"); success is a toast and `router.refresh()`; the stale-state codes (ORDER_NOT_OPEN, ALREADY_SENT, INVALID_TRANSITION,
   ORDER_NOT_COMPLETED) refresh too; a signed-out or rank answer is left to `leaveIfSignedOut`. A failed Verify in a row is a toast (a
   row has no room for a message); a failed Cancel shows inside its modal, as on the page. The table stays a server component; only
   the cell is a client component (`OrderRowActions`), and the data is still loaded on the server.
2. **On phones** the buttons take a line of their own in the row card. `Table` gets a phone slot `actions` (`order-6`, `basis-full`,
   `relative z-10`): the z-index lifts the buttons over the stretched `::after` of the number link, so the whole-row link still works
   and the buttons stay clickable. A row without an action uses the slot `hide`.
3. **The order page's Actions card says why and until when**, from sentences worked out on the server (`orderActionNotes`) and passed
   to the card: Cancel there with a deadline: "You can cancel until {time of day with seconds and zone}. After that the order is sent
   for processing." (new `formatTime` in `lib/format`); Cancel missing: `not_allowed`, `already_sent` and `in_progress` have their
   sentence, `closed` has none; Verify there with a deadline: "You can ask for verification until {date and time}."; Verify missing:
   `not_completed` and `window_passed` have their sentence, `not_allowed` and `already_requested` have none (the Verification card
   already shows a request). "No actions are available for this order." stays only when there is no button and no sentence. The flags
   win over the reasons: a button that is there never gets a reason, and a deadline that is not a readable time is not printed.
4. **An open order's page keeps itself fresh** (`OrderRefresher`, `lib/merchant/order-refresh.ts`): while the status is neither
   completed nor rejected it calls `router.refresh()` every 30 seconds while the tab is visible, so "Request verification" appears after
   the order completes without a reload. It also refreshes once when the cancel window ends (2 seconds after `cancelUntil`, because
   the API sends the order at that moment; at once for a deadline that has passed already). No refresh runs while a modal of the
   page is open or a request is running: the buttons hold the refreshes (`holdOrderRefresh`, a counter). A skipped deadline refresh is
   not repeated: the next 30-second poll, or the answer to the visitor's own request, catches the page up.
5. **Unknown keys.** The four keys are optional in the hand-written types (`OrderActionHints` in `lib/api/types.ts`, joined to
   `MerchantOrder` and `MerchantOrderDetail` with an `Omit`), so the code compiles before and after `schema.gen.ts` is regenerated. A
   missing key is "unknown": no sentence, and the page shows what it showed before.

**Consequences.** New: `lib/merchant/order-actions.ts`, `lib/merchant/order-refresh.ts`, `components/merchant/order-refresher.tsx`;
`components/merchant/order-actions.tsx` now holds `OrderActions` (the card) and `OrderRowActions` (the row). `MerchantOrdersTable` needs
the router and the error texts, so a test draws it inside `ErrorTextProvider` with `next/navigation` mocked. Messages: `order.cancelUntilNote`
and six more, `orders.columns.actions` and `orders.actions.*`. The Omit in `lib/api/types.ts` can go once the generated types carry the keys.

**Release order.** The backend first. Against an older API the list still gets its buttons (from `canCancel` / `canVerify`) and the page
its 30-second refresh, but no sentence about deadlines or reasons.
