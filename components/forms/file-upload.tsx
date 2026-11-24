"use client";
// Uploads files to the file route of the account's family: `POST /client/files` (a merchant rank, 1 B – 25 MiB) or
// `POST /store/v1/files` (a retail account, top-up receipt, 1 B – 5 MiB, 413 above): one multipart part `file`, 20/min per IP.
// It reports the stored files (`{ id, filename, size, mime … }`, the same shape on both routes) so a form can send its id as
// `fileId` (orders, receipts). One file at a time: a chosen file must be removed before another is picked. Labels come from
// the caller (server strings).
import { useId, useRef, useState } from "react";
import { FileUp, Loader2, Trash2 } from "lucide-react";
import { api } from "@/lib/api/browser";
import type { AccountFamily } from "@/lib/account/family";
import { FAMILY_ROUTES } from "@/lib/account/routes";
import type { UploadedFile } from "@/lib/api/types";
import { useErrorText } from "@/lib/i18n/error-text";

/**
 * The largest file of each family's upload route; a form may ask for less with `maxBytes`. The server answers 413
 * PAYLOAD_TOO_LARGE above it.
 */
const FAMILY_MAX_BYTES: Record<AccountFamily, number> = {
  client: 25 * 1024 * 1024,
  store: 5 * 1024 * 1024,
};

export type FileUploadLabels = {
  /** Visible label of the control. */
  label: string;
  /** Button text, e.g. "Choose file". */
  choose: string;
  /** Hint under the control, e.g. "PDF, JPEG or PNG, up to 25 MB". */
  hint?: string;
  uploading: string;
  remove: string;
  tooLarge: string;
  wrongType: string;
};

export type FileUploadProps = {
  labels: FileUploadLabels;
  /** Called with the uploaded file after every change, or null once it is removed. */
  onChange: (file: UploadedFile | null) => void;
  /** MIME types accepted, e.g. ["application/pdf", "image/jpeg", "image/png"]; empty = any. */
  accept?: string[];
  /** The family of the signed-in account: its upload route (`FAMILY_ROUTES[family].files`) and its limit apply. */
  family: AccountFamily;
  /**
   * Largest file in bytes (default: the family's own limit, 25 MiB for `client`, 5 MiB for `store`). A larger file shows
   * `labels.tooLarge` and is not sent.
   */
  maxBytes?: number;
  required?: boolean;
  disabled?: boolean;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function FileUpload({ labels, onChange, accept = [], family, maxBytes, required, disabled }: FileUploadProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const errorText = useErrorText();
  const limit = maxBytes ?? FAMILY_MAX_BYTES[family];
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(next: UploadedFile | null) {
    setFile(next);
    onChange(next);
  }

  async function onPick(list: FileList | null) {
    const picked = list?.[0];
    if (!picked) return;
    setError(null);
    let uploaded: UploadedFile | null = null;
    setBusy(true);
    try {
      if (picked.size > limit || picked.size === 0) setError(labels.tooLarge);
      else if (accept.length > 0 && !accept.includes(picked.type)) setError(labels.wrongType);
      else uploaded = await api.upload<UploadedFile>(FAMILY_ROUTES[family].files, picked);
    } catch (e) {
      setError(errorText.message(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
      if (uploaded) update(uploaded);
    }
  }

  const describedBy = [labels.hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold text-ink">
        {labels.label}
        {required ? <span aria-hidden="true" className="text-danger"> *</span> : null}
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={input}
          id={id}
          type="file"
          className="sr-only"
          accept={accept.join(",") || undefined}
          disabled={disabled || busy || file !== null}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          onChange={(e) => onPick(e.currentTarget.files)}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={disabled || busy || file !== null}
          className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <FileUp aria-hidden className="size-4" />}
          {busy ? labels.uploading : labels.choose}
        </button>
        <span aria-live="polite" className="sr-only">
          {busy ? labels.uploading : ""}
        </span>
      </div>
      {labels.hint ? (
        <p id={`${id}-hint`} className="text-xs text-ink-subtle">
          {labels.hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-danger-ink">
          {error}
        </p>
      ) : null}
      {file ? (
        <ul className="divide-y divide-line rounded-card border border-line bg-surface">
          <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span className="min-w-0 truncate" dir="auto">
              {file.filename} <span className="text-ink-subtle">· {formatSize(file.size)}</span>
            </span>
            <button
              type="button"
              onClick={() => update(null)}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-surface-muted hover:text-ink"
              aria-label={`${labels.remove}: ${file.filename}`}
            >
              <Trash2 aria-hidden className="size-4" />
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
