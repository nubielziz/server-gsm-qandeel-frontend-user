// What a ticket message may carry (feature 28, backend plan §2 rule 8): PDF, JPEG or PNG, 1 byte to 5 MiB, at most 5 files
// a message. The server checks the content too; this only spares a doomed upload and says why. Files are never shown
// inline: a message lists them as download links. Safe to import anywhere.
import { formatNumber } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
const EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"] as const;

/** The `accept` of the file input: the types and their extensions (some systems give a file no type). */
export const ATTACHMENT_ACCEPT = [...TYPES, ...EXTENSIONS].join(",");

/** Why a file cannot be attached; the words are the API's field codes (`type`, `empty`, `too_large`). */
export type AttachmentProblem = "type" | "empty" | "too_large";

/**
 * Whether a picked file may be uploaded, or the reason it may not. The type is the browser's; a file with no type is
 * judged by its extension. The order matters: a wrong type is reported before its size.
 */
export function attachmentProblem(file: { name: string; type: string; size: number }): AttachmentProblem | null {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  const allowed = type === "" ? EXTENSIONS.some((extension) => name.endsWith(extension)) : (TYPES as readonly string[]).includes(type);
  if (!allowed) return "type";
  if (file.size <= 0) return "empty";
  if (file.size > MAX_ATTACHMENT_BYTES) return "too_large";
  return null;
}

/** "340 KB", "1.2 MB" in the page's language (1 KB = 1024 bytes, as the 5 MB limit is). */
export function formatFileSize(bytes: number, locale: Locale): string {
  if (bytes < 1024) return formatNumber(bytes, locale, { style: "unit", unit: "byte", unitDisplay: "short" });
  if (bytes < 1024 * 1024) return formatNumber(Math.round(bytes / 1024), locale, { style: "unit", unit: "kilobyte", unitDisplay: "short" });
  return formatNumber(Math.round((bytes / (1024 * 1024)) * 10) / 10, locale, {
    style: "unit",
    unit: "megabyte",
    unitDisplay: "short",
    maximumFractionDigits: 1,
  });
}

/** A file in the box under the reply: being uploaded, uploaded (its id goes in `fileIds`), or refused with a reason. */
export type Chip = {
  key: number;
  name: string;
  size: number;
  status: "uploading" | "done" | "error";
  /** The id of the uploaded file; null until it is. */
  fileId: number | null;
  /** The text under the name when the file was refused, in the page's language. */
  error: string | null;
};

export type ChipAction =
  | { type: "add"; chips: Chip[] }
  | { type: "done"; key: number; fileId: number }
  | { type: "fail"; key: number; error: string }
  | { type: "remove"; key: number }
  | { type: "clear" };

export function chipsReducer(chips: Chip[], action: ChipAction): Chip[] {
  switch (action.type) {
    case "add":
      return [...chips, ...action.chips];
    case "done":
      return chips.map((chip) => (chip.key === action.key ? { ...chip, status: "done", fileId: action.fileId, error: null } : chip));
    case "fail":
      return chips.map((chip) => (chip.key === action.key ? { ...chip, status: "error", fileId: null, error: action.error } : chip));
    case "remove":
      return chips.filter((chip) => chip.key !== action.key);
    case "clear":
      return [];
  }
}

/** Files that count against the limit of five: the ones uploading or uploaded (a refused one does not). */
export function activeChips(chips: readonly Chip[]): number {
  return chips.filter((chip) => chip.status !== "error").length;
}

/** The ids to send as `fileIds`, in the order the files were picked. */
export function uploadedIds(chips: readonly Chip[]): number[] {
  const ids: number[] = [];
  for (const chip of chips) if (chip.status === "done" && chip.fileId !== null) ids.push(chip.fileId);
  return ids;
}

/**
 * What to do with files the visitor just picked, by index: upload the good ones (while there is room for five in all),
 * show the others as refused chips with their reason, and say so when some were left out for the limit.
 */
export function planPicks(
  activeCount: number,
  files: readonly { name: string; type: string; size: number }[],
): { accepted: number[]; rejected: { index: number; problem: AttachmentProblem }[]; overflow: boolean } {
  const accepted: number[] = [];
  const rejected: { index: number; problem: AttachmentProblem }[] = [];
  let overflow = false;
  files.forEach((file, index) => {
    const problem = attachmentProblem(file);
    if (problem) rejected.push({ index, problem });
    else if (activeCount + accepted.length >= MAX_ATTACHMENTS) overflow = true;
    else accepted.push(index);
  });
  return { accepted, rejected, overflow };
}

/** A message may go out when it has text or at least one uploaded file, and no file is still uploading. */
export function canSend(body: string, chips: readonly Chip[]): { ok: boolean; waiting: boolean } {
  const waiting = chips.some((chip) => chip.status === "uploading");
  const hasContent = body.trim() !== "" || chips.some((chip) => chip.status === "done");
  return { ok: hasContent && !waiting, waiting };
}
