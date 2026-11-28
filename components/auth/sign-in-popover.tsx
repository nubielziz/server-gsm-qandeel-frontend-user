"use client";
// SignInPopover: the "Sign in" button of the shop header and the panel that opens under it (owner, 2026-11-28). The panel holds
// the same steps as the sign-in page (SignInSteps, `embedded`): email and password, "Email me a sign-in link", and "Create an
// account", which goes to the sign-up page. A finished sign-in closes the panel and refreshes the route, so the visitor stays on
// the page they were reading and the header shows their account.
// The button is a link to the sign-in page: before the script loads, in a new tab (Ctrl, Cmd, Shift or the middle button) and on
// phones (where the header shows its icon link instead of this button) the page itself opens. A plain click opens the panel.
// The panel is a native popover placed under the button (useAnchoredPopover): Esc and a click outside close it, and what was typed
// stays for the next opening. The steps and the Turnstile widget are loaded on the first opening (or when the pointer or the
// focus reaches the button), not with every page. Only a signed-out visitor gets this component.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { lazy, Suspense, useId, useRef, useState, type MouseEvent } from "react";
import { buttonClasses } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnchoredPopover } from "@/components/ui/use-anchored-popover";
import type { SignInStepsText } from "./sign-in-flow";

const loadSteps = () => import("./sign-in-flow");
const SignInSteps = lazy(() => loadSteps().then((module) => ({ default: module.SignInSteps })));

export type SignInPopoverProps = {
  /** The sign-in page: where the button leads without the script, in a new tab and on phones. */
  href: string;
  /** "Sign in": the button's text and the panel's name. */
  label: string;
  /** The texts of the steps (`signInStepsText`). */
  t: SignInStepsText;
};

/** The shape of the password step while its script loads, so the panel does not jump. */
function PanelSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-4">
      <div>
        <Skeleton className="h-6 w-24" />
        <Skeleton className="mt-2.5 h-4 w-52" />
      </div>
      {[0, 1].map((box) => (
        <div key={box} className="grid gap-1.5">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-11 rounded-control" />
        </div>
      ))}
      <Skeleton className="h-[65px] rounded-control" />
      <Skeleton className="h-11 rounded-control" />
      <Skeleton className="h-5" />
      <Skeleton className="h-11 rounded-control" />
      <Skeleton className="h-11 rounded-control" />
    </div>
  );
}

export function SignInPopover({ href, label, t }: SignInPopoverProps) {
  const router = useRouter();
  const panelId = `si${useId().replace(/:/g, "")}`;
  // True from the first opening: the steps are loaded then and stay, so what was typed survives closing the panel.
  const [wanted, setWanted] = useState(false);
  // Whether the panel was open when the pointer went down on the button: that press closes it (a press outside a popover does),
  // and the click that follows must not open it again.
  const openAtPress = useRef(false);
  const { anchor, panel, open, show, hide, onBeforeToggle, onToggle } = useAnchoredPopover<HTMLAnchorElement>({
    align: "end",
    width: 384,
    maxHeight: 760,
  });

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    // A new tab or window opens the sign-in page itself.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    const wasOpen = openAtPress.current;
    openAtPress.current = false;
    if (wasOpen) return;
    // From the keyboard (no press came first) the button opens and closes the panel.
    if (open) return hide();
    setWanted(true);
    show();
  }

  /** The account is signed in: close the panel and let the server draw the page for it. */
  function done() {
    hide();
    router.refresh();
  }

  return (
    <>
      <Link
        ref={anchor}
        href={href}
        prefetch={false}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onPointerEnter={() => void loadSteps()}
        onFocus={() => void loadSteps()}
        onPointerDown={() => {
          openAtPress.current = open;
        }}
        onClick={onClick}
        className={buttonClasses({ variant: "primary", size: "md" })}
      >
        {label}
      </Link>
      <div
        ref={panel}
        id={panelId}
        popover="auto"
        role="dialog"
        aria-label={label}
        onBeforeToggle={onBeforeToggle}
        onToggle={(event) => {
          onToggle(event);
          if (event.target !== event.currentTarget) return;
          const box = event.currentTarget;
          if (event.newState === "open") {
            // A later opening: the first box takes the focus again (the first time, the form does it when it is drawn).
            box.querySelector<HTMLElement>("input:not([type='hidden'])")?.focus();
          } else if (!document.activeElement || document.activeElement === document.body || box.contains(document.activeElement)) {
            // Closed with the focus still inside: it goes back to the button.
            anchor.current?.focus();
          }
        }}
        onClick={(event) => {
          // A link inside (forgot password, create an account) leaves the page: the panel does not stay open over the next one.
          if (event.target instanceof Element && event.target.closest("a[href]")) hide();
        }}
        className="popover-menu p-5"
      >
        {wanted ? (
          <Suspense fallback={<PanelSkeleton />}>
            <SignInSteps t={t} embedded onFinish={done} />
          </Suspense>
        ) : null}
      </div>
    </>
  );
}
