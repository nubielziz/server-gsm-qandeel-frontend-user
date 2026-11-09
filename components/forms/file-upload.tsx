"use client";
// Uploads files to `POST /client/files` (merchant session; one multipart part `file`, 1 B – 25 MiB, 20/min per IP)
// and reports the stored files (`{ id, filename, size, mime … }`) so a form can send their ids as `fileId` (orders),
// `fileIds` (KYC, 1–5 PDF/JPEG/PNG) or a receipt `fileId` (invoices). Labels come from the caller (server strings).
import { useId, useRef, useState } from "react";
import { FileUp, Loader2, Trash2 } from "lucide-react";
import { api } from "@/lib/api/browser";
import type { UploadedFile } from "@/lib/api/types";
import { useErrorText } from "@/lib/i18n/error-text";

const MAX_BYTES = 25 * 1024 * 1024;

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
  /** Called with the full list of uploaded files after every change. */
  onChange: (files: UploadedFile[]) => void;
  /** MIME types accepted, e.g. ["application/pdf", "image/jpeg", "image/png"]; empty = any. */
  accept?: string[];
  /** Maximum number of files (1 = single file). */
  max?: number;
  required?: boolean;
  disabled?: boolean;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function FileUpload({ labels, onChange, accept = [], max = 1, required, disabled }: FileUploadProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const errorText = useErrorText();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(next: UploadedFile[]) {
    setFiles(next);
    onChange(next);
  }

  async function onPick(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    const picked = Array.from(list).slice(0, Math.max(0, max - files.length));
    const uploaded: UploadedFile[] = [];
    setBusy(true);
    try {
      for (const file of picked) {
        if (file.size > MAX_BYTES || file.size === 0) {
          setError(labels.tooLarge);
          continue;
        }
        if (accept.length > 0 && !accept.includes(file.type)) {
          setError(labels.wrongType);
          continue;
        }
        uploaded.push(await api.upload<UploadedFile>("/client/files", file));
      }
    } catch (e) {
      setError(errorText.message(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
      if (uploaded.length > 0) update([...files, ...uploaded]);
    }
  }

  const describedBy = [labels.hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  const full = files.length >= max;

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
          multiple={max > 1}
          disabled={disabled || busy || full}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          onChange={(e) => onPick(e.currentTarget.files)}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={disabled || busy || full}
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
      {files.length > 0 ? (
        <ul className="divide-y divide-line rounded-card border border-line bg-surface">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 truncate" dir="auto">
                {f.filename} <span className="text-ink-subtle">· {formatSize(f.size)}</span>
              </span>
              <button
                type="button"
                onClick={() => update(files.filter((x) => x.id !== f.id))}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-surface-muted hover:text-ink"
                aria-label={`${labels.remove}: ${f.filename}`}
              >
                <Trash2 aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
