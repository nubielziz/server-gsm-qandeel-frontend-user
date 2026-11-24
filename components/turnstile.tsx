"use client";
// Cloudflare Turnstile (anti-bot) for the routes that require it (handoff §3.10): opening a checkout, the sign-in link,
// sign-in, forgot password and new tickets. The token goes in the
// `X-Turnstile-Token` header (lib/api/browser.ts `turnstileToken`). A token is single use and is spent even when the
// request fails validation, so forms bump `resetKey` after EVERY submit to get a fresh one.
// The script loads lazily, only on pages that render this component.
// Dev: with no NEXT_PUBLIC_TURNSTILE_SITE_KEY the always-pass test key is used; it yields `XXXX.DUMMY.TOKEN.XXXX`,
// the only token the backend's dev verifier accepts.
import { useEffect, useRef } from "react";

type TurnstileApi = {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TEST_SITE_KEY = "1x00000000000000000000AA";
export const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || (process.env.NODE_ENV === "production" ? "" : TEST_SITE_KEY);

let loading: Promise<TurnstileApi> | null = null;
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
    script.onerror = () => {
      loading = null;
      reject(new Error("turnstile script failed to load"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export type TurnstileProps = {
  /** Called with a fresh token, or null when it expired, failed or was reset. */
  onToken: (token: string | null) => void;
  /** Change it (e.g. a counter) to get a new token after a submit. */
  resetKey?: number;
  className?: string;
};

export function Turnstile({ onToken, resetKey = 0, className }: TurnstileProps) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const callback = useRef(onToken);
  useEffect(() => {
    callback.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let cancelled = false;
    if (!TURNSTILE_SITE_KEY) {
      callback.current(null);
      return;
    }
    loadTurnstile()
      .then((ts) => {
        if (cancelled || !box.current) return;
        widget.current = ts.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          // The site is English only (decision 039): the widget speaks English whatever the browser's language.
          language: "en",
          theme: "light",
          size: "flexible",
          callback: (token: string) => callback.current(token),
          "expired-callback": () => callback.current(null),
          "error-callback": () => callback.current(null),
        });
      })
      .catch(() => callback.current(null));
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, []);

  useEffect(() => {
    if (resetKey === 0 || !widget.current || !window.turnstile) return;
    callback.current(null);
    window.turnstile.reset(widget.current);
  }, [resetKey]);

  return <div ref={box} className={className} style={{ minHeight: 65 }} />;
}
