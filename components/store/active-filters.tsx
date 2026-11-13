// The active filters of a service list as removable chips, then "Clear all" (the catalog page and the home list). Each
// chip is a link to the same list without that filter.
import Link from "next/link";
import { X } from "lucide-react";

export type FilterChip = {
  key: string;
  /** What the chip shows ("Apple", "Search: unlock"). */
  label: string;
  /** Accessible name of the link ("Remove filter: Apple"). */
  removeLabel: string;
  /** The list without this filter. */
  href: string;
};

export function ActiveFilters({ label, chips, clear }: { label: string; chips: FilterChip[]; clear: { label: string; href: string } }) {
  if (chips.length === 0) return null;
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap items-center gap-2">
        {chips.map((chip) => (
          <li key={chip.key}>
            <Link
              href={chip.href}
              aria-label={chip.removeLabel}
              className="touch-target inline-flex items-center gap-1.5 rounded-full bg-surface-sunken px-3 py-1.5 text-small font-semibold text-ink transition-colors hover:bg-line-strong"
            >
              <bdi>{chip.label}</bdi>
              <X aria-hidden="true" className="size-3.5" />
            </Link>
          </li>
        ))}
        <li>
          <Link href={clear.href} className="touch-target inline-flex px-2 py-1.5 text-small font-semibold text-ink underline underline-offset-4">
            {clear.label}
          </Link>
        </li>
      </ul>
    </nav>
  );
}
