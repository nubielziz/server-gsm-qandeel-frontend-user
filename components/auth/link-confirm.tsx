"use client";
// LinkConfirm: the landing of an emailed sign-in link (`/sign-in?token=`). It never submits by itself: mail scanners open links,
// and the token works once, so a person presses the button. The box above the button offers to add the orders the person
// placed as a guest with this address (the link proved the mailbox); it is ticked at the start. `POST /store/v1/auth/verify
// {token, claimGuestOrders}` → a session. When there is something to tell (orders added, the claim gave up because the records
// were busy, or the link was not asked for in this browser, so it opened an account the reader may not own) the page says so
// and goes on with a button; otherwise it goes on at once. A link opened for another account names it (masked) and offers
// "Not you? Sign out" before going on. A link that came from a sign-up and was opened in another browser than the one that filled
// the form answers `passwordSet: false` with `pendingDetails`: the account exists and is signed in, but nothing of the form was
// applied (a stranger could have typed it), so the page shows "Finish creating your account": the details to confirm or change
// and an empty password box, sent to `POST /store/v1/auth/sign-up/finish`; then it goes on like any sign-in. `passwordSet: true`
// (this browser sent the form) and a link of any other kind add nothing. `totp` as the next step opens the code step. Browser only.
import { useState } from "react";
import { api, forgetCsrf } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import { useErrorText } from "@/lib/i18n/error-text";
import { fmt, type PluralForms } from "@/lib/i18n/define";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { endSession } from "@/components/layout/sign-out-button";
import { exchangeSignInLink } from "./auth-requests";
import { FinishAccountForm, type FinishAccountFormProps } from "./finish-account-form";
import { FormAlert } from "./form-alert";
import { feedbackFrom, NO_FEEDBACK, type FormFeedback } from "./form-errors";
import { moveAfterLink, outcomeAfterLink, type ClaimLine, type LinkOutcomeState } from "./sign-in-steps";

export type LinkConfirmStrings = {
  /** Heading above the text; leave out when the page's `h1` already says it. */
  title?: string;
  text: string;
  submit: string;
  expiredTitle: string;
  expiredText: string;
  requestNewLink: string;
  /** The label of the box that adds the guest orders. */
  claim: string;
  /** "{count} guest orders were added to your account." (one and other forms). */
  claimed: PluralForms;
  /** The line for a claim that gave up because the records were busy. */
  claimBusy: string;
  /** The button that goes on after the lines were read. */
  continue: string;
  /** "You are signed in as {email}." Said when the link opened an account that this browser did not ask for. */
  signedInAs: string;
  /** The button that ends that session ("Not you? Sign out"). */
  notYou: string;
  /** Said when the sign-out failed. */
  signOutFailed: string;
};

export type LinkConfirmProps = {
  token: string;
  strings: LinkConfirmStrings;
  /** The link was accepted (and its lines read): `finish` goes to the target, `totp` opens the code step. */
  onSignedIn: (move: "finish" | "totp") => void | Promise<void>;
  /** The "finish your account" form of a sign-up link opened in another browser: its countries and its texts. */
  finish: Pick<FinishAccountFormProps, "countries" | "t">;
  /** Expired link: what the "request a new link" button does (switch the sign-in form to the email-link mode). */
  onRequestNewLink: () => void;
  /** The reader chose "Not you? Sign out" and the session is gone: the page goes back to the plain sign-in form. */
  onSignedOut: () => void;
};

/** The notice that names the account a link opened, with the way out: shown only when this browser did not ask for the link. */
export type OpenedAccountNotice = {
  /** The sentence, with the masked address in it. */
  text: string;
  /** The label of the sign-out button. */
  signOut: string;
  /** The sign-out is running. */
  pending: boolean;
  /** The sentence for a failed sign-out, when it failed. */
  error?: string;
  onSignOut: () => void;
};

/**
 * The lines that tell what the exchange did: the account the link opened when this browser did not ask for it (with the way to
 * sign out before going on), the failure of that sign-out, and the claim lines. Shown above the button that goes on and above the
 * "finish your account" form.
 */
