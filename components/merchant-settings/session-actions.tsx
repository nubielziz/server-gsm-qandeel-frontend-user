"use client";
// End one session (DELETE /client/sessions/:id). Another device's session ends right away; the current session asks
// first, because it signs this browser out: the API clears the cookies and we go to the sign-in page.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { api, forgetCsrf } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import { pathOf } from "@/lib/api/query";
import { useErrorText } from "@/lib/i18n/error-text";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

type Props = {
  id: number;
  current: boolean;
  signInHref: string;
  t: { end: string; ending: string; signOut: string; confirmTitle: string; confirmText: string; cancel: string; ended: string };
};

export function SessionActions({ id, current, signInHref, t }: Props) {
  const router = useRouter();
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);

  async function end() {
    setBusy(true);
    setFailure(null);
    try {
      await api.delete(pathOf("/client/sessions/:id", { id }));
    } catch (error) {
      // 404: already ended elsewhere: the goal is reached. Anything else is shown.
      if (!(isApiError(error) && error.status === 404)) {
        const text = errorText.message(error);
        if (current) setFailure(text);
        else toast.error(text);
        setBusy(false);
        return;
      }
    }
    if (current) {
      forgetCsrf("client");
      router.replace(signInHref);
      return;
    }
    toast.success(t.ended);
    startRefresh(() => router.refresh());
    setBusy(false);
  }

  if (!current) {
    return (
      <Button size="sm" variant="secondary" loading={busy || refreshing} onClick={end}>
        {t.end}
      </Button>
    );
  }
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        {t.signOut}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title={t.confirmTitle}
        description={t.confirmText}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
              {t.cancel}
            </Button>
            <Button loading={busy} onClick={end}>
              {t.signOut}
            </Button>
          </>
        }
      >
        {failure ? (
          <p role="alert" className="text-small font-medium text-danger-ink">
            {failure}
          </p>
        ) : null}
      </Modal>
    </>
  );
}
