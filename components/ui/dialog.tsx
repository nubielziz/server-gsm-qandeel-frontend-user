"use client";
// Drawer, Modal, DialogTrigger, DialogClose: built on the native <dialog> element, so the browser gives us the focus
// trap, Esc to close, the inert background and the return of focus to the opener. A Drawer slides in from the END side
// (right in English, left in Arabic) as a rounded panel inset from the screen edge; a Modal is centred.
//
// Two ways to use them:
//  - Uncontrolled (works from a Server Component page):
//      <Drawer id="requirements" title="Service requirements">…</Drawer>
//      <DialogTrigger for="requirements">Enter details</DialogTrigger>
//  - Controlled (client forms):  <Drawer open={open} onClose={() => setOpen(false)} …>
// A form that spans the body and the footer buttons can keep them apart: give the form an `id` and the submit button
// `form="that-id"`.
import { useEffect, useId, useRef, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, type ButtonProps } from "./button";
import { IconButton } from "./icon-button";
import { useUiText } from "./ui-text";

type DialogContentProps = {
  /** Element id: lets a `DialogTrigger for="…"` open it. */
  id?: string;
  /** Controlled state. Leave undefined to open it with a `DialogTrigger`. */
  open?: boolean;
  /** Called after the dialog has closed (Esc, backdrop click, close button or `DialogClose`). */
  onClose?: () => void;
  /** Small uppercase line above the title (e.g. "Service requirements"). */
  eyebrow?: ReactNode;
  /** The dialog's accessible name and visible heading. */
  title: ReactNode;
  /** One line under the title. */
  description?: ReactNode;
  /** Sticky bottom bar with the actions. */
  footer?: ReactNode;
  /** Overrides the close button's accessible name (defaults to the language's "Close"). */
  closeLabel?: string;
  /** Classes for the scrolling body. */
  bodyClassName?: string;
  children: ReactNode;
};

type Variant = "drawer" | "modal";

function DialogBase({
  variant,
  side = "end",
  width,
  id,
  open,
  onClose,
  eyebrow,
  title,
  description,
  footer,
  closeLabel,
  bodyClassName,
  children,
}: DialogContentProps & { variant: Variant; side?: "start" | "end"; width: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const text = useUiText();
  const reactId = useId().replace(/:/g, "");
  const titleId = `${reactId}-title`;
  const descId = `${reactId}-desc`;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || open === undefined) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  function onBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    // Only a click on the dialog box itself (its ::backdrop) lands here, never one inside the content.
    if (event.target === event.currentTarget) event.currentTarget.close();
  }

  const style = { [variant === "drawer" ? "--drawer-width" : "--modal-width"]: width } as CSSProperties;

  return (
    <dialog
      ref={ref}
      id={id}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      data-side={variant === "drawer" ? side : undefined}
      className={cn("dialog", variant === "drawer" ? "dialog-drawer" : "dialog-modal")}
      style={style}
      onClick={onBackdropClick}
      onClose={onClose}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <div className="min-w-0">
            {eyebrow ? <p className="text-caption font-semibold uppercase tracking-wide text-ink-subtle">{eyebrow}</p> : null}
            <h2 id={titleId} className={cn("text-heading text-ink", eyebrow && "mt-1")}>
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-1 text-body text-ink-muted">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton
            label={closeLabel ?? text.close}
            size="sm"
            className="-me-2 -mt-1"
            onClick={(e) => e.currentTarget.closest("dialog")?.close()}
          >
            <X aria-hidden="true" />
          </IconButton>
        </div>
        <div className={cn("min-h-0 flex-1 overflow-y-auto px-6 py-5", bodyClassName)}>{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line bg-surface px-6 py-4">{footer}</div>
        ) : null}
      </div>
    </dialog>
  );
}

const drawerWidths = { sm: "22rem", md: "28rem", lg: "40rem" } as const;
const modalWidths = { sm: "24rem", md: "32rem", lg: "44rem" } as const;

export type DrawerProps = DialogContentProps & {
  /** Which edge it slides from: `end` (default; right in English, left in Arabic) or `start` (navigation drawers). */
  side?: "start" | "end";
  /** `sm` 22rem, `md` 28rem (default), `lg` 40rem. Never wider than the screen minus 1.5rem. */
  size?: keyof typeof drawerWidths;
};

/** A side panel in a native `<dialog>`: slides from the end side, rounded, Esc closes, focus returns to the opener. */
export function Drawer({ side, size = "md", ...props }: DrawerProps) {
  return <DialogBase variant="drawer" side={side} width={drawerWidths[size]} {...props} />;
}

export type ModalProps = DialogContentProps & {
  /** `sm` 24rem, `md` 32rem (default), `lg` 44rem. */
  size?: keyof typeof modalWidths;
};

/** A centred dialog (confirmations, short forms) in a native `<dialog>`. */
export function Modal({ size = "md", ...props }: ModalProps) {
  return <DialogBase variant="modal" width={modalWidths[size]} {...props} />;
}

export type DialogTriggerProps = Omit<ButtonProps, "onClick"> & {
  /** The `id` of the Drawer or Modal to open. */
  for: string;
};

/** A Button that opens the Drawer / Modal with the given id (`showModal()`); focus returns to it when the dialog closes. */
export function DialogTrigger({ for: dialogId, ...props }: DialogTriggerProps) {
  return (
    <Button
      aria-haspopup="dialog"
      onClick={() => {
        const element = document.getElementById(dialogId);
        if (element instanceof HTMLDialogElement && !element.open) element.showModal();
      }}
      {...props}
    />
  );
}

/** A Button that closes the dialog it is inside (a "Cancel" button). */
export function DialogClose(props: Omit<ButtonProps, "onClick">) {
  return <Button variant="secondary" onClick={(e) => e.currentTarget.closest("dialog")?.close()} {...props} />;
}
