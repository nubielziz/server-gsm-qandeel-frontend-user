"use client";
// PaymentMethodLogo: the picture that goes before a payment method's name where a method is offered (the customer's and
// the merchant's top-up forms, the checkout). The order is the API's (feature 32): the logo staff uploaded (`logoUrl`),
// else the bundled logo of the method's `preset` (`public/images/payments`, docs/LOGOS.md), else a plain icon. A picture
// that does not load (a deleted or unreachable upload, a missing file) is dropped and the next of that order is shown:
// that is why this is a Client Component (`onError`). Every variant sits in the same chip, so the names of a list start at
// the same place. No file is read (lib/payments/logos.ts). Never draws artwork: logos are files, icons come from lucide-react.
import { useState } from "react";
import Image from "next/image";
import { Banknote, Coins, CreditCard, Landmark, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { paymentIconKind, paymentLogoSources, type PaymentIconKind, type PaymentMethodType } from "@/lib/payments/logos";

const ICONS: Record<PaymentIconKind, LucideIcon> = { bank: Landmark, crypto: Coins, card: CreditCard, transfer: Banknote };

export type PaymentMethodLogoProps = {
  /** The method's name: the picture's alternative text unless `alt` says otherwise. */
  name: string;
  /**
   * The picture's alternative text. Default: the name. Pass `""` when the name is printed next to the picture (a radio
   * card's title), so a screen reader does not say it twice. An icon is always hidden from assistive technology.
   */
  alt?: string;
  /** `logoUrl` of the API: the uploaded logo (`/store/v1/media/<name>`), or null. */
  logoUrl?: string | null;
  /** `preset` of the API: the ready-made method it was made from (`vodafone_cash`), or null for a custom one. */
  preset?: string | null;
  /** `methodType` of a top-up method: picks the icon when there is no logo. The checkout has none; it sends `code`. */
  methodType?: PaymentMethodType;
  /** `code` of a checkout method: the icon of a method without `methodType` or `preset` (crypto or card). */
  code?: string;
  /** Extra classes of the chip (spacing; not its size). */
  className?: string;
};

/** The chip: 48 × 32 px, the logo scaled to fit inside it (`object-contain`), an icon centred in it. */
const CHIP = "relative grid h-8 w-12 shrink-0 place-items-center";

/**
 * The logo of a payment method: its uploaded picture, else the bundled logo of its preset, else a generic icon (`Landmark`
 * for a bank transfer, a coin for crypto, a card, banknotes for a money transfer service). A picture that fails to load is
 * skipped for the rest of the page's life, so a broken upload shows the preset's logo and a broken file shows the icon.
 *
 * @param props - `name` and `alt` for the text; `logoUrl` and `preset` from the API; `methodType` or `code` for the icon.
 * @returns A fixed-size chip with an `<img>` (next/image) or an `aria-hidden` icon.
 * @see docs/LOGOS.md for the bundled files and their sources.
 */
export function PaymentMethodLogo({ name, alt, logoUrl, preset, methodType, code, className }: PaymentMethodLogoProps) {
  // The pictures that failed, by address: a different address (staff uploaded another logo) is tried again.
  const [failed, setFailed] = useState<readonly string[]>([]);
  const src = paymentLogoSources({ logoUrl, preset }).find((source) => !failed.includes(source));
  if (src) {
    return (
      <span className={cn(CHIP, className)}>
        <Image
          src={src}
          alt={alt ?? name}
          fill
          sizes="48px"
          className="object-contain"
          onError={() => setFailed((list) => (list.includes(src) ? list : [...list, src]))}
        />
      </span>
    );
  }
  const Icon = ICONS[paymentIconKind({ methodType, preset, code })];
  return (
    <span aria-hidden="true" className={cn(CHIP, className)}>
      <Icon className="size-5" />
    </span>
  );
}
