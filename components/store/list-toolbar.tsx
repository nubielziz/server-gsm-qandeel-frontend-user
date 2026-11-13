"use client";
// The search box and the sort control above the home page's service list: one GET form, so it works without
// JavaScript (the search button submits it). With JavaScript a new sort applies at once, empty and default values stay
// out of the URL, the page number starts again at 1 and the list's anchor keeps it in view. The other filters ride along
// as hidden fields. Give it a `key` made of the current values: a new URL then shows them (the fields are uncontrolled).
import { useId, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Search } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Input, Select } from "@/components/ui/input";

export type ListToolbarLabels = {
  search: string;
  searchPlaceholder: string;
  searchSubmit: string;
  sort: string;
  sortFeatured: string;
  sortTitle: string;
};

export type ListToolbarProps = {
  /** The language-prefixed path of the page that shows the list. */
  action: string;
  /** The list's anchor (`#all-services`). */
  hash: string;
  q: string;
  sort: "featured" | "title";
  /** Active filters to keep (categories, brand, carrier, country, price), as name/value pairs (names may repeat). */
  keep: [string, string][];
  labels: ListToolbarLabels;
  /** A control at the end of the sort row (the phone "Filters" button; a `type="button"`, so it never submits). */
  extra?: ReactNode;
};

/**
 * Search on the first row; "Sort by" and `extra` beside it when there is room, else on a second row with `extra` at
 * its end (phones).
 */
export function ListToolbar({ action, hash, q, sort, keep, labels, extra }: ListToolbarProps) {
  const router = useRouter();
  const sortId = useId();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget)) {
      const text = typeof value === "string" ? value.trim() : "";
      if (!text || (key === "sort" && text === "featured")) continue;
      params.append(key, text);
    }
    const query = params.toString();
    router.push(`${action}${query ? `?${query}` : ""}${hash}`);
  }

  return (
    <form action={`${action}${hash}`} method="get" role="search" onSubmit={onSubmit} className="flex w-full min-w-0 flex-wrap items-center gap-x-4 gap-y-3">
      {keep.map(([name, value]) => (
        <input key={`${name}\u0000${value}`} type="hidden" name={name} value={value} />
      ))}
      <Input
        type="search"
        name="q"
        label={labels.search}
        labelHidden
        defaultValue={q}
        placeholder={labels.searchPlaceholder}
        autoComplete="off"
        enterKeyHint="search"
        maxLength={100}
        leading={<Search aria-hidden="true" />}
        trailing={
          <IconButton type="submit" size="sm" label={labels.searchSubmit}>
            <ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />
          </IconButton>
        }
        fieldClassName="min-w-0 flex-[1_1_16rem]"
      />
      <div className="flex items-center gap-2.5 max-sm:w-full">
        <label htmlFor={sortId} className="whitespace-nowrap text-small text-ink-muted">
          {labels.sort}
        </label>
        <Select
          id={sortId}
          name="sort"
          defaultValue={sort}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          options={[
            { value: "featured", label: labels.sortFeatured },
            { value: "title", label: labels.sortTitle },
          ]}
        />
        {extra ? <div className="ms-auto">{extra}</div> : null}
      </div>
    </form>
  );
}
