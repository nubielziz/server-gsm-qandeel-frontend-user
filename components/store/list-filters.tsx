"use client";
// The filter form of the service list (mockup "All Products" sidebar): the lists above the price range (Categories,
// Availability), the price range, then the lists under it (service type, brand, carrier, country). Each option is a
// checkbox with how many services it would show; several options of one list add up. A GET form, so it works without
// JavaScript (its Apply button shows only then). With
// JavaScript a change applies at once (a checkbox when ticked, the slider when released) without moving the page, so
// the list updates beside it. The sidebar's copy is server-rendered; the phone drawer's (`LazyListFilters`) mounts when the
// drawer first opens and stays while options are picked (one form in the HTML, plan P3.4). The ticks follow the URL: a
// filter removed elsewhere (a chip) clears its box here too.
import { useCallback, useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogLink } from "@/components/ui/dialog";
import { RangeSlider } from "@/components/ui/range-slider";
import { formatMoney } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";

export type FilterOption = {
  value: string;
  label: string;
  /** "(8)", formatted for the language. */
  count: string;
  selected: boolean;
};

export type FilterGroup = {
  /** The query parameter (`category`, `stock`, `type`, `brand`, `network`, `country`). */
  name: string;
  label: string;
  options: FilterOption[];
};

export type PriceFilter = {
  /** The slider's span in whole units of `currency`. */
  min: number;
  max: number;
  /** The current [low, high]. */
  value: [number, number];
  currency: string;
};

export type ListFiltersLabels = {
  priceRange: string;
  minPrice: string;
  maxPrice: string;
  /** "Show {count} more" */
  showMore: string;
  showLess: string;
  apply: string;
  clear: string;
};

export type ListFiltersProps = {
  /** The language-prefixed path of the page that shows the list. */
  action: string;
  /** Values the form sends along unchanged (search, sort). */
  keep: [string, string][];
  /** The lists above the price range (Categories, Availability); a list with no options is left out. */
  top: FilterGroup[];
  price: PriceFilter | null;
  /** The lists under the price range (service type, brand, carrier, country). */
  groups: FilterGroup[];
  labels: ListFiltersLabels;
  /** Where "Clear all" goes; null when nothing is filtered. */
  clearHref: string | null;
};

/** Options shown in a list before "Show N more". */
const VISIBLE = 6;
const legendClasses = "mb-1.5 text-small font-bold text-ink";

const keyOf = (group: FilterGroup, option: FilterOption) => `${group.name}\u0000${option.value}`;

