// SkipLink: the first tab stop on every page; jumps over the header to <main id="main">.
import { common } from "@/lib/i18n/messages/common";

/** "Skip to content": invisible until focused, then a dark pill in the top corner. */
export function SkipLink() {
  const t = common;
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100] focus:rounded-control focus:bg-primary focus:px-4 focus:py-3 focus:text-body focus:font-semibold focus:text-on-primary focus:shadow-overlay"
    >
      {t.header.skipToContent}
    </a>
  );
}
