"use client";
// SuggestionList: the listbox of the header search combobox (ARIA 1.2 listbox with labelled groups, backend plan 29 §7).
// Focus stays in the text box; the active option is `aria-activedescendant` and `aria-selected`. Options that lead
// somewhere are real links (`role="option"`, out of the tab order, never prefetched: only the combobox prefetches the
// first service), so a middle click or a long press still opens a new tab. A mouse press on the panel keeps the focus in
// the box. On phones each phrase has a 44 px fill arrow: an `aria-hidden` span with its own click handler (not a button:
// interactive content inside an option would be hidden from assistive technology), which puts the phrase in the box.
import Link from "next/link";
import { getImageProps } from "next/image";
import { Fragment, type MouseEvent } from "react";
import { ArrowUpLeft, Clock, ScanSearch, Search, SpellCheck, TrendingUp, X } from "lucide-react";
import type { SuggestFilter, SuggestService } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";
import { servicePicture } from "@/lib/logo-names";
import { highlightParts } from "@/lib/search/highlight";
import { clientLogo } from "@/lib/search/logo-client";
import { completionParts, isPhrase, optionHref, type OptionGroup, type SearchOption, type SearchPaths } from "@/lib/search/options";

/** The texts the list draws (server strings, passed down as props). */
export type SuggestionListLabels = {
  /** The listbox's name ("Search services"). */
  label: string;
  suggestions: string;
  services: string;
  filters: string;
  recent: string;
  clearRecent: string;
  popular: string;
  /** "Fill in {text}" (the fill arrow's tooltip). */
  fill: string;
  /** "Check IMEI {imei}" */
  imei: string;
  /** "Did you mean {q}?" */
  didYouMean: string;
  taxNote: string;
  /** "Country: {name}" and the same for the other filter kinds. */
  country: string;
  brand: string;
  network: string;
  category: string;
  inStock: string;
  onRequest: string;
};

export type SuggestionListProps = {
  /** The listbox id (the field's `aria-controls`). */
  id: string;
  groups: OptionGroup[];
  /** The index (in display order over every group) of the active option, or null. */
  active: number | null;
  /** The id of the option at an index (the field's `aria-activedescendant`). */
  optionId: (index: number) => string;
  /** The typed text (completions show the typed part plain). */
  value: string;
  paths: SearchPaths;
  labels: SuggestionListLabels;
  /** A phone: the fill arrows show. */
  coarse: boolean;
  /** A click on an option (its link navigates by itself; "Clear recent searches" only acts). */
  onPick: (index: number, event: MouseEvent<HTMLElement>) => void;
  /** A click on a phrase's fill arrow. */
  onFill: (index: number) => void;
};

const GROUP_LABELS = {
  imei: null,
  suggestions: "suggestions",
  services: "services",
  filters: "filters",
  recent: "recent",
  popular: "popular",
} as const;

const optionClasses =
  "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-control px-2.5 py-1.5 text-start text-body text-ink " +
  "hover:bg-surface-muted aria-selected:bg-surface-sunken";

/** The words a filter chip says: "Brand: Samsung", "Country: United Kingdom". */
export function filterText(filter: SuggestFilter, labels: Pick<SuggestionListLabels, "brand" | "network" | "country" | "category">): string {
  // A label that already names its kind ("Country: United Kingdom") is used as it is.
  if (/^[^:]{1,20}:\s/.test(filter.label)) return filter.label;
  return fmt(labels[filter.kind], { name: filter.label });
}

/** The picture of a service row: its own picture through the image optimizer (40 px), else a plain surface. */
function ServicePicture({ service }: { service: SuggestService }) {
  const picture = servicePicture(service.imageUrl);
  if (!picture) return <span aria-hidden="true" className="size-10 shrink-0 rounded-control bg-surface-sunken" />;
  const { props } = getImageProps({ src: picture, alt: "", width: 40, height: 40, quality: 75 });
  // eslint-disable-next-line @next/next/no-img-element -- getImageProps gives the optimizer's srcset without the Image component's client code.
  return <img {...props} alt="" loading="lazy" decoding="async" className="size-10 shrink-0 rounded-control bg-surface-sunken object-cover" />;
}

function BrandLogo({ name }: { name: string }) {
  const logo = clientLogo("brands", name);
  if (!logo) return name ? <span className="truncate">{name}</span> : null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a static logo file at its recorded size; no optimizer needed.
    <img src={logo.src} width={logo.width} height={logo.height} alt={name} loading="lazy" decoding="async" className="h-4 w-auto max-w-[5rem] object-contain" />
  );
}