export function ListFilters({ action, keep, top, price, groups, labels, clearHref }: ListFiltersProps) {
  const router = useRouter();
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const lists = [...top, ...groups];

  // The ticks are the URL's (from the server), changed at once on a click; a new URL resets them.
  const fromUrl = lists.flatMap((group) => group.options.filter((option) => option.selected).map((option) => keyOf(group, option))).join("\u0001");
  const [ticked, setTicked] = useState(() => new Set(fromUrl ? fromUrl.split("\u0001") : []));
  const [seen, setSeen] = useState(fromUrl);
  if (seen !== fromUrl) {
    setSeen(fromUrl);
    setTicked(new Set(fromUrl ? fromUrl.split("\u0001") : []));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget)) {
      const text = typeof value === "string" ? value.trim() : "";
      if (!text || (key === "sort" && text === "featured")) continue;
      // The ends of the slider mean "no limit".
      if (price && key === "min" && Number(text) <= price.min) continue;
      if (price && key === "max" && Number(text) >= price.max) continue;
      params.append(key, text);
    }
    const query = params.toString();
    router.push(query ? `${action}?${query}` : action, { scroll: false });
  }

  function toggle(key: string, on: boolean, form: HTMLFormElement | null) {
    setTicked((before) => {
      const next = new Set(before);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
    form?.requestSubmit();
  }

  const list = (group: FilterGroup) => {
    if (group.options.length === 0) return null;
    const selectedAt = group.options.findIndex((option) => option.selected);
    const shown =
      selectedAt >= VISIBLE ? [...group.options.slice(0, VISIBLE - 1), group.options[selectedAt]] : group.options.slice(0, VISIBLE);
    const rest = group.options.filter((option) => !shown.includes(option));
    const box = (option: FilterOption) => {
      const key = keyOf(group, option);
      return (
        <li key={key}>
          <Checkbox
            size="sm"
            name={group.name}
            value={option.value}
            checked={ticked.has(key)}
            onChange={(event) => toggle(key, event.currentTarget.checked, event.currentTarget.form)}
            label={<bdi>{option.label}</bdi>}
            trailing={<span className="num">{option.count}</span>}
          />
        </li>
      );
    };
    return (
      <fieldset key={group.name} className="m-0 min-w-0 border-0 p-0">
        <legend className={legendClasses}>{group.label}</legend>
        <ul>{shown.map(box)}</ul>
        {rest.length > 0 ? (
          <details className="group/more">
            <summary className="flex min-h-8 w-fit cursor-pointer list-none items-center text-small font-semibold text-ink underline underline-offset-4 marker:hidden pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
              <span className="group-open/more:hidden">{fmt(labels.showMore, { count: rest.length })}</span>
              <span className="hidden group-open/more:inline">{labels.showLess}</span>
            </summary>
            <ul>{rest.map(box)}</ul>
          </details>
        ) : null}
      </fieldset>
    );
  };

  return (
    <form ref={formRef} action={action} method="get" onSubmit={onSubmit} className="grid gap-5">
      {keep.map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {top.map(list)}
      {price ? (
        <div role="group" aria-labelledby={`${id}-price`}>
          <p id={`${id}-price`} className={legendClasses}>
            {labels.priceRange}
          </p>
          <RangeSlider
            min={price.min}
            max={price.max}
            value={price.value}
            names={["min", "max"]}
            labels={[labels.minPrice, labels.maxPrice]}
            format={(n) => formatMoney(String(n), price.currency, 0)}
            onCommit={() => formRef.current?.requestSubmit()}
            className="mt-2.5"
          />
        </div>
      ) : null}
      {groups.map(list)}
      <noscript>
        <Button type="submit" size="sm">
          {labels.apply}
        </Button>
      </noscript>
      {clearHref ? (
        <DialogLink href={clearHref} scroll={false} className="inline-flex min-h-8 w-fit items-center text-small font-semibold text-ink underline underline-offset-4 pointer-coarse:min-h-11">
          {labels.clear}
        </DialogLink>
      ) : null}
    </form>
  );
}

/** Calls `onChange` whenever the dialog with this id opens or closes (its `open` attribute). */
function watchOpen(dialogId: string, onChange: () => void): () => void {
  const dialog = document.getElementById(dialogId);
  if (!dialog) return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(dialog, { attributes: true, attributeFilter: ["open"] });
  return () => observer.disconnect();
}

const isOpen = (dialogId: string) => document.getElementById(dialogId)?.hasAttribute("open") ?? false;
const closedOnServer = () => false;

/**
 * The filter form inside the phone drawer: nothing until the dialog `dialogId` first opens, then the form, kept mounted
 * (closed and opened again, it shows the same state at once). Mounting on open keeps a second copy of the form out of
 * the page's HTML (plan P3.4). The open attribute is watched, so it does not matter what opened the dialog; React renders
 * the form in the same task, before the opened dialog is painted. Open the drawer with a click handler only
 * (`DialogTrigger native={false}`): before hydration it would be empty.
 */
export function LazyListFilters({ dialogId, ...props }: ListFiltersProps & { dialogId: string }) {
  const subscribe = useCallback((onChange: () => void) => watchOpen(dialogId, onChange), [dialogId]);
  const open = useSyncExternalStore(subscribe, () => isOpen(dialogId), closedOnServer);
  const [mounted, setMounted] = useState(false);
  if (open && !mounted) setMounted(true);
  return mounted ? <ListFilters {...props} /> : null;
}
