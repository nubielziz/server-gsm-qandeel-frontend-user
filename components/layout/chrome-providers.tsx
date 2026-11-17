// ChromeProviders: mounts the generic UI strings for Client Components (components/ui/ui-text.tsx) and the toast region.
// Every layout shell (store, auth, checkout, workspace) renders it once; pages never need to.
import type { ReactNode } from "react";
import { common } from "@/lib/i18n/messages/common";
import { Toaster } from "@/components/ui/toast";
import { UiTextProvider } from "@/components/ui/ui-text";

/** Provides the generic UI strings (`common.ui`) and renders `<Toaster />`. Static: reads no request data. */
export function ChromeProviders({ children }: { children: ReactNode }) {
  const t = common;
  return (
    <UiTextProvider messages={t.ui}>
      {children}
      <Toaster />
    </UiTextProvider>
  );
}
