"use client";
// A pointer to the account's own prices, for a signed-in account whose rank has a price list (the shop shows retail prices).
// It is a Client Component on purpose: the home page stays fully static, and the readable CSRF cookie tells whether a session
// of the portal family may exist, so visitors and retail accounts cost no request. Only then `GET /client/auth/me` confirms
// that the rank is a merchant one. The banner shows for the merchant rank only, and links to the price list.
import { useEffect, useState, useSyncExternalStore } from "react";
import { Store } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { rankKindOf, type RankSource } from "@/lib/account/family";
import { FAMILY_ROUTES } from "@/lib/account/routes";
import { accountFamilyFromCookies } from "@/lib/api/account-cookie";
import { api } from "@/lib/api/browser";
import type { AccountMe } from "@/lib/api/types";

const noopSubscribe = () => () => {};

/** Whether a session of the portal family may exist: its readable cookie is there. The server snapshot is "no". */
const maybeMerchant = () => accountFamilyFromCookies(document.cookie) === "client";

/**
 * Whether the banner shows for this cookie header and this reader of the account. Without the portal family's cookie no call
 * is made (a visitor, and a retail account whose cookie is the shop's, cannot have a price list). With it, the answer must
 * name the merchant rank; any failure (signed out, a rank refusal, no answer) means no banner: it must never get in the way
 * of the shop.
 *
 * @param cookies the cookie header (`document.cookie`)
 * @param read reads an account route (the browser client's `api.get`)
 */
export async function bannerShows(cookies: string, read: (path: string) => Promise<RankSource>): Promise<boolean> {
  if (accountFamilyFromCookies(cookies) !== "client") return false;
  try {
    return rankKindOf(await read(FAMILY_ROUTES.client.me)) === "merchant";
  } catch {
    return false;
  }
}

/** The banner as a picture: no hooks, no reads. */
export function RankBannerView({ text, cta, href }: { text: string; cta: string; href: string }) {
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

/** The home page's pointer to the price list of a merchant rank. Nothing for anybody else. */
export function RankBanner({ text, cta, href }: { text: string; cta: string; href: string }) {
  const mayBeMerchant = useSyncExternalStore(noopSubscribe, maybeMerchant, () => false);
  const [shows, setShows] = useState(false);

  useEffect(() => {
    if (!mayBeMerchant) return;
    let cancelled = false;
    bannerShows(document.cookie, (path) => api.get<AccountMe>(path)).then((answer) => {
      if (!cancelled) setShows(answer);
    });
    return () => {
      cancelled = true;
    };
  }, [mayBeMerchant]);

  if (!shows) return null;
  return <RankBannerView text={text} cta={cta} href={href} />;
}
