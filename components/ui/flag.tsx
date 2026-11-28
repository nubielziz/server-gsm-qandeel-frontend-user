"use client";
// Flag: the round flag of a country, before its name in a country list and inside a phone box. The pictures are the files of
// `public/images/flags` (`<iso code>.svg`, the "circle-flags" set, MIT: docs/LOGOS.md), one per country of `lib/countries.ts`;
// they are vector files, so the image optimizer is skipped. A flag only decorates a name that is written next to it (or a button that has
// its own name), so it has no alternative text. A code that has no file shows a globe icon instead of a broken picture.
import Image from "next/image";
import { useState } from "react";
import { Globe } from "lucide-react";
import { cn } from "@/lib/cn";

export type FlagProps = {
  /** ISO 3166-1 alpha-2 code, any case. */
  code: string;
  /** Width and height in px (default 20). */
  size?: number;
  className?: string;
};

export function Flag({ code, size = 20, className }: FlagProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const file = code.toLowerCase();
  if (!/^[a-z]{2}$/.test(file) || failed === file) {
    return <Globe aria-hidden="true" width={size} height={size} className={cn("shrink-0 text-ink-subtle", className)} />;
  }
  return (
    <Image
      src={`/images/flags/${file}.svg`}
      alt=""
      width={size}
      height={size}
      unoptimized
      className={cn("shrink-0 rounded-full", className)}
      onError={() => setFailed(file)}
    />
  );
}
