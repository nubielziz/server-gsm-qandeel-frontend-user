import { describe, expect, it } from "vitest";
import { initialReplyArea, isClosed, refusedAsClosed, replyAreaFor, unsentText } from "./reply-area";

describe("isClosed: a resolved ticket takes no more messages from the requester", () => {
  it("is closed only when resolved", () => {
    expect(isClosed("resolved")).toBe(true);
    for (const status of ["new", "open", "pending"] as const) expect(isClosed(status)).toBe(false);
  });
});

describe("the reply area: the box while open, the closed notice once resolved", () => {
  it("starts as the page's status says, with nothing discarded or kept", () => {
    expect(initialReplyArea("resolved")).toEqual({ closed: true, live: false, discarded: false, unsent: null, restore: "" });
    expect(initialReplyArea("open").closed).toBe(false);
  });

  it("is the same object while the status does not open or close it", () => {
    const area = initialReplyArea("open");
    expect(replyAreaFor(area, "pending", true)).toBe(area);
    const closed = initialReplyArea("resolved");
    expect(replyAreaFor(closed, "resolved", false)).toBe(closed);
  });

  it("closed live while the visitor was writing: the draft is discarded and the notice says so", () => {
    const next = replyAreaFor(initialReplyArea("open"), "resolved", true);
    expect(next).toEqual({ closed: true, live: true, discarded: true, unsent: null, restore: "" });
  });

  it("closed live with an empty box: nothing to say about a draft", () => {
    expect(replyAreaFor(initialReplyArea("open"), "resolved", false).discarded).toBe(false);
  });

  it("a send refused as closed keeps its text in the notice, and that text is not called discarded", () => {
    const refused = refusedAsClosed(initialReplyArea("open"), "My last question");
    const next = replyAreaFor(refused, "resolved", true);
    expect(next.closed).toBe(true);
    expect(next.discarded).toBe(false);
    expect(unsentText(next)).toBe("My last question");
  });

  it("a refused message of files only has nothing to copy", () => {
    const next = replyAreaFor(refusedAsClosed(initialReplyArea("open"), "  "), "resolved", true);
    expect(unsentText(next)).toBeNull();
    expect(next.discarded).toBe(false);
  });

  it("reopened by staff: the box comes back with the refused text in it, the notice and its marks go", () => {
    const closed = replyAreaFor(refusedAsClosed(initialReplyArea("open"), "Keep me"), "resolved", false);
    const open = replyAreaFor(closed, "open", false);
    expect(open).toEqual({ closed: false, live: false, discarded: false, unsent: null, restore: "Keep me" });
    // A discarded draft does not come back.
    const discarded = replyAreaFor(initialReplyArea("open"), "resolved", true);
    expect(replyAreaFor(discarded, "open", false).restore).toBe("");
  });
});
