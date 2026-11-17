"use client";
// Drawer, Modal, DialogTrigger, DialogClose: built on the native <dialog> element, so the browser gives us the focus
// trap, Esc to close, the inert background and the return of focus to the opener. A Drawer slides in from the END side
// (the right edge) as a rounded panel inset from the screen edge; a Modal is centred.
//
// Two ways to use them:
//  - Uncontrolled, `id` mode (works from a Server Component page, and before hydration):
//      <Drawer id="requirements" title="Service requirements">…</Drawer>
//      <DialogTrigger for="requirements">Enter details</DialogTrigger>
//    The trigger is an invoker command (`command="show-modal" commandfor="requirements"`): the browser opens the dialog
//    from the server HTML, so a tap is not lost while the page hydrates (plan P4.1). The close button is a `close`
//    command for the same reason. Code opens or closes it with `openDialog(id)` / `closeDialog(id)`.
//  - Controlled (client forms):  <Drawer open={open} onClose={() => setOpen(false)} …>
//    Never point a command at a controlled dialog: its effect would close a dialog the browser opened before hydration.
// A form that spans the body and the footer buttons can keep them apart: give the form an `id` and the submit button
// `form="that-id"`.
import Link from "next/link";
import { useEffect, useId, useRef, type ComponentProps, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, type ButtonProps } from "./button";
import { IconButton } from "./icon-button";
import { useUiText } from "./ui-text";

type DialogContentProps = {
  /**
   * Element id: lets a `DialogTrigger for="…"` open it. With `open` left undefined this is the uncontrolled `id` mode: the
   * dialog is server-rendered closed, opens through the native `show-modal` command (before hydration too) and closes
   * through its close button's native `close` command, Esc, a backdrop click or `closeDialog(id)`. Use a per-instance id
   * (`useId()`) when the component can be on the page twice: Next keeps the previous page hidden in the DOM.
   */
  id?: string;
  /**
   * Controlled state. Leave undefined to open it with a `DialogTrigger` (the `id` mode). A controlled dialog must not be
   * opened by a native command: the effect below would close it again when the page hydrates.
   */
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
  const uncontrolled = open === undefined;
  const reactId = useId().replace(/:/g, "");
  const titleId = `${reactId}-title`;
  const descId = `${reactId}-desc`;

  // Controlled dialogs only: an uncontrolled one keeps whatever state the browser gave it (it may already be open when
  // the page hydrates, opened by a native command).
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
      // The browser adds `open` to an uncontrolled dialog opened before hydration: not a mismatch React should report.
      suppressHydrationWarning={uncontrolled}
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
            // Uncontrolled: the native command closes it before hydration too; the onClick is the fallback.
            command={uncontrolled && id ? "close" : undefined}
            commandfor={uncontrolled && id ? id : undefined}
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
  /** Which edge it slides from: `end` (default; the right edge) or `start` (navigation drawers). */
  side?: "start" | "end";
  /** `sm` 22rem, `md` 28rem (default), `lg` 40rem. Never wider than the screen minus 1.5rem. */
  size?: keyof typeof drawerWidths;
};

/**
 * A side panel in a native `<dialog>`: slides from the end side, rounded, Esc closes, focus returns to the opener.
 * Uncontrolled `id` mode (`id`, no `open`): opened by a `DialogTrigger for={id}` or a button with
 * `command="show-modal" commandfor={id}` (works before hydration), closed by its close button, Esc, the backdrop,
 * `closeDialog(id)` or a `DialogLink`. Controlled mode: `open` + `onClose`, never with a command.
 */
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

/**
 * Opens the dialog with this id as a modal (`showModal()`), unless it is missing or already open. The fallback of every
 * native `show-modal` command (browsers without invoker commands) and the way code opens an uncontrolled dialog.
 * @param id The `id` of an uncontrolled Drawer or Modal.
 */
export function openDialog(id: string): void {
  const element = document.getElementById(id);
  if (element instanceof HTMLDialogElement && !element.open) element.showModal();
}

/**
 * Closes the dialog with this id, if it is open (its `close` event then fires and focus returns to the opener).
 * @param id The `id` of an uncontrolled Drawer or Modal.
 */
export function closeDialog(id: string): void {
  const element = document.getElementById(id);
  if (element instanceof HTMLDialogElement && element.open) element.close();
}

export type DialogTriggerProps = Omit<ButtonProps, "onClick" | "command" | "commandfor"> & {
  /** The `id` of the uncontrolled Drawer or Modal to open (never a controlled one, see `open`). */
  for: string;
  /**
   * `true` (default): the button carries `command="show-modal" commandfor={for}`, so the browser opens the dialog from
   * the server HTML, before hydration. `false`: only the click handler opens it, after hydration. Use `false` when the
   * dialog's content is mounted by JavaScript (empty before hydration).
   */
  native?: boolean;
};

/**
 * A Button that opens the uncontrolled Drawer / Modal with the given id; focus returns to it when the dialog closes.
 * With `native` (default) it is an invoker command (`command="show-modal" commandfor={for}`) that works before
 * hydration; its guarded `showModal()` click handler (`openDialog`) is the fallback for browsers without commands. Where
 * both run, the click handler opens the dialog first and the command then finds it open and does nothing.
 */
export function DialogTrigger({ for: dialogId, native = true, ...props }: DialogTriggerProps) {
  return (
    <Button
      aria-haspopup="dialog"
      command={native ? "show-modal" : undefined}
      commandfor={native ? dialogId : undefined}
      onClick={() => openDialog(dialogId)}
      {...props}
    />
  );
}

/** A Button that closes the dialog it is inside (a "Cancel" button). */
export function DialogClose(props: Omit<ButtonProps, "onClick">) {
  return <Button variant="secondary" onClick={(e) => e.currentTarget.closest("dialog")?.close()} {...props} />;
}

/** A next/link that closes the dialog it is inside before navigating (filter links in a drawer). Elsewhere a plain link. */
export function DialogLink({ onClick, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      onClick={(event) => {
        onClick?.(event);
        event.currentTarget.closest("dialog")?.close();
      }}
      {...props}
    />
  );
}
