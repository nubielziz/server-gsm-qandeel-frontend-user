"use client";
// The frame of the quick view: a large Modal (native <dialog>: focus trap, Esc, inert page) opened as soon as the
// intercepted route renders it in the store layout's @modal slot. Closing it (Esc, backdrop, the X) goes back in
// history, which leaves the quick view URL. A link inside it (full details) is a soft navigation that keeps the slot's
// content, so the frame shows only while the URL is a quick view: the dialog is then removed without a close event
// (nothing goes back), and Back to the quick view URL shows it again. The URL is read in its own <Suspense> boundary,
// so the frame and its skeletons stay in the route's static shell.
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Modal } from "@/components/ui/dialog";

export const QUICK_VIEW_SEGMENT = "/quick-view/";

export function QuickViewModal({ eyebrow, title, footer, children }: { eyebrow: string; title: ReactNode; footer: ReactNode; children: ReactNode }) {
  const router = useRouter();
  const [away, setAway] = useState(false);
  return (
    <>
      <Suspense fallback={null}>
        <AwayWatcher onChange={setAway} />
      </Suspense>
      {away ? null : (
        <Modal open size="lg" eyebrow={eyebrow} title={title} footer={footer} onClose={() => router.back()}>
          {children}
        </Modal>
      )}
    </>
  );
}

/** Tells the frame whether the URL has left the quick view (a link inside it was followed). */
function AwayWatcher({ onChange }: { onChange: (away: boolean) => void }) {
  const away = !usePathname().includes(QUICK_VIEW_SEGMENT);
  useEffect(() => onChange(away), [away, onChange]);
  return null;
}
