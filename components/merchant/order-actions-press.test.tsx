// What pressing the buttons of an order does (components/merchant/order-actions.tsx). There is no DOM in these tests, so the
// state and the effects of React are a small stand-in (`rt`): a component is called as a function, the element tree it returns
// is read, and a button's `onClick` is called by hand, as the browser would after a click.
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Effect = { deps: readonly unknown[] | undefined; cleanup: (() => void) | undefined };
const rt = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  effects: [] as Effect[],
  effectCursor: 0,
  pending: [] as Array<{ index: number; run: () => unknown; deps: readonly unknown[] | undefined }>,
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: <T,>(initial: T) => {
    const index = rt.cursor++;
    if (!(index in rt.states)) rt.states[index] = initial;
    return [
      rt.states[index] as T,
      (next: T | ((previous: T) => T)) => {
        rt.states[index] = typeof next === "function" ? (next as (previous: T) => T)(rt.states[index] as T) : next;
      },
    ];
  },
  useEffect: (run: () => unknown, deps?: readonly unknown[]) => {
    rt.pending.push({ index: rt.effectCursor++, run, deps });
  },
}));

const fake = vi.hoisted(() => ({
  refresh: vi.fn(),
  post: vi.fn<(path: string, body?: unknown) => Promise<unknown>>(async () => undefined),
  forget: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: fake.refresh }) }));
vi.mock("@/lib/api/browser", () => ({ api: { post: fake.post }, forgetCsrf: fake.forget }));
vi.mock("@/lib/i18n/error-text", () => ({
  useErrorText: () => ({ message: (e: { code?: string }) => `Problem ${e.code}`, reference: () => "Ref 7" }),
}));
vi.mock("@/components/ui/toast", () => ({ toast: Object.assign(vi.fn(), { success: fake.success, error: fake.error }) }));

import { ApiError } from "@/lib/api/errors";
import { merchant } from "@/lib/i18n/messages/merchant";
import { orderRefreshHeld } from "@/lib/merchant/order-refresh";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { OrderActions, OrderRowActions } from "./order-actions";

const t = merchant.order;

type Node = ReactElement<Record<string, unknown>>;

/** Calls a component as React would for one render, then runs the effects whose inputs changed. */
function draw<P>(component: (props: P) => ReactNode, props: P): ReactNode {
  rt.cursor = 0;
  rt.effectCursor = 0;
  rt.pending = [];
  const tree = component(props);
  for (const { index, run, deps } of rt.pending) {
    const before = rt.effects[index];
    const same = before && deps && before.deps && deps.length === before.deps.length && deps.every((d, i) => Object.is(d, before.deps?.[i]));
    if (same) continue;
    before?.cleanup?.();
    const cleanup = run();
    rt.effects[index] = { deps, cleanup: typeof cleanup === "function" ? (cleanup as () => void) : undefined };
  }
  return tree;
}

/** Every element of a tree: the props are searched too (a modal's footer is a prop), and the confirmation is opened up. */
function elements(node: unknown, found: Node[] = []): Node[] {
  if (Array.isArray(node)) {
    for (const child of node) elements(child, found);
  } else if (isValidElement(node)) {
    const el = node as Node;
    found.push(el);
    if (typeof el.type === "function" && el.type.name === "CancelModal") elements((el.type as (props: unknown) => ReactNode)(el.props), found);
    for (const value of Object.values(el.props)) if (typeof value === "object" && value !== null) elements(value, found);
  }
  return found;
}

const buttons = (tree: ReactNode) => elements(tree).filter((el) => el.type === Button);
const buttonNamed = (tree: ReactNode, text: string): Node => {
  const found = buttons(tree).find((el) => el.props.children === text);
  if (!found) throw new Error(`no button "${text}"`);
  return found;
};
const modal = (tree: ReactNode): Node => elements(tree).find((el) => el.type === Modal) as Node;
const alerts = (tree: ReactNode) => elements(tree).filter((el) => el.type === Alert);
const press = (button: Node) => (button.props.onClick as () => Promise<void>)();

const ROW = merchant.orders.actions;
const row = (canCancel = true, canVerify = true) => draw(OrderRowActions, { orderId: 42, canCancel, canVerify, labels: t, row: ROW });
const card = (canCancel = true, canVerify = true) => draw(OrderActions, { orderId: 42, canCancel, canVerify, labels: t });

beforeEach(() => {
  rt.states = [];
  rt.effects = [];
  fake.refresh.mockClear();
  fake.forget.mockClear();
  fake.success.mockClear();
  fake.error.mockClear();
  fake.post.mockReset();
  fake.post.mockResolvedValue(undefined);
});
afterEach(() => {
  // The page goes away: every effect lets go.
  for (const effect of rt.effects) effect?.cleanup?.();
  expect(orderRefreshHeld()).toBe(false);
});

