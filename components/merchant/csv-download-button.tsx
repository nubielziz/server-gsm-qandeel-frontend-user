"use client";
// Downloads a CSV from the API (fetch + blob, the file name comes from Content-Disposition) and saves it.
// The query is plain data from the server page, so it already holds only what the export route declares.
import { useState } from "react";
import { Download } from "lucide-react";
import { api } from "@/lib/api/browser";
import type { QueryInput } from "@/lib/api/query";
import { useRouter } from "next/navigation";
import { useErrorText } from "@/lib/i18n/error-text";
import { leaveIfSignedOut } from "@/lib/merchant/signed-out";
import { Button, type ButtonProps } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

export type CsvDownloadButtonProps = {
  /** `/client/orders/export`, `/client/prices/export`, `/client/wallet/statement`. */
  path: string;
  fallbackName: string;
  query?: QueryInput;
  label: string;
  busyLabel: string;
  /** Toast title when the download fails. */
  failedLabel: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
};

export function CsvDownloadButton({ path, fallbackName, query, label, busyLabel, failedLabel, variant = "secondary", size }: CsvDownloadButtonProps) {
  const router = useRouter();
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      await api.download(path, fallbackName, { query });
    } catch (error) {
      if (leaveIfSignedOut(error, router)) return;
      toast.error(failedLabel, [errorText.message(error), errorText.reference(error)].filter(Boolean).join(" "));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant={variant} size={size} loading={busy} onClick={download} startIcon={<Download aria-hidden="true" />} aria-label={busy ? busyLabel : undefined}>
      {label}
    </Button>
  );
}
