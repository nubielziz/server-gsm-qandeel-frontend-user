import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { auth } from "@/lib/i18n/messages/auth";
import {
  claimLines,
  moveAfterLink,
  moveAfterPasswordChange,
  moveAfterSignIn,
  openedAccount,
  outcomeAfterLink,
  pendingDetailsOf,
  pendingSessionEnded,
} from "./sign-in-steps";

describe("moveAfterSignIn: what a password sign-in answer asks for", () => {
  it("finishes on done, whatever the rank of the account", () => {
    expect(moveAfterSignIn({ next: "done" })).toBe("finish");
  });

  it("asks for the code on totp and for a new password on password", () => {
    expect(moveAfterSignIn({ next: "totp" })).toBe("totp");
    expect(moveAfterSignIn({ next: "password" })).toBe("new-password");
  });

  it("refuses an answer with no known step instead of guessing", () => {
    for (const answer of [undefined, null, {}, { next: "x" }, { next: "" }, { next: "merchant" }]) {
      let caught: unknown;
      try {
        moveAfterSignIn(answer as never);
      } catch (error) {
        caught = error;
      }
      expect(caught, JSON.stringify(answer)).toBeInstanceOf(ApiError);
      expect((caught as ApiError).code).toBe("INVALID_RESPONSE");
    }
  });
});

describe("the move after the sign-in link and after a new password", () => {
  it("a link whose answer says totp opens the code step, done finishes", () => {
    expect(moveAfterLink({ next: "totp" })).toBe("totp");
    expect(moveAfterLink({ next: "done" })).toBe("finish");
  });

  it("a new password whose answer says totp opens the code step, done finishes", () => {
    expect(moveAfterPasswordChange("totp")).toBe("totp");
    expect(moveAfterPasswordChange("done")).toBe("finish");
  });
});

describe("pendingSessionEnded: a 401 on a step goes back to the form", () => {
  it("is true for a 401 only", () => {
    expect(pendingSessionEnded(new ApiError({ status: 401, code: "UNAUTHORIZED" }))).toBe(true);
    // A wrong code is a 422 on `code`: the step stays and shows the field error.
    expect(pendingSessionEnded(new ApiError({ status: 422, code: "VALIDATION_FAILED" }))).toBe(false);
    expect(pendingSessionEnded(new ApiError({ status: 403, code: "ACCOUNT_SUSPENDED" }))).toBe(false);
    expect(pendingSessionEnded(new ApiError({ status: 500 }))).toBe(false);
    expect(pendingSessionEnded(new ApiError({ status: 0, code: "NETWORK_ERROR" }))).toBe(false);
    expect(pendingSessionEnded(new Error("x"))).toBe(false);
    expect(pendingSessionEnded(undefined)).toBe(false);
  });
});

describe("claimLines: what to tell after the sign-in link", () => {
  const t = auth.signIn.link;

  it("says nothing when no guest order moved and the claim did not give up", () => {
    expect(claimLines({ claimedOrders: 0 }, t)).toEqual([]);
    expect(claimLines({ claimedOrders: 0, claimSkipped: undefined }, t)).toEqual([]);
  });

  it("tells how many guest orders were added when there are some", () => {
    expect(claimLines({ claimedOrders: 1 }, t)).toEqual([{ tone: "success", text: "1 guest order was added to your account." }]);
    expect(claimLines({ claimedOrders: 3 }, t)).toEqual([
      { tone: "success", text: "3 guest orders were added to your account." },
    ]);
  });

  it("has the line for a claim that gave up because the records were busy", () => {
    expect(claimLines({ claimedOrders: 0, claimSkipped: "busy" }, t)).toEqual([
      {
        tone: "warning",
        text: "Your guest orders could not be added just now. Ask for a new sign-in link later to try again.",
      },
    ]);
  });

  it("tells both when both are true", () => {
    expect(claimLines({ claimedOrders: 2, claimSkipped: "busy" }, t).map((line) => line.tone)).toEqual(["success", "warning"]);
  });
});

