// MerchantWhatsAppActions: the WhatsApp button and the number as text, on the merchant application page. Server-compatible
// (no hooks): the page is fully static and the link works before and without JavaScript.
import { MessageCircle } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import type { AuthMessages } from "@/lib/i18n/messages/auth";

/** The strings of the action block. */
export type MerchantWhatsAppText = Pick<AuthMessages["register"], "chat" | "opensNewTab" | "numberLabel">;

export type MerchantWhatsAppActionsProps = {
  /** The `wa.me` link with the prefilled message. */
  href: string;
  /** The number to show as text (as the owner grouped it, or "+" and the digits). */
  display: string;
  t: MerchantWhatsAppText;
};

export function MerchantWhatsAppActions({ href, display, t }: MerchantWhatsAppActionsProps) {
  return (
    <div className="grid gap-3">
      <ButtonLink href={href} external size="lg" block startIcon={<MessageCircle aria-hidden="true" />}>
        {t.chat}
        <VisuallyHidden> ({t.opensNewTab})</VisuallyHidden>
      </ButtonLink>
      <p className="text-body text-ink-muted">
        {t.numberLabel}{" "}
        <span dir="ltr" className="inline-block font-semibold whitespace-nowrap text-ink select-all">
          {display}
        </span>
      </p>
    </div>
  );
}
