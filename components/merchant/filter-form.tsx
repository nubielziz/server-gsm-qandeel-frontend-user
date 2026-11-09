// The filter row of a list page: a GET form (next/form → soft navigation, works without JavaScript). Fields are
// server-rendered inputs; `hidden` keeps params that are not fields (the status tab). Changing a filter drops `page`.
import Form from "next/form";
import type { ReactNode } from "react";
import { Button, ButtonLink } from "@/components/ui/button";

export type FilterFormProps = {
  /** The page's own path, language-prefixed. */
  action: string;
  hidden?: Record<string, string | undefined>;
  applyLabel: string;
  clearLabel: string;
  /** Shows the "Clear filters" link (some filter is set). */
  active: boolean;
  /** Where "Clear filters" goes (the page without filters, keeping the tab). */
  clearHref: string;
  /** Accessible name of the search landmark. */
  label: string;
  children: ReactNode;
};

export function FilterForm({ action, hidden, applyLabel, clearLabel, active, clearHref, label, children }: FilterFormProps) {
  return (
    <Form action={action} role="search" aria-label={label} className="flex flex-wrap items-end gap-3">
      {hidden
        ? Object.entries(hidden).map(([name, value]) => (value ? <input key={name} type="hidden" name={name} value={value} /> : null))
        : null}
      {children}
      <div className="flex items-center gap-2">
        <Button type="submit" variant="secondary">
          {applyLabel}
        </Button>
        {active ? (
          <ButtonLink href={clearHref} variant="ghost">
            {clearLabel}
          </ButtonLink>
        ) : null}
      </div>
    </Form>
  );
}
