"use client";
// The Turnstile state every anti-bot form needs: a way to get the current token and a counter that asks the widget for a
// fresh one. Tokens are single use and spent even when the request fails validation (handoff §3.5), so call `reset()`
// after EVERY submit, success or not.
// `ensureToken()` waits (up to `timeoutMs`) for a token that is still on its way, so a visitor who submits before the
// check has finished is not sent away with an error: the form just waits a moment.
import { useCallback, useRef, useState } from "react";

export function useTurnstile() {
  const [token, setTokenState] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const current = useRef<string | null>(null);
  const waiters = useRef<((token: string | null) => void)[]>([]);

  const setToken = useCallback((next: string | null) => {
    current.current = next;
    setTokenState(next);
    if (next) for (const resolve of waiters.current.splice(0)) resolve(next);
  }, []);

  const reset = useCallback(() => {
    current.current = null;
    setTokenState(null);
    setResetKey((key) => key + 1);
  }, []);

  const ensureToken = useCallback((timeoutMs = 10_000): Promise<string | null> => {
    if (current.current) return Promise.resolve(current.current);
    return new Promise((resolve) => {
      const waiter = (value: string | null) => {
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => {
        waiters.current = waiters.current.filter((w) => w !== waiter);
        resolve(null);
      }, timeoutMs);
      waiters.current.push(waiter);
    });
  }, []);

  return { token, setToken, resetKey, reset, ensureToken };
}