function ServiceRow({ service, labels }: { service: SuggestService; labels: SuggestionListLabels }) {
  const parts = highlightParts(service.title, service.titleHighlight);
  const price = formatMoney(service.price.gross, service.price.currency, "en");
  return (
    <>
      <ServicePicture service={service} />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="truncate font-medium">
          {parts.map((part, i) =>
            part.mark ? (
              <mark key={i} className="bg-transparent font-bold text-ink">
                {part.text}
              </mark>
            ) : (
              <span key={i}>{part.text}</span>
            ),
          )}
        </span>
        <span className="flex min-w-0 items-center gap-2 text-small text-ink-muted">
          <BrandLogo name={service.brand} />
          <span className={cn("shrink-0", service.availability === "in_stock" && "text-success-ink")}>
            {service.availability === "in_stock" ? labels.inStock : labels.onRequest}
          </span>
        </span>
      </span>
      <span className="num shrink-0 text-body font-semibold">{price}</span>
    </>
  );
}

function PhraseRow({ option, value, labels }: { option: Extract<SearchOption, { text: string }>; value: string; labels: SuggestionListLabels }) {
  const Icon = option.kind === "recent" ? Clock : option.kind === "popular" ? TrendingUp : option.kind === "didYouMean" ? SpellCheck : Search;
  let text;
  if (option.kind === "didYouMean") {
    const [before, after = ""] = labels.didYouMean.split("{q}");
    text = (
      <>
        {before}
        <strong className="font-bold">{option.text}</strong>
        {after}
      </>
    );
  } else if (option.kind === "completion") {
    const { typed, rest } = completionParts(option.text, value);
    text = (
      <>
        {typed}
        <strong className="font-bold">{rest}</strong>
      </>
    );
  } else {
    text = option.text;
  }
  return (
    <>
      <Icon aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" />
      <span className="min-w-0 flex-1 truncate">{text}</span>
    </>
  );
}

/** One option's content. */
function OptionBody({ option, value, labels }: { option: SearchOption; value: string; labels: SuggestionListLabels }) {
  switch (option.kind) {
    case "service":
      return <ServiceRow service={option.service} labels={labels} />;
    case "filter":
      return (
        <>
          <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-line-strong px-3 py-1 text-small font-medium">
            <span className="truncate">{filterText(option.filter, labels)}</span>
            {option.filter.count > 0 ? <span className="num text-ink-subtle">({option.filter.count})</span> : null}
          </span>
        </>
      );
    case "imei":
      return (
        <>
          <ScanSearch aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" />
          <span className="min-w-0 flex-1 truncate font-medium">{fmt(labels.imei, { imei: option.imei })}</span>
        </>
      );
    case "clearRecent":
      return (
        <>
          <X aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" />
          <span className="min-w-0 flex-1 truncate text-small font-semibold text-ink-muted">{labels.clearRecent}</span>
        </>
      );
    default:
      return <PhraseRow option={option} value={value} labels={labels} />;
  }
}

/** The listbox: labelled groups of options (no group heading for the single IMEI option). */
export function SuggestionList({ id, groups, active, optionId, value, paths, labels, coarse, onPick, onFill }: SuggestionListProps) {
  // Where each group's options start in the flat order (the arrows walk all groups as one list).
  const starts: number[] = [];
  for (let i = 0, at = 0; i < groups.length; at += groups[i].options.length, i++) starts.push(at);
  return (
    <div id={id} role="listbox" aria-label={labels.label} className="grid gap-1">
      {groups.map((group, g) => {
        const name = GROUP_LABELS[group.key];
        const headingId = `${id}-${group.key}`;
        const options = group.options.map((option, i) => {
          const at = starts[g] + i;
          const selected = active === at;
          const href = optionHref(option, value, paths);
          const common = {
            id: optionId(at),
            role: "option" as const,
            "aria-selected": selected,
            tabIndex: -1,
            className: cn(optionClasses, option.kind === "filter" && "py-1"),
            onClick: (event: MouseEvent<HTMLElement>) => onPick(at, event),
          };
          const fill =
            coarse && isPhrase(option) ? (
              <span
                aria-hidden="true"
                title={fmt(labels.fill, { text: option.text })}
                className="-me-2.5 grid size-11 shrink-0 place-items-center text-ink-subtle"
                onClick={(event) => {
                  // The arrow fills the box; the option's link must not navigate.
                  event.preventDefault();
                  event.stopPropagation();
                  onFill(at);
                }}
              >
                <ArrowUpLeft className="size-4 rtl:-scale-x-100" />
              </span>
            ) : null;
          return href ? (
            <Link key={at} href={href} prefetch={false} {...common}>
              <OptionBody option={option} value={value} labels={labels} />
              {fill}
            </Link>
          ) : (
            <div key={at} {...common}>
              <OptionBody option={option} value={value} labels={labels} />
            </div>
          );
        });
        // The IMEI option stands alone: a group of one needs no heading.
        if (!name) return <Fragment key={group.key}>{options}</Fragment>;
        return (
          <div key={group.key} role="group" aria-labelledby={headingId} className="grid">
            <div id={headingId} role="presentation" className="px-2.5 pb-1 pt-2 text-caption font-semibold uppercase tracking-wide text-ink-subtle">
              {labels[name]}
            </div>
            {options}
          </div>
        );
      })}
    </div>
  );
}
