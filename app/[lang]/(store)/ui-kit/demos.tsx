"use client";
// Client-side demos for the UI kit page only: things that need state or event handlers.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

/** Buttons that fire each toast tone. */
export function ToastDemo({ labels }: { labels: { success: string; error: string; info: string; warning: string; body: string } }) {
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="secondary" onClick={() => toast.success(labels.success, labels.body)}>
        {labels.success}
      </Button>
      <Button variant="secondary" onClick={() => toast.error(labels.error, labels.body)}>
        {labels.error}
      </Button>
      <Button variant="secondary" onClick={() => toast.info(labels.info)}>
        {labels.info}
      </Button>
      <Button variant="secondary" onClick={() => toast.warning(labels.warning)}>
        {labels.warning}
      </Button>
    </div>
  );
}

/** A Modal driven by React state (the controlled way). */
export function ControlledModalDemo({
  open: openLabel,
  title,
  text,
  confirm,
  cancel,
}: {
  open: string;
  title: string;
  text: string;
  confirm: string;
  cancel: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {openLabel}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {cancel}
            </Button>
            <Button variant="danger" onClick={() => setOpen(false)}>
              {confirm}
            </Button>
          </>
        }
      >
        <p className="text-body text-ink-muted">{text}</p>
      </Modal>
    </>
  );
}