describe("openedAccount: whose account a sign-in link opened", () => {
  it("names nobody when this browser asked for the link", () => {
    expect(openedAccount({ requestedHere: true, maskedEmail: "da•••@example.com" })).toBeNull();
  });

  it("names the masked address when the link was asked for somewhere else", () => {
    expect(openedAccount({ requestedHere: false, maskedEmail: "da•••@example.com" })).toBe("da•••@example.com");
  });

  it("has nothing to name when the answer carries no address", () => {
    expect(openedAccount({ requestedHere: false, maskedEmail: "" })).toBeNull();
    expect(openedAccount({ maskedEmail: undefined } as never)).toBeNull();
  });

  it("treats an answer that does not say it was asked for here as asked for elsewhere", () => {
    expect(openedAccount({ maskedEmail: "da•••@example.com" } as never)).toBe("da•••@example.com");
  });
});

describe("outcomeAfterLink: when the page stops before going on", () => {
  const t = auth.signIn.link;
  const here = { next: "done" as const, claimedOrders: 0, requestedHere: true, maskedEmail: "da•••@example.com" };

  it("goes straight on when there is nothing to tell and the link was asked for in this browser", () => {
    expect(outcomeAfterLink(here, t)).toBeNull();
  });

  it("stops to name the account when the link was not asked for here, even with no claim line", () => {
    expect(outcomeAfterLink({ ...here, requestedHere: false }, t)).toEqual({
      lines: [],
      move: "finish",
      openedFor: "da•••@example.com",
      pending: null,
    });
  });

  it("keeps the claim lines and the code step, and adds the account when both apply", () => {
    expect(outcomeAfterLink({ ...here, next: "totp", requestedHere: false, claimedOrders: 2 }, t)).toEqual({
      lines: [{ tone: "success", text: "2 guest orders were added to your account." }],
      move: "totp",
      openedFor: "da•••@example.com",
      pending: null,
    });
  });

  it("names no account for a link asked for here, but still tells the claim", () => {
    expect(outcomeAfterLink({ ...here, claimedOrders: 1 }, t)).toEqual({
      lines: [{ tone: "success", text: "1 guest order was added to your account." }],
      move: "finish",
      openedFor: null,
      pending: null,
    });
  });

  const pending = { firstName: "Sam", lastName: "Hamdan", country: "JO", phone: "+962791234567" };

  it("stops to ask for the details of a sign-up link opened in another browser, even with nothing else to tell", () => {
    expect(outcomeAfterLink({ ...here, passwordSet: false, pendingDetails: pending }, t)).toEqual({
      lines: [],
      move: "finish",
      openedFor: null,
      pending,
    });
  });

  it("says nothing new when the password was set (this browser sent the form), and when the answer has neither key", () => {
    expect(outcomeAfterLink({ ...here, passwordSet: true }, t)).toBeNull();
    expect(outcomeAfterLink(here, t)).toBeNull();
    expect(pendingDetailsOf({ passwordSet: true })).toBeNull();
    // Even a (wrong) answer that says both: a set password means everything was applied, so there is nothing to confirm.
    expect(pendingDetailsOf({ passwordSet: true, pendingDetails: pending })).toBeNull();
    expect(pendingDetailsOf({})).toBeNull();
  });

  it("asks for nothing when passwordSet is false but there are no details (or they are malformed): the page never invents values", () => {
    expect(outcomeAfterLink({ ...here, passwordSet: false }, t)).toBeNull();
    expect(pendingDetailsOf({ passwordSet: false })).toBeNull();
    expect(pendingDetailsOf({ passwordSet: false, pendingDetails: { firstName: "Sam" } as never })).toBeNull();
    expect(pendingDetailsOf({ passwordSet: false, pendingDetails: { ...pending, phone: 7 } as never })).toBeNull();
    expect(pendingDetailsOf({ pendingDetails: pending })).toEqual(pending);
  });

  it("keeps the account line, the claim lines and the code step next to the details", () => {
    expect(
      outcomeAfterLink({ ...here, next: "totp", requestedHere: false, claimedOrders: 2, passwordSet: false, pendingDetails: pending }, t),
    ).toEqual({
      lines: [{ tone: "success", text: "2 guest orders were added to your account." }],
      move: "totp",
      openedFor: "da•••@example.com",
      pending,
    });
  });
});
