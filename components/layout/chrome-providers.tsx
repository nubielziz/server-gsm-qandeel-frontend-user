// ChromeProviders: mounts the generic UI strings for Client Components (components/ui/ui-text.tsx) and the toast region.
// Every layout shell (store, auth, checkout, workspace) renders it once; pages never need to.
import type { ReactNode } from "react";
import { getMessages } from "@/lib/i18n/server";
import { common } from "@/lib/i18n/messages/common";
import { Toaster } from "@/components/ui/toast";
import { UiTextProvider } from "@/components/ui/ui-text";

/** Provides the current language's UI strings and renders `<Toaster />`. Static: uses only the language route param. */
export async function ChromeProviders({ children }: { children: ReactNode }) {
  const t = await getMessages(common);
  return (
    <UiTextProvider messages={t.ui}>
      {children}
      <Toaster />
    </UiTextProvider>
  );
}
