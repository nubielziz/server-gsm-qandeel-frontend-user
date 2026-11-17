// What a delivered order shows as its result on the tracking page. A stocked service answers with its codes one per line in
// `result.code` (BH §14.5); a staff reply is free text. Codes become a numbered list with a Copy button each and "Copy all";
// anything else keeps the single block with one Copy button. A Server Component: only the copy buttons run in the browser.
import { useId } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { formatNumber } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";

/** The import rule of the backend: a code is 6 to 128 characters with no space. */
export const MIN_CODE_LENGTH = 6;
export const MAX_CODE_LENGTH = 128;

/**
 * The most codes shown as a list. A larger order keeps the single block (one Copy button for all of it): hundreds of
 * separate buttons would only slow the page down.
 */
export const MAX_LISTED_CODES = 200;

/**
 * The codes of a result, or `null` when the text is not a list of codes. It is one when it has two or more non-empty lines
 * (Windows and old Mac line ends included) and every line, trimmed, is 6 to 128 characters with no space or other white
 * space inside: a staff reply with words, or a single code, stays one block.
 *
 * @param text `result.code` of the tracked order
 * @param max the most lines still shown as a list
 */
export function splitCodes(text: string, max: number = MAX_LISTED_CODES): string[] | null {
  const lines = text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (lines.length < 2 || lines.length > max) return null;
  for (const line of lines) {
    if (line.length < MIN_CODE_LENGTH || line.length > MAX_CODE_LENGTH || /\s/.test(line)) return null;
  }
  return lines;
}

export type ResultCodesLabels = {
  /** "Your codes" */
  title: string;
  /** "Copy all" */
  copyAll: string;
  /** "Copy code {n}" */
  copyCode: string;
  /** "Copy" (the single block) */
  copy: string;
  /** "Copied" */
  copied: string;
};

export type ResultCodesProps = {
  /** `result.code` of the tracked order (not empty). */
  code: string;
  labels: ResultCodesLabels;
};

/** The result of a delivered order: a list of codes, or the text as one block. */
export function ResultCodes({ code, labels }: ResultCodesProps) {
  const headingId = useId();
  const codes = splitCodes(code);

  if (!codes) {
    return (
      <div className="flex flex-wrap items-start gap-3 rounded-control border border-line bg-surface-muted p-4">
        {/* `wrap-anywhere` (overflow-wrap: anywhere), not `break-words`: only `anywhere` lowers the min-content width, so a long
            code or URL in a staff reply cannot stretch the card past a phone screen. */}
        <pre dir="auto" className="min-w-0 flex-1 whitespace-pre-wrap wrap-anywhere font-mono text-body text-ink">
          {code}
        </pre>
        <CopyButton value={code} label={labels.copy} copiedLabel={labels.copied} />
      </div>
    );
  }

  return (
    <section aria-labelledby={headingId}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id={headingId} className="text-subheading text-ink">
          {labels.title}
        </h3>
        <CopyButton value={codes.join("\n")} label={labels.copyAll} copiedLabel={labels.copied} />
      </div>
      {/* `list-none` drops the list role in Safari: it is given back so the count is still announced. */}
      <ol role="list" className="mt-3 grid list-none gap-2 p-0">
        {codes.map((value, index) => (
          <li key={`${index}-${value}`} className="flex items-center gap-3 rounded-control border border-line bg-surface-muted py-1.5 ps-4 pe-1.5">
            <span aria-hidden="true" className="w-7 shrink-0 text-small text-ink-subtle">
              {formatNumber(index + 1)}
            </span>
            {/* Codes are Latin text: isolated left-to-right, and broken anywhere on a narrow screen. */}
            <div className="min-w-0 flex-1">
              <bdi dir="ltr" className="break-all font-mono text-body text-ink">
                {value}
              </bdi>
            </div>
            <CopyButton
              iconOnly
              value={value}
              label={fmt(labels.copyCode, { n: formatNumber(index + 1) })}
              copiedLabel={labels.copied}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}
