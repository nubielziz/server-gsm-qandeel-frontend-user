"use client";
// A pointer to the merchant's own prices for a signed-in ACTIVE merchant (the shop shows retail prices). It is a Client
// Component on purpose: the home page stays fully static, and the readable `csrf_token_client` cookie tells whether a
// merchant session may exist, so visitors cost no request. Only then `GET /client/auth/me` confirms the account is active.
import { useEffect, useState, useSyncExternalStore } from "react";
import { Store } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { api } from "@/lib/api/browser";
import type { MerchantMe } from "@/lib/api/types";

const noopSubscribe = () => () => {};
const hasMerchantCookie = () => document.cookie.split(";").some((part) => part.trim().startsWith("csrf_token_client="));

export function MerchantBanner({ text, cta, href }: { text: string; cta: string; href: string }) {
  const maybeSignedIn = useSyncExternalStore(noopSubscribe, hasMerchantCookie, () => false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!maybeSignedIn) return;
    let cancelled = false;
    api
      .get<MerchantMe>("/client/auth/me")
      .then((me) => {
        if (!cancelled) setActive(me.status === "active");
      })
      .catch(() => {
        // Signed out, pending or unreachable: no banner. It must never get in the way of the shop.
      });
    return () => {
      cancelled = true;
    };
  }, [maybeSignedIn]);

  if (!active) return null;
  return (
    <Alert
      tone="info"
      icon={<Store aria-hidden="true" />}
      action={
        <ButtonLink href={href} variant="secondary" size="sm">
          {cta}
        </ButtonLink>
      }
    >
      {text}
    </Alert>
  );
}
