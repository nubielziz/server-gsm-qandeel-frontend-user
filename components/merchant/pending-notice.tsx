// Shown instead of a page's data while the merchant account waits for approval (`403 ACCOUNT_PENDING_APPROVAL`).
// The layout already shows the banner; this explains what to do meanwhile and links to what works.
import { Lock } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/container";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { sitePath } from "@/lib/site-path";
import { merchant } from "@/lib/i18n/messages/merchant";
import { portal } from "@/lib/i18n/messages/portal";

/** `title`: the page heading to show above the notice, for detail pages whose whole content is behind <Suspense>. */
export function PendingNotice({ title }: { title?: string }) {
  const t = merchant;
  const p = portal;
  const notice = (
    <Card>
      <EmptyState
        icon={<Lock aria-hidden="true" />}
        title={t.shared.pendingTitle}
        description={p.pending.unavailable}
        action={
          <ButtonLink href={sitePath("/merchant/settings")} variant="primary">
            {t.shared.openSettings}
          </ButtonLink>
        }
      />
    </Card>
  );
  return title ? (
    <div className="grid gap-6">
      <PageHeader title={title} />
      {notice}
    </div>
  ) : (
    notice
  );
}
