// The buttons and the sentences of an order (components/merchant/order-actions.tsx): the Actions card of the order's page for
// every reason a button is there or not, and the small buttons of a row of the orders list.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The buttons read the router from next/navigation and the error texts from the layout's provider.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }) }));

import { ErrorTextProvider } from "@/lib/i18n/error-text";
import { errors } from "@/lib/i18n/messages/errors";
import { merchant } from "@/lib/i18n/messages/merchant";
import { orderActionNotes, type OrderActionFacts } from "@/lib/merchant/order-actions";
import { OrderActions, OrderRowActions } from "./order-actions";

const t = merchant.order;

/** The card as the order's page draws it: the sentences are worked out from the facts, as the page does. */
const card = (facts: Partial<OrderActionFacts>) => {
  const all: OrderActionFacts = { canCancel: false, canVerify: false, ...facts };
  return renderToStaticMarkup(
    <ErrorTextProvider messages={errors}>
      <OrderActions orderId={42} canCancel={all.canCancel} canVerify={all.canVerify} notes={orderActionNotes(all, t)} labels={t} />
    </ErrorTextProvider>,
  );
};

const row = (canCancel: boolean, canVerify: boolean) =>
  renderToStaticMarkup(
    <ErrorTextProvider messages={errors}>
      <OrderRowActions orderId={42} canCancel={canCancel} canVerify={canVerify} labels={t} row={merchant.orders.actions} />
    </ErrorTextProvider>,
  );

const NO_ACTIONS = "No actions are available for this order.";

describe("OrderActions: Cancel", () => {
  it("shows the button and until when it can be used, with the time of day and the seconds", () => {
    const html = card({ canCancel: true, cancelBlocked: null, cancelUntil: "2026-11-27T17:45:12.000Z" });
    expect(html).toContain("Cancel order");
    expect(html).toMatch(/You can cancel until 5:45:12\sPM UTC\. After that the order is sent for processing\./);
    expect(html).not.toContain(NO_ACTIONS);
  });

  it("shows the button alone for a cancellable order without a deadline", () => {
    const html = card({ canCancel: true, cancelBlocked: null, cancelUntil: null });
    expect(html).toContain("Cancel order");
    expect(html).not.toContain("You can cancel until");
    expect(html).not.toContain(NO_ACTIONS);
  });

  it.each([
    ["not_allowed", "This service does not allow cancelling orders."],
    ["already_sent", "This order was already sent for processing, so it can no longer be cancelled. Contact support if something is wrong."],
    ["in_progress", "Our team is already working on this order."],
  ] as const)("says why there is no button when the reason is %s", (cancelBlocked, sentence) => {
    const html = card({ cancelBlocked });
    expect(html).toContain(sentence);
    expect(html).not.toContain("Cancel order");
    expect(html).not.toContain(NO_ACTIONS);
  });

  it("says nothing for a closed order, and keeps the old line", () => {
    const html = card({ cancelBlocked: "closed" });
    expect(html).toContain(NO_ACTIONS);
    expect(html).not.toContain("Cancel order");
  });
});

describe("OrderActions: Verify", () => {
  it("shows the button and until when verification can be asked, with the date and the time", () => {
    const html = card({ canVerify: true, verifyBlocked: null, verifyUntil: "2026-11-30T09:30:00.000Z" });
    expect(html).toContain("Request verification");
    expect(html).toMatch(/You can ask for verification until Nov 30, 2026, 9:30\sAM UTC\./);
    expect(html).not.toContain(NO_ACTIONS);
  });

  it.each([
    ["not_completed", "You can ask for verification once the order is completed."],
    ["window_passed", "The time to ask for verification has passed."],
  ] as const)("says why there is no button when the reason is %s", (verifyBlocked, sentence) => {
    const html = card({ verifyBlocked });
    expect(html).toContain(sentence);
    expect(html).not.toContain("Request verification");
    expect(html).not.toContain(NO_ACTIONS);
  });

  it.each(["not_allowed", "already_requested"] as const)("says nothing when the reason is %s, and keeps the old line", (verifyBlocked) => {
    const html = card({ verifyBlocked });
    expect(html).toContain(NO_ACTIONS);
    expect(html).not.toContain("ask for verification");
  });
});

describe("OrderActions: an older backend (the four keys are missing)", () => {
  it("shows exactly what the page showed before: the buttons the flags allow and no sentence", () => {
    const both = card({ canCancel: true, canVerify: true });
    expect(both).toContain("Cancel order");
    expect(both).toContain("Request verification");
    expect(both).not.toContain("You can cancel until");
    expect(both).not.toContain("until");
    expect(card({ canCancel: true })).not.toContain("Request verification");
  });

  it("says that no action is available when there is no button either", () => {
    const html = card({});
    expect(html).toContain(NO_ACTIONS);
    expect(html).not.toContain("Request verification");
    expect(html).not.toContain("Cancel order<");
  });
});

describe("OrderActions: both at once", () => {
  it("a completed order of a service with verify on and cancel off shows Verify and says why Cancel is not there", () => {
    const html = card({ canVerify: true, verifyUntil: "2026-11-30T09:30:00.000Z", cancelBlocked: "not_allowed" });
    expect(html).toContain("Request verification");
    expect(html).toContain("This service does not allow cancelling orders.");
    expect(html).not.toContain(NO_ACTIONS);
  });
});

describe("OrderRowActions: the small buttons of a list row", () => {
  it("draws a Cancel and a Verify button, each named after the order for a screen reader", () => {
    const html = row(true, true);
    expect(html).toContain('aria-label="Cancel order 42"');
    expect(html).toContain('aria-label="Verify order 42"');
    expect(html).toMatch(/>Cancel<\/span>/);
    expect(html).toMatch(/>Verify<\/span>/);
  });

  it("draws only the buttons the facts allow", () => {
    const cancelOnly = row(true, false);
    expect(cancelOnly).toContain('aria-label="Cancel order 42"');
    expect(cancelOnly).not.toContain("Verify order");
    const verifyOnly = row(false, true);
    expect(verifyOnly).toContain('aria-label="Verify order 42"');
    expect(verifyOnly).not.toContain("Cancel order");
  });

  it("keeps the confirmation of a cancel, closed, with the order's number in its title", () => {
    const html = row(true, false);
    expect(html).toContain("<dialog");
    expect(html).not.toMatch(/<dialog[^>]* open/);
    expect(html).toContain("Cancel order #42?");
    expect(html).toContain("The amount held for this order returns to your wallet. This cannot be undone.");
    expect(html).toContain("Keep the order");
    expect(html).toContain("Yes, cancel the order");
  });

  it("has no dialog when there is no Cancel", () => {
    expect(row(false, true)).not.toContain("<dialog");
  });
});
