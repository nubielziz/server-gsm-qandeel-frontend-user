"use client";
// Copies the address of the page the visitor is on (the tracking link is the only key to an order).
import { useSyncExternalStore } from "react";
import { CopyButton } from "@/components/ui/copy-button";

const noopSubscribe = () => () => {};
const currentHref = () => window.location.href.split("#")[0];

export function CopyPageLink({ label, copiedLabel }: { label: string; copiedLabel: string }) {
  // Empty on the server (the address is only known in the browser), the real address after hydration.
  const href = useSyncExternalStore(noopSubscribe, currentHref, () => "");
  return <CopyButton value={href} label={label} copiedLabel={copiedLabel} />;
}
