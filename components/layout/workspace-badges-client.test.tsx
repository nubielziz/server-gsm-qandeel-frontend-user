import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NavSupportDot, NavUnreadBadge } from "./workspace-badges-client";

describe("NavUnreadBadge: the unread count on the Notifications item", () => {
  it("shows the server's count in the first paint, with the words for the link's name", () => {
    const html = renderToStaticMarkup(<NavUnreadBadge surface="customer" locale="en" initialCount={3} suffix=", {count} unread" />);
    expect(html).toMatch(/<span aria-hidden="true" dir="ltr" class="[^"]*nav-badge[^"]*nav-badge-alert[^"]*">/);
    expect(html).toContain(">3</span>");
    expect(html).toContain('<span class="sr-only">, 3 unread</span>');
    // No animation in the first paint.
    expect(html).not.toContain("animate-badge");
  });

  it("caps at 99+ like the bell, and shows nothing at zero or without a count", () => {
    const capped = renderToStaticMarkup(<NavUnreadBadge surface="merchant" locale="en" initialCount={100} suffix=", {count} unread" />);
    expect(capped).toContain(">99+</span>");
    expect(capped).toContain(", 99+ unread");
    expect(renderToStaticMarkup(<NavUnreadBadge surface="merchant" locale="en" initialCount={0} suffix="x" />)).toBe("");
    expect(renderToStaticMarkup(<NavUnreadBadge surface="merchant" locale="en" initialCount={null} suffix="x" />)).toBe("");
  });

  it("Arabic: the suffix in Arabic, the number kept left to right", () => {
    const html = renderToStaticMarkup(<NavUnreadBadge surface="customer" locale="ar" initialCount={2} suffix="، غير المقروءة: {count}" />);
    expect(html).toContain('dir="ltr"');
    expect(html).toMatch(/<span class="sr-only">، غير المقروءة: .+<\/span>/);
  });
});

describe("NavSupportDot: the dot on Support / My tickets", () => {
  it("shows a dot and the words when the server found a ticket with an unseen reply", () => {
    const html = renderToStaticMarkup(<NavSupportDot surface="customer" initial={["T-1042"]} label=", new reply" />);
    expect(html).toMatch(/<span aria-hidden="true" class="nav-dot [^"]*"><\/span><span class="sr-only">, new reply<\/span>/);
    expect(html).not.toContain("animate-badge-in"); // never pops on a first load
  });

  it("shows nothing without one, or when the list could not be read", () => {
    expect(renderToStaticMarkup(<NavSupportDot surface="merchant" initial={[]} label=", new reply" />)).toBe("");
    expect(renderToStaticMarkup(<NavSupportDot surface="merchant" initial={null} label=", new reply" />)).toBe("");
  });
});