export function LinkNotices({ lines, opened }: { lines: ClaimLine[]; opened?: OpenedAccountNotice | null }) {
  return (
    <div className="grid gap-3">
      {opened ? (
        <Alert
          tone="info"
          action={
            <Button variant="secondary" size="sm" loading={opened.pending} onClick={opened.onSignOut}>
              {opened.signOut}
            </Button>
          }
        >
          {opened.text}
        </Alert>
      ) : null}
      {opened?.error ? <Alert tone="danger">{opened.error}</Alert> : null}
      {lines.map((line) => (
        <Alert key={line.text} tone={line.tone === "warning" ? "warning" : "success"}>
          {line.text}
        </Alert>
      ))}
    </div>
  );
}

/**
 * What the exchange did, with a button that goes on. Shown only when there is something to tell: the claim lines, and the
 * account the link opened when this browser did not ask for it (with the way to sign out before going on).
 */
export function LinkOutcome({
  lines,
  continueLabel,
  busy,
  onContinue,
  opened,
}: {
  lines: ClaimLine[];
  continueLabel: string;
  busy?: boolean;
  onContinue: () => void;
  opened?: OpenedAccountNotice | null;
}) {
  return (
    <div className="grid gap-5">
      <LinkNotices lines={lines} opened={opened} />
      <Button size="lg" block loading={busy} onClick={onContinue}>
        {continueLabel}
      </Button>
    </div>
  );
}

export function LinkConfirm({ token, strings: s, finish, onSignedIn, onRequestNewLink, onSignedOut }: LinkConfirmProps) {
  const errorText = useErrorText();
  const [claim, setClaim] = useState(true);
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);
  const [feedback, setFeedback] = useState<FormFeedback>(NO_FEEDBACK);
  const [outcome, setOutcome] = useState<LinkOutcomeState | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setFeedback(NO_FEEDBACK);
    try {
      const answer = await exchangeSignInLink(token, claim);
      const told = outcomeAfterLink(answer, s);
      if (told) {
        setOutcome(told);
        setBusy(false);
        return;
      }
      await onSignedIn(moveAfterLink(answer));
    } catch (error) {
      if (isApiError(error) && error.status === 410) setExpired(true);
      else setFeedback(feedbackFrom(error, errorText, []));
      setBusy(false);
    }
  }

  /** "Not you? Sign out": ends the session this link opened, then the page goes back to the plain sign-in form. */
  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutFailed(false);
    const done = await endSession((path) => api.post(path), forgetCsrf);
    if (done) {
      onSignedOut();
      return;
    }
    setSigningOut(false);
    setSignOutFailed(true);
  }

  if (outcome) {
    const opened: OpenedAccountNotice | null =
      outcome.openedFor === null
        ? null
        : {
            text: fmt(s.signedInAs, { email: outcome.openedFor }),
            signOut: s.notYou,
            pending: signingOut,
            error: signOutFailed ? s.signOutFailed : undefined,
            onSignOut: () => void signOut(),
          };
    // A sign-up link opened in another browser: nothing was applied, so the details wait to be confirmed (with the notices above,
    // among them "Not you? Sign out" for the person whose address somebody else used).
    if (outcome.pending) {
      return (
        <div className="grid gap-5">
          <LinkNotices lines={outcome.lines} opened={opened} />
          <FinishAccountForm
            pending={outcome.pending}
            countries={finish.countries}
            t={finish.t}
            onDone={() => onSignedIn(outcome.move)}
          />
        </div>
      );
    }
    return (
      <LinkOutcome
        lines={outcome.lines}
        continueLabel={s.continue}
        busy={signingOut}
        onContinue={() => void onSignedIn(outcome.move)}
        opened={opened}
      />
    );
  }

  if (expired) {
    return (
      <div className="grid gap-5">
        <Alert tone="warning" title={s.expiredTitle}>
          {s.expiredText}
        </Alert>
        <Button variant="primary" size="lg" block onClick={onRequestNewLink}>
          {s.requestNewLink}
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div>
        {s.title ? <h2 className="text-heading text-ink">{s.title}</h2> : null}
        <p className={s.title ? "mt-1.5 text-body text-ink-muted" : "text-body text-ink-muted"}>{s.text}</p>
      </div>
      <Checkbox name="claimGuestOrders" label={s.claim} checked={claim} onChange={(event) => setClaim(event.target.checked)} />
      <FormAlert message={feedback.message} reference={feedback.reference} />
      <Button size="lg" block loading={busy} onClick={confirm}>
        {s.submit}
      </Button>
    </div>
  );
}
