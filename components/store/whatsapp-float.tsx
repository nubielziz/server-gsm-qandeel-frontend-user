// The home page's floating WhatsApp button (owner, 2026-11-23): a round button with the WhatsApp logo, fixed to the bottom end
// corner. A click opens a chat with the team's number on wa.me in a new tab: WhatsApp Web or the desktop app on a computer, the
// app on a phone. The number is the site's one WhatsApp number (`NEXT_PUBLIC_MERCHANT_WHATSAPP`, build-time, the one the merchant
// application uses): not configured means no button, never a broken link.
// The logo is the brand file public/images/brands/whatsapp.png (docs/LOGOS.md). Static: no hooks, no reads.
// It sits under the toaster (z-50), which uses the same corner for the few seconds a toast shows, and above the page.
import Image from "next/image";
import { merchantWhatsApp, whatsAppChatLink } from "@/lib/contact/whatsapp";
import { store } from "@/lib/i18n/messages/store";

export function WhatsAppFloat() {
  const contact = merchantWhatsApp();
  if (!contact) return null;
  const t = store.home.whatsapp;
  return (
    <a
      href={whatsAppChatLink(contact.digits)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t.label + " (" + t.opensNewTab + ")"}
      title={t.label}
      className={
        "btn-motion btn-lift-soft fixed end-4 bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] z-40 grid size-14 place-items-center " +
        "rounded-full border border-line bg-surface shadow-raised hover:border-line-strong sm:end-6 sm:bottom-6"
      }
    >
      <Image src="/images/brands/whatsapp.png" alt="" width={34} height={34} />
    </a>
  );
}
