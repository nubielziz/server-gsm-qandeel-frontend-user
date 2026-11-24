// The old address of a merchant rank's order form (`/account/services/<id>`, app/en/account/services/[id]/page.tsx): there is no price
// list any more (decision 003), so it only sends the reader on: to the service's checkout, where the account's own order form
// opens, or to the shop's services when the service has no shop page. It reads no session.
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({ slug: vi.fn(), redirect: vi.fn() }));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    reads.redirect(to);
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("@/lib/catalog", () => ({ slugForService: reads.slug }));
vi.mock("@/lib/api/session", () => ({
  getAccount: () => {
    throw new Error("the old address reads no session");
  },
}));

import OldOrderFormPage, { generateMetadata } from "@/app/en/account/services/[id]/page";

type Element = ReactElement<Record<string, unknown>>;

function find(node: ReactNode, name: string): Element | null {
  if (!isValidElement<Record<string, unknown>>(node)) return null;
  if (typeof node.type === "function" && node.type.name === name) return node;
  return find(node.props.children as ReactNode, name);
}

/** Runs the page down to its redirect and returns where it went. */
async function target(id: string): Promise<string> {
  const page = OldOrderFormPage({ params: Promise.resolve({ id }) });
  const inner = find(page, "OldOrderFormRedirect");
  await expect((inner!.type as (props: unknown) => Promise<unknown>)(inner!.props)).rejects.toThrow(/^redirect:/);
  return reads.redirect.mock.calls.at(-1)![0] as string;
}

beforeEach(() => {
  reads.slug.mockReset();
  reads.redirect.mockReset();
});

describe("the old order form address", () => {
  it("leads to the checkout of the service's shop page, where the merchant order form opens", async () => {
    reads.slug.mockResolvedValue("icloud-clean");
    expect(await target("42")).toBe("/en/checkout?service=icloud-clean");
    expect(reads.slug).toHaveBeenCalledWith(42);
  });

  it("leads to the shop's services when the service has no shop page", async () => {
    reads.slug.mockResolvedValue(null);
    expect(await target("42")).toBe("/en/services");
  });

  it("looks nothing up for an id that is not one, and leads to the shop's services", async () => {
    for (const id of ["0", "abc", "-1", "1.5", "99999999999999999"]) {
      expect(await target(id), id).toBe("/en/services");
    }
    expect(reads.slug).not.toHaveBeenCalled();
  });

  it("is never indexed", () => {
    expect(generateMetadata()).toEqual({ robots: { index: false, follow: false } });
  });
});
