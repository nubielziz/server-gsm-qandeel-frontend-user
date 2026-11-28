// MerchantWhatsAppActions: the WhatsApp button and the number as text, at the end of the "Become a merchant" form. The button
// submits the form (the form checks the details, then opens the chat with them written into the message); the number stays under
// it as text, so a visitor can also message it by hand. Server-compatible (no hooks).
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import type { AuthMessages } from "@/lib/i18n/messages/auth";

/** The strings of the action block. */
export type MerchantWhatsAppText = Pick<AuthMessages["becomeMerchant"], "chat" | "opensNewTab" | "numberLabel">;

export type MerchantWhatsAppActionsProps = {
  /** The number to show as text (as the owner grouped it, or "+" and the digits). */
  display: string;
  t: MerchantWhatsAppText;
  /** Keeps the button disabled (the form sets it until the script has loaded: see `useMounted`). */
  disabled?: boolean;
};

export function MerchantWhatsAppActions({ display, t, disabled = false }: MerchantWhatsAppActionsProps) {
  return (
    <div className="grid gap-3">
      <Button type="submit" size="lg" block disabled={disabled} startIcon={<MessageCircle aria-hidden="true" />}>
        {t.chat}
        <VisuallyHidden> ({t.opensNewTab})</VisuallyHidden>
      </Button>
      <p className="text-body text-ink-muted">
        {t.numberLabel}{" "}
        <span dir="ltr" className="inline-block font-semibold whitespace-nowrap text-ink select-all">
          {display}
        </span>
      </p>
    </div>
  );
}
