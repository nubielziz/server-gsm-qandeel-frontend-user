// A compact list for phones: one small row per record instead of a stacked table card (a stacked order is ~8 lines
// tall, so 25 orders became a 12,000px page). Pages render the real <Table> from `md` up and this list below it.
// A row with `href` is one big link (a 44px+ touch target); the amount sits on the end side.
import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

export type MobileRow = {
  key: string | number;
  /** Makes the whole row a link. */
  href?: string;
  /** First line: the record's name or number. */
  title: ReactNode;
  /** Next to the title: a status badge. */
  badge?: ReactNode;
  /** Second line, normal weight. */
  subtitle?: ReactNode;
  /** Small muted lines under it. */
  details?: ReactNode[];
  /** The figure on the end side. */
  amount?: ReactNode;
  /** Small text under the figure. */
  amountHint?: ReactNode;
  /** Accessible name of the link. */
  label?: string;
};

function Content({ row, link }: { row: MobileRow; link: boolean }) {
  return (
    <>
      <span className="grid min-w-0 flex-1 gap-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-body font-semibold text-ink">{row.title}</span>
          {row.badge}
        </span>
        {row.subtitle ? <span className="text-body text-ink">{row.subtitle}</span> : null}
        {row.details && row.details.length > 0 ? (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-small text-ink-subtle">
            {row.details.map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </span>
        ) : null}
      </span>
      {row.amount ? (
        <span className="grid shrink-0 justify-items-end gap-0.5 text-end">
          <span className="num text-body font-semibold text-ink">{row.amount}</span>
          {row.amountHint ? <span className="text-small text-ink-subtle">{row.amountHint}</span> : null}
        </span>
      ) : null}
      {link ? <ChevronRight aria-hidden="true" className="size-4 shrink-0 self-center text-ink-subtle rtl:-scale-x-100" /> : null}
    </>
  );
}

export function MobileList({ rows, className }: { rows: MobileRow[]; className?: string }) {
  return (
    <ul className={`divide-y divide-line ${className ?? ""}`}>
      {rows.map((row) => (
        <li key={row.key}>
          {row.href ? (
            <Link href={row.href} aria-label={row.label} className="flex min-h-14 items-start gap-3 px-4 py-3.5 hover:bg-surface-muted">
              <Content row={row} link />
            </Link>
          ) : (
            <div className="flex items-start gap-3 px-4 py-3.5">
              <Content row={row} link={false} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
