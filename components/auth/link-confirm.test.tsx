import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ErrorTextProvider } from "@/lib/i18n/error-text";
import { auth } from "@/lib/i18n/messages/auth";
import { errors } from "@/lib/i18n/messages/errors";
import { claimLines } from "./sign-in-steps";
import { LinkConfirm, LinkNotices, LinkOutcome } from "./link-confirm";

const strings = { ...auth.signIn.link, requestNewLink: auth.shared.requestNewLink };
const noop = () => {};
const finish = {
  countries: [
    { code: "JO", name: "Jordan" },
    { code: "US", name: "United States" },
  ],
  t: { fields: auth.fields, errors: auth.signUp.errors, finish: auth.signIn.finish, continue: auth.signIn.link.continue },
};

describe("the sign-in link page: the claim box", () => {
  const html = renderToStaticMarkup(
    <ErrorTextProvider messages={errors}>
      <LinkConfirm token="abc" strings={strings} finish={finish} onSignedIn={noop} onRequestNewLink={noop} onSignedOut={noop} />
    </ErrorTextProvider>,
  );

  it("offers to add the guest orders of this address, with a box that is ticked at the start", () => {
    const box = /<input[^>]*type="checkbox"[^>]*>/.exec(html)?.[0] ?? "";
    expect(box).toContain('name="claimGuestOrders"');
    // The attribute is ` checked=""`; the class names hold "checked:" too, so match the attribute.
    expect(box).toContain(' checked=""');
    expect(html).toContain("Add the orders I placed as a guest with this email");
  });

  it("has one button that finishes the sign-in and tells the person what it does", () => {
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain("Sign in to IMEI-HUB");
    expect(html).toContain("Select the button to finish signing in.");
  });
});

describe("LinkOutcome: what the claim did, before the page goes on", () => {
  const draw = (answer: Parameters<typeof claimLines>[0]) =>
    renderToStaticMarkup(<LinkOutcome lines={claimLines(answer, strings)} continueLabel={strings.continue} onContinue={noop} />);

  it("tells how many guest orders were added and has a button that goes on", () => {
    const html = draw({ claimedOrders: 2 });
    expect(html).toContain("2 guest orders were added to your account.");
    expect(html).toContain(">Continue<");
    expect(html).not.toContain("could not be added");
    expect(html).toContain('role="status"');
  });

  it("says it in the singular for one order", () => {
    expect(draw({ claimedOrders: 1 })).toContain("1 guest order was added to your account.");
  });

  it("shows the busy line, as a warning, when the claim gave up", () => {
    const html = draw({ claimedOrders: 0, claimSkipped: "busy" });
    expect(html).toContain("Your guest orders could not be added just now. Ask for a new sign-in link later to try again.");
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("were added");
  });
});

describe("LinkNotices: the lines above the finish form", () => {
  it("names the account the link opened, with the way out, and the claim lines, and has no button that goes on", () => {
    const html = renderToStaticMarkup(
      <LinkNotices
        lines={claimLines({ claimedOrders: 2 }, strings)}
        opened={{ text: "You are signed in as da•••@example.com.", signOut: strings.notYou, pending: false, onSignOut: noop }}
      />,
    );
    expect(html).toContain("You are signed in as da•••@example.com.");
    expect(html).toContain("Not you? Sign out");
    expect(html).toContain("2 guest orders were added to your account.");
    expect(html).not.toContain(">Continue<");
  });

  it("is an empty box when there is nothing to say", () => {
    const html = renderToStaticMarkup(<LinkNotices lines={[]} />);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<div role");
    expect(html).not.toContain('role="');
  });
});

describe("LinkOutcome: the account a link opened for somebody who did not ask for it", () => {
  const opened = (over: Partial<NonNullable<Parameters<typeof LinkOutcome>[0]["opened"]>> = {}) => ({
    text: "You are signed in as da•••@example.com.",
    signOut: strings.notYou,
    pending: false,
    onSignOut: noop,
    ...over,
  });
  const draw = (notice: Parameters<typeof LinkOutcome>[0]["opened"], lines = claimLines({ claimedOrders: 0 }, strings)) =>
    renderToStaticMarkup(<LinkOutcome lines={lines} continueLabel={strings.continue} onContinue={noop} opened={notice} />);

  it("says whose account it is and offers to sign out, before the button that goes on", () => {
    const html = draw(opened());
    expect(html).toContain("You are signed in as da•••@example.com.");
    expect(html).toContain("Not you? Sign out");
    expect(html.indexOf("Not you? Sign out")).toBeLessThan(html.indexOf(">Continue<"));
  });

  it("says nothing about an account when the link was asked for in this browser", () => {
    const html = draw(null, claimLines({ claimedOrders: 2 }, strings));
    expect(html).not.toContain("You are signed in as");
    expect(html).not.toContain("Not you?");
    expect(html).toContain("2 guest orders were added to your account.");
  });

  it("shows the failure of the sign-out as an alert and keeps the button", () => {
    const html = draw(opened({ error: strings.signOutFailed }));
    expect(html).toContain("We could not sign you out. Try again.");
    expect(html).toContain("Not you? Sign out");
  });
});
