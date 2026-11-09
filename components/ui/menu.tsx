"use client";
// Menu: a button that opens a small panel of links and actions (account menu, row actions). Uses the native Popover
// API (`popover="auto"`): the browser handles light-dismiss (click outside), Esc, the top layer and returning focus,
// so there is almost no JavaScript. It is a disclosure, not an ARIA "menu": items are plain links and buttons in the
// tab order; Up/Down/Home/End also move between them.
import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export type MenuProps = {
  /** Accessible name of the trigger button (e.g. "Account menu"). */
  label: string;
  /** What the trigger shows: an avatar, text, an icon. */
  trigger: ReactNode;
  /** Show a chevron after the trigger content. */
  chevron?: boolean;
  /** Which edge of the trigger the panel lines up with: `end` (default) or `start`. */
  align?: "start" | "end";
  /** Panel width in px (default 256). */
  width?: number;
  /** Classes for the trigger button; they REPLACE the default ghost look (min height 44px, padding, hover). */
  triggerClassName?: string;
  /** MenuItem, MenuLabel, MenuSeparator, or any content. */
  children: ReactNode;
};

/** A popover menu. Clicking any link or button inside closes it. */
export function Menu({ label, trigger, chevron, align = "end", width = 256, triggerClassName, children }: MenuProps) {
  const id = `m${useId().replace(/:/g, "")}`;
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  // The panel is in the top layer, so it is positioned from the trigger's rectangle when it opens.
  function place() {
    const el = panel.current;
    const btn = button.current;
    if (!el || !btn) return;
    const rect = btn.getBoundingClientRect();
    const rtl = getComputedStyle(btn).direction === "rtl";
    const w = Math.min(width, window.innerWidth - 16);
    const alignRight = (align === "end") !== rtl;
    const left = Math.max(8, Math.min(alignRight ? rect.right - w : rect.left, window.innerWidth - w - 8));
    const top = rect.bottom + 6;
    el.style.width = `${w}px`;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.maxHeight = `${Math.max(160, window.innerHeight - top - 12)}px`;
  }

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event.type === "scroll" && event.target instanceof Node && panel.current?.contains(event.target)) return;
      try {
        panel.current?.hidePopover();
      } catch {
        /* already closed */
      }
    };
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = Array.from(panel.current?.querySelectorAll<HTMLElement>("a[href], button:not(:disabled)") ?? []);
    if (items.length === 0) return;
    event.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLElement);
    let next = 0;
    if (event.key === "ArrowDown") next = (at + 1) % items.length;
    else if (event.key === "ArrowUp") next = (at - 1 + items.length) % items.length;
    else if (event.key === "End") next = items.length - 1;
    items[next].focus();
  }

  return (
    <div className="inline-flex">
      <button
        ref={button}
        type="button"
        popoverTarget={id}
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onKeyDown={(event) => {
          // ArrowDown on the trigger opens the panel and moves into it, as people expect from a menu button.
          if (event.key !== "ArrowDown") return;
          event.preventDefault();
          const el = panel.current;
          if (!el) return;
          if (!el.matches(":popover-open")) el.showPopover();
          requestAnimationFrame(() => el.querySelector<HTMLElement>("a[href], button:not(:disabled)")?.focus());
        }}
        className={
          triggerClassName ??
          "relative inline-flex min-h-11 items-center gap-2 rounded-control px-2 text-ink transition-colors hover:bg-surface-sunken"
        }
      >
        {trigger}
        {chevron ? (
          <ChevronDown aria-hidden="true" className={cn("size-4 text-ink-subtle transition-transform max-sm:hidden", open && "rotate-180")} />
        ) : null}
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        className="popover-menu"
        onBeforeToggle={(e) => {
          if (e.newState === "open") place();
        }}
        onToggle={(e) => setOpen(e.newState === "open")}
        onKeyDown={onKeyDown}
        onClick={(e) => {
          if (e.target instanceof Element && e.target.closest("a[href], button, [data-menu-close]")) {
            try {
              panel.current?.hidePopover();
            } catch {
              /* already closed */
            }
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

const itemClasses =
  "flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-start text-body font-medium transition-colors " +
  "hover:bg-surface-muted focus-visible:bg-surface-muted [&_svg]:size-[18px] [&_svg]:shrink-0 [&_svg]:text-ink-muted";

export type MenuItemProps = {
  /** Icon (lucide element) before the text. */
  icon?: ReactNode;
  /** When set the item is a link (next/link); otherwise it is a button. */
  href?: string;
  /** Click handler for button items. */
  onClick?: () => void;
  /** `danger` colours destructive items red. */
  tone?: "default" | "danger";
  disabled?: boolean;
  children: ReactNode;
};

/** A link (with `href`) or button (with `onClick`) row inside a Menu. */
export function MenuItem({ icon, href, onClick, tone = "default", disabled, children }: MenuItemProps) {
  const classes = cn(itemClasses, tone === "danger" ? "text-danger-ink [&_svg]:text-danger-ink" : "text-ink", disabled && "pointer-events-none opacity-50");
  if (href) {
    return (
      <Link href={href} className={classes}>
        {icon}
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={classes}>
      {icon}
      {children}
    </button>
  );
}

/** A non-interactive heading row inside a Menu (the signed-in name and role). */
export function MenuLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-3 py-2", className)}>{children}</div>;
}

/** A thin line between groups of items. */
export function MenuSeparator() {
  return <hr className="my-1.5 h-px border-0 bg-line" />;
}
