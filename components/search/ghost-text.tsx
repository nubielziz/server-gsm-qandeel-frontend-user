"use client";
// GhostText: the grey completion drawn after the typed text of the search box (backend plan 29 §7 "Ghost"). Visual only
// (`aria-hidden`): its whole phrase is the first Suggestions option, which is what assistive technology hears. It lies
// over the field, with the field's own font, padding and border copied from its computed style, and repeats the typed
// text invisibly so the ghost starts exactly where the text ends (trailing spaces and case kept). The combobox only
// draws it when it fits (no overflow), the caret is at the end and a Tab key exists (fine pointer).
import type { CSSProperties } from "react";

/** The field's text metrics the overlay copies (read once from the field's computed style). */
export type GhostMetrics = CSSProperties;

/** Reads the overlay's metrics from the field: font, letter spacing, line height, inline padding plus border. */
export function ghostMetrics(field: HTMLInputElement): GhostMetrics {
  const style = getComputedStyle(field);
  const px = (value: string) => Number.parseFloat(value) || 0;
  const rtl = style.direction === "rtl";
  const start = rtl ? px(style.paddingRight) + px(style.borderRightWidth) : px(style.paddingLeft) + px(style.borderLeftWidth);
  const end = rtl ? px(style.paddingLeft) + px(style.borderLeftWidth) : px(style.paddingRight) + px(style.borderRightWidth);
  return {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    letterSpacing: style.letterSpacing,
    lineHeight: style.lineHeight,
    paddingInlineStart: `${start}px`,
    paddingInlineEnd: `${end}px`,
  };
}

export type GhostTextProps = {
  /** The raw text of the field. */
  value: string;
  /** What to draw after it; "" draws nothing. */
  ghost: string;
  metrics: GhostMetrics;
};

/** The overlay itself; render it inside the field's positioned wrapper (`[data-search-enhance]`). */
export function GhostText({ value, ghost, metrics }: GhostTextProps) {
  if (!ghost) return null;
  return (
    <span
      aria-hidden="true"
      data-search-ghost=""
      className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre text-ink-subtle select-none"
      style={metrics}
    >
      <span className="invisible">{value}</span>
      <span>{ghost}</span>
    </span>
  );
}
