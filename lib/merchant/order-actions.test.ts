// Cancel and Verify on an order (lib/merchant/order-actions.ts): the sentences next to the buttons, and what one press does.
import { beforeEach, describe, expect, it, vi } from "vitest";

// The press posts through the browser client and forgets the token of a signed-out visitor: stand-ins for both.
const client = vi.hoisted(() => ({ post: vi.fn<(path: string, body?: unknown) => Promise<unknown>>(async () => undefined), forget: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({ api: { post: client.post }, forgetCsrf: client.forget }));

import { ApiError } from "@/lib/api/errors";
import { merchant } from "@/lib/i18n/messages/merchant";
import { orderActionNotes, runOrderAction, type OrderActionFacts } from "./order-actions";

const t = merchant.order;
const none = { cancel: null, verify: null };

const facts = (over: Partial<OrderActionFacts> = {}): OrderActionFacts => ({ canCancel: false, canVerify: false, ...over });

describe("orderActionNotes: Cancel", () => {
  it("says until when an order that waits in its cancel window can be cancelled, as a time with seconds", () => {
    const notes = orderActionNotes(facts({ canCancel: true, cancelBlocked: null, cancelUntil: "2026-11-27T17:45:12.000Z" }), t);
    expect(notes.cancel).toMatch(/^You can cancel until 5:45:12\sPM UTC\. After that the order is sent for processing\.$/);
    expect(notes.verify).toBeNull();
  });

  it("says nothing for a cancellable order that has no deadline (a manual one)", () => {
    expect(orderActionNotes(facts({ canCancel: true, cancelBlocked: null, cancelUntil: null }), t)).toEqual(none);
  });

  it("gives each reason its own sentence", () => {
    const reason = (cancelBlocked: NonNullable<OrderActionFacts["cancelBlocked"]>) => orderActionNotes(facts({ cancelBlocked }), t).cancel;
    expect(reason("not_allowed")).toBe("This service does not allow cancelling orders.");
    expect(reason("already_sent")).toBe(
      "This order was already sent for processing, so it can no longer be cancelled. Contact support if something is wrong.",
    );
    expect(reason("in_progress")).toBe("Our team is already working on this order.");
  });

  it("says nothing for a closed order", () => {
    expect(orderActionNotes(facts({ cancelBlocked: "closed" }), t)).toEqual(none);
  });

  it("treats a missing key (an older backend) as unknown: no sentence, the page shows what it showed before", () => {
    expect(orderActionNotes(facts(), t)).toEqual(none);
    expect(orderActionNotes(facts({ canCancel: true }), t)).toEqual(none);
    expect(orderActionNotes(facts({ cancelBlocked: null, verifyBlocked: null }), t)).toEqual(none);
  });

  it("lets a button that is there win over a reason, and never prints a deadline it cannot read as a time", () => {
    expect(orderActionNotes(facts({ canCancel: true, cancelBlocked: "already_sent" }), t).cancel).toBeNull();
    expect(orderActionNotes(facts({ canCancel: true, cancelUntil: "soon" }), t).cancel).toBeNull();
  });
});

describe("orderActionNotes: Verify", () => {
  it("says until when verification can be asked, with the date and the time", () => {
    const notes = orderActionNotes(facts({ canVerify: true, verifyBlocked: null, verifyUntil: "2026-11-30T09:30:00.000Z" }), t);
    expect(notes.verify).toMatch(/^You can ask for verification until Nov 30, 2026, 9:30\sAM UTC\.$/);
    expect(notes.cancel).toBeNull();
  });

  it("says nothing for a verify that has no deadline", () => {
    expect(orderActionNotes(facts({ canVerify: true, verifyUntil: null }), t).verify).toBeNull();
  });

  it("explains `not_completed` and `window_passed`", () => {
    const reason = (verifyBlocked: NonNullable<OrderActionFacts["verifyBlocked"]>) => orderActionNotes(facts({ verifyBlocked }), t).verify;
    expect(reason("not_completed")).toBe("You can ask for verification once the order is completed.");
    expect(reason("window_passed")).toBe("The time to ask for verification has passed.");
  });

  it("says nothing for `not_allowed` and `already_requested` (the Verification card shows a request)", () => {
    expect(orderActionNotes(facts({ verifyBlocked: "not_allowed" }), t)).toEqual(none);
    expect(orderActionNotes(facts({ verifyBlocked: "already_requested" }), t)).toEqual(none);
  });

  it("the two sentences are independent: a processing order of a service with verify on and cancel off says both", () => {
    const notes = orderActionNotes(facts({ cancelBlocked: "not_allowed", verifyBlocked: "not_completed" }), t);
    expect(notes).toEqual({
      cancel: "This service does not allow cancelling orders.",
      verify: "You can ask for verification once the order is completed.",
    });
  });
});

const deps = () => ({
  router: { refresh: vi.fn() },
  errorMessage: vi.fn((e: unknown) => `text for ${e instanceof ApiError ? e.code : "?"}`),
  notify: vi.fn(),
  labels: t,
});

beforeEach(() => {
  client.post.mockReset();
  client.post.mockResolvedValue(undefined);
  client.forget.mockReset();
});

describe("runOrderAction: one press", () => {
  it("posts the cancel of the order with an empty body, thanks with a toast and refreshes", async () => {
    const d = deps();
    expect(await runOrderAction("cancel", 42, d)).toEqual({ ok: true });
    expect(client.post).toHaveBeenCalledTimes(1);
    expect(client.post).toHaveBeenCalledWith("/client/orders/42/cancel", {});
    expect(d.notify).toHaveBeenCalledWith("Order cancelled", "The amount was returned to your wallet.");
    expect(d.router.refresh).toHaveBeenCalledTimes(1);
  });

  it("posts the verification of the order the same way, with its own toast", async () => {
    const d = deps();
    expect(await runOrderAction("verify", 7, d)).toEqual({ ok: true });
    expect(client.post).toHaveBeenCalledWith("/client/orders/7/verify", {});
    expect(d.notify).toHaveBeenCalledWith("Verification requested");
    expect(d.router.refresh).toHaveBeenCalledTimes(1);
  });

  it.each(["ORDER_NOT_OPEN", "ALREADY_SENT", "INVALID_TRANSITION", "ORDER_NOT_COMPLETED"])(
    "refreshes on the stale answer %s (the order moved on, its buttons go) and still reports the error",
    async (code) => {
      client.post.mockRejectedValueOnce(new ApiError({ status: 409, code }));
      const d = deps();
      expect(await runOrderAction("cancel", 42, d)).toEqual({ ok: false, message: `text for ${code}` });
      expect(d.router.refresh).toHaveBeenCalledTimes(1);
      expect(d.notify).not.toHaveBeenCalled();
    },
  );

  it("reports another failure without a refresh and without a toast", async () => {
    client.post.mockRejectedValueOnce(new ApiError({ status: 500, code: "INTERNAL_ERROR" }));
    const d = deps();
    expect(await runOrderAction("verify", 7, d)).toEqual({ ok: false, message: "text for INTERNAL_ERROR" });
    expect(d.router.refresh).not.toHaveBeenCalled();
    expect(d.notify).not.toHaveBeenCalled();
  });

  it("a signed-out answer forgets the token, refreshes once and has no message to show", async () => {
    client.post.mockRejectedValueOnce(new ApiError({ status: 401, code: "UNAUTHORIZED" }));
    const d = deps();
    expect(await runOrderAction("cancel", 42, d)).toEqual({ ok: false, message: null });
    expect(client.forget).toHaveBeenCalledTimes(1);
    expect(d.router.refresh).toHaveBeenCalledTimes(1);
    expect(d.errorMessage).not.toHaveBeenCalled();
  });

  it("a rank refusal refreshes once, keeps the token and has no message to show", async () => {
    client.post.mockRejectedValueOnce(new ApiError({ status: 403, code: "RANK_NOT_ALLOWED" }));
    const d = deps();
    expect(await runOrderAction("verify", 7, d)).toEqual({ ok: false, message: null });
    expect(client.forget).not.toHaveBeenCalled();
    expect(d.router.refresh).toHaveBeenCalledTimes(1);
  });
});
