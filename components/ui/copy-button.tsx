"use client";
// CopyButton: copies a value to the clipboard and says so ("Copied") for a moment, announced politely.
import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/cn";
import { useUiText } from "./ui-text";

export type CopyButtonProps = {
  /** The text to copy (API key, order token, tracking link …). */
  value: string;
  /** Overrides the "Copy" label. */
  label?: string;
  /** Overrides the "Copied" label. */
  copiedLabel?: string;
  /** Shows only the icon (the label stays as the accessible name). */
  iconOnly?: boolean;
  className?: string;
};

/** A small secondary button that copies `value`; flips to a check and "Copied" for 2 seconds. */
export function CopyButton({ value, label, copiedLabel, iconOnly, className }: CopyButtonProps) {
  const text = useUiText();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context): the value stays visible for manual copy, nothing else to do.
    }
  }

  const shown = copied ? (copiedLabel ?? text.copied) : (label ?? text.copy);
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={iconOnly ? shown : undefined}
      title={iconOnly ? shown : undefined}
      className={cn(
        "relative inline-flex h-10 items-center justify-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-small font-semibold text-ink",
        "touch-target transition-colors hover:bg-surface-muted active:bg-surface-sunken",
        iconOnly && "w-10 px-0",
        className,
      )}
    >
      {copied ? <Check aria-hidden="true" className="size-4 text-success" /> : <Copy aria-hidden="true" className="size-4" />}
      {iconOnly ? null : <span>{shown}</span>}
      <span role="status" className="sr-only">
        {copied ? shown : ""}
      </span>
    </button>
  );
}
