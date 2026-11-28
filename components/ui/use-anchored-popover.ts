"use client";
// useAnchoredPopover: a panel that opens next to the element it belongs to (the list of a country select, the sign-in panel under
// the header's button). The panel is a native popover (`popover="auto"`): the browser puts it in the top layer, closes it on Esc
// and on a click outside, and gives the focus back. The top layer has no anchor, so the panel is placed from the anchor's
// rectangle when it opens, and again while it is open whenever the page scrolls or the window (or the on-screen keyboard) changes
// size: it follows its anchor instead of closing, because a panel that holds a text box must survive the keyboard opening.
// It opens below the anchor, or above it when there is too little room below and more above. Unlike Menu (menu.tsx) a click
// inside does not close it: the caller closes it (`hide`) when a choice is made.
import { useCallback, useEffect, useRef, useState, type ToggleEvent } from "react";

export type AnchoredPopoverOptions = {
  /** Which edge of the anchor the panel lines up with: `start` (default) or `end`. */
  align?: "start" | "end";
  /** The panel's width in px, or `anchor` (default) for the anchor's own width. */
  width?: number | "anchor";
  /** The least width in px (a narrow anchor still gets a readable list). */
  minWidth?: number;
  /** The most height in px; the room on screen can make it less (the panel then scrolls). */
  maxHeight?: number;
  /** Called after the panel opened or closed. */
  onOpenChange?: (open: boolean) => void;
};

/** The gap between the anchor and the panel, and the least distance from the panel to the edge of the screen. */
const GAP = 6;
const EDGE = 8;

export function useAnchoredPopover<A extends HTMLElement = HTMLElement>({
  align = "start",
  width = "anchor",
  minWidth = 0,
  maxHeight = 640,
  onOpenChange,
}: AnchoredPopoverOptions = {}) {
  const anchor = useRef<A>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const place = useCallback(() => {
    const el = panel.current;
    const at = anchor.current;
    if (!el || !at) return;
    const rect = at.getBoundingClientRect();
    const view = window.visualViewport;
    const viewWidth = window.innerWidth;
    // The part of the page a person sees: smaller than the window while an on-screen keyboard is open.
    const viewBottom = view ? view.offsetTop + view.height : window.innerHeight;
    const w = Math.min(Math.max(width === "anchor" ? rect.width : width, minWidth), viewWidth - EDGE * 2);
    const left = Math.max(EDGE, Math.min(align === "end" ? rect.right - w : rect.left, viewWidth - w - EDGE));
    const below = viewBottom - rect.bottom - GAP - EDGE;
    const above = rect.top - GAP - EDGE;
    const up = below < Math.min(maxHeight, 260) && above > below;
    el.style.width = `${w}px`;
    el.style.left = `${left}px`;
    el.style.top = up ? "auto" : `${rect.bottom + GAP}px`;
    el.style.bottom = up ? `${window.innerHeight - rect.top + GAP}px` : "auto";
    el.style.maxHeight = `${Math.max(160, Math.min(maxHeight, up ? above : below))}px`;
  }, [align, width, minWidth, maxHeight]);

  useEffect(() => {
    if (!open) return;
    const again = () => place();
    const view = window.visualViewport;
    window.addEventListener("resize", again);
    window.addEventListener("scroll", again, true);
    view?.addEventListener("resize", again);
    view?.addEventListener("scroll", again);
    return () => {
      window.removeEventListener("resize", again);
      window.removeEventListener("scroll", again, true);
      view?.removeEventListener("resize", again);
      view?.removeEventListener("scroll", again);
    };
  }, [open, place]);

  /** Opens the panel (nothing happens when it is open). */
  const show = useCallback(() => {
    const el = panel.current;
    if (el && !el.matches(":popover-open")) el.showPopover();
  }, []);

  /** Closes the panel (nothing happens when it is closed). */
  const hide = useCallback(() => {
    const el = panel.current;
    if (el?.matches(":popover-open")) el.hidePopover();
  }, []);

  // React bubbles the two toggle events: a popover inside the panel fires them too, and only the panel's own count.
  const onBeforeToggle = useCallback(
    (event: ToggleEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget && event.newState === "open") place();
    },
    [place],
  );
  const onToggle = useCallback(
    (event: ToggleEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return;
      const opened = event.newState === "open";
      setOpen(opened);
      onOpenChange?.(opened);
    },
    [onOpenChange],
  );

  return {
    /** Put it on the element the panel belongs to. */
    anchor,
    /** Put it on the panel, with `popover="auto"` and the two handlers below. */
    panel,
    open,
    show,
    hide,
    onBeforeToggle,
    onToggle,
  };
}