describe("a row of the list: Verify", () => {
  it("posts the verification, thanks with a toast and refreshes the page", async () => {
    await press(buttonNamed(row(), "Verify"));
    expect(fake.post).toHaveBeenCalledTimes(1);
    expect(fake.post).toHaveBeenCalledWith("/client/orders/42/verify", {});
    expect(fake.success).toHaveBeenCalledWith("Verification requested", undefined);
    expect(fake.refresh).toHaveBeenCalledTimes(1);
    expect(buttonNamed(row(), "Verify").props.loading).toBe(false);
  });

  it("shows the button as busy and holds the page's own refreshes while the request runs", async () => {
    let finish = () => {};
    fake.post.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
    const pressed = press(buttonNamed(row(), "Verify"));
    const busy = buttonNamed(row(), "Verify");
    expect(busy.props.loading).toBe(true);
    expect(busy.props["aria-label"]).toBe("Sending…");
    expect(orderRefreshHeld()).toBe(true);
    finish();
    await pressed;
    row();
    expect(orderRefreshHeld()).toBe(false);
  });

  it("a failure is a toast (a row has no room for a message), not a refresh", async () => {
    fake.post.mockRejectedValueOnce(new ApiError({ status: 500, code: "INTERNAL_ERROR" }));
    await press(buttonNamed(row(), "Verify"));
    expect(fake.error).toHaveBeenCalledWith("Problem INTERNAL_ERROR Ref 7");
    expect(fake.success).not.toHaveBeenCalled();
    expect(fake.refresh).not.toHaveBeenCalled();
  });

  it("an answer that says the order moved on shows the toast and refreshes, so the button goes", async () => {
    fake.post.mockRejectedValueOnce(new ApiError({ status: 409, code: "ORDER_NOT_COMPLETED" }));
    await press(buttonNamed(row(), "Verify"));
    expect(fake.error).toHaveBeenCalledWith("Problem ORDER_NOT_COMPLETED Ref 7");
    expect(fake.refresh).toHaveBeenCalledTimes(1);
  });

  it("a signed-out answer only refreshes: no toast, the page's own check sends the visitor away", async () => {
    fake.post.mockRejectedValueOnce(new ApiError({ status: 401, code: "UNAUTHORIZED" }));
    await press(buttonNamed(row(), "Verify"));
    expect(fake.refresh).toHaveBeenCalledTimes(1);
    expect(fake.forget).toHaveBeenCalledTimes(1);
    expect(fake.error).not.toHaveBeenCalled();
  });
});

describe("a row of the list: Cancel", () => {
  it("asks first: the button opens the confirmation and posts nothing, and the confirmation holds the page's refreshes", async () => {
    const closed = row();
    expect(modal(closed).props.open).toBe(false);
    expect(orderRefreshHeld()).toBe(false);
    await press(buttonNamed(closed, "Cancel"));
    const open = row();
    expect(modal(open).props.open).toBe(true);
    expect(modal(open).props.title).toBe("Cancel order #42?");
    expect(fake.post).not.toHaveBeenCalled();
    expect(orderRefreshHeld()).toBe(true);
  });

  it("keeping the order closes the confirmation and posts nothing", async () => {
    await press(buttonNamed(row(), "Cancel"));
    await press(buttonNamed(row(), "Keep the order"));
    expect(modal(row()).props.open).toBe(false);
    expect(fake.post).not.toHaveBeenCalled();
    expect(orderRefreshHeld()).toBe(false);
  });

  it("confirming posts the cancel, thanks with a toast, refreshes and closes the confirmation", async () => {
    await press(buttonNamed(row(), "Cancel"));
    await press(buttonNamed(row(), "Yes, cancel the order"));
    expect(fake.post).toHaveBeenCalledTimes(1);
    expect(fake.post).toHaveBeenCalledWith("/client/orders/42/cancel", {});
    expect(fake.success).toHaveBeenCalledWith("Order cancelled", "The amount was returned to your wallet.");
    expect(fake.refresh).toHaveBeenCalledTimes(1);
    expect(modal(row()).props.open).toBe(false);
    expect(orderRefreshHeld()).toBe(false);
  });

  it("a failure stays inside the confirmation, which stays open; a stale answer refreshes too", async () => {
    fake.post.mockRejectedValueOnce(new ApiError({ status: 409, code: "ALREADY_SENT" }));
    await press(buttonNamed(row(), "Cancel"));
    await press(buttonNamed(row(), "Yes, cancel the order"));
    const after = row();
    expect(modal(after).props.open).toBe(true);
    expect(alerts(after).map((a) => a.props.children)).toEqual(["Problem ALREADY_SENT Ref 7"]);
    expect(fake.refresh).toHaveBeenCalledTimes(1);
    expect(fake.success).not.toHaveBeenCalled();
    expect(orderRefreshHeld()).toBe(true);
  });

  it("draws only the buttons the facts allow", () => {
    const names = (tree: ReactNode) => buttons(tree).map((b) => b.props.children);
    expect(names(row(true, false))).toEqual(["Cancel", "Keep the order", "Yes, cancel the order"]);
    expect(names(row(false, true))).toEqual(["Verify"]);
  });
});

describe("the Actions card of the page", () => {
  it("runs the same flow: a confirmed cancel posts, thanks and refreshes", async () => {
    await press(buttonNamed(card(), "Cancel order"));
    expect(modal(card()).props.title).toBe("Cancel this order?");
    await press(buttonNamed(card(), "Yes, cancel the order"));
    expect(fake.post).toHaveBeenCalledWith("/client/orders/42/cancel", {});
    expect(fake.success).toHaveBeenCalledWith("Order cancelled", "The amount was returned to your wallet.");
    expect(fake.refresh).toHaveBeenCalledTimes(1);
  });

  it("a failed Verify shows its message in the card (there is room), not as a toast", async () => {
    fake.post.mockRejectedValueOnce(new ApiError({ status: 500, code: "INTERNAL_ERROR" }));
    await press(buttonNamed(card(false, true), "Request verification"));
    expect(alerts(card(false, true)).map((a) => a.props.children)).toEqual(["Problem INTERNAL_ERROR Ref 7"]);
    expect(fake.error).not.toHaveBeenCalled();
  });
});
