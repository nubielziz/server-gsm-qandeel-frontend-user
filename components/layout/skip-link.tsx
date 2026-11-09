// SkipLink: the first tab stop on every page; jumps over the header to <main id="main">.
import { getMessages } from "@/lib/i18n/server";
import { common } from "@/lib/i18n/messages/common";

/** "Skip to content": invisible until focused, then a dark pill in the top corner. */
export async function SkipLink() {
  const t = await getMessages(common);
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100] focus:rounded-control focus:bg-inverse focus:px-4 focus:py-3 focus:text-body focus:font-semibold focus:text-on-inverse focus:shadow-overlay"
    >
      {t.header.skipToContent}
    </a>
  );
}
