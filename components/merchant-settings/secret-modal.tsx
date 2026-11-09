"use client";
// Shows a secret exactly once (API key `gsm_…`, webhook signing secret `whsec_…`) with a clear warning and a copy
// button. The secret lives only in the parent's state: nothing stores it, and the API cannot show it again.
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Modal } from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  warning: string;
  /** What the secret belongs to, e.g. "Key: Production". */
  subject: string;
  secret: string;
  done: string;
};

export function SecretModal({ open, onClose, title, warning, subject, secret, done }: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <Button
          onClick={(e) => {
            e.currentTarget.closest("dialog")?.close();
          }}
        >
          {done}
        </Button>
      }
    >
      <div className="grid gap-4">
        <Alert tone="warning">{warning}</Alert>
        <div className="grid gap-2">
          <p className="text-small font-semibold text-ink" dir="auto">
            {subject}
          </p>
          <code dir="ltr" className="select-all break-all rounded-control bg-surface-sunken px-3 py-3 font-mono text-small text-ink">
            {secret}
          </code>
          <div>
            <CopyButton value={secret} />
          </div>
        </div>
      </div>
    </Modal>
  );
}
