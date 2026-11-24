// Profile (mockup "Personal Information"): editable name, company, phone, country, address and tax id; read-only email
// (with "Resend verification email" while unverified), username, group and status. Works for pending
// merchants too (handoff §4.15).
import { Suspense } from "react";
import type { Metadata } from "next";
import { requireMerchant } from "@/lib/api/session";
import { countryOptions } from "@/lib/countries";
import { formatPercent } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";
import { common, statusLabel } from "@/lib/i18n/messages/common";
import { merchantSettings } from "@/lib/i18n/messages/merchant-settings";
import { ProfileForm } from "@/components/merchant-settings/profile-form";
import { utcDate } from "@/components/merchant-settings/format";
import { CardSkeleton } from "@/components/merchant-settings/skeletons";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DescriptionItem, DescriptionList } from "@/components/ui/description-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageTransition } from "@/components/layout/page-transition";

export function generateMetadata(): Metadata {
  const t = merchantSettings;
  return { title: t.layout.nav.profile };
}

export default function ProfilePage() {
  return (
    <PageTransition>
      <Suspense fallback={<CardSkeleton rows={5} />}>
        <ProfileContent />
      </Suspense>
    </PageTransition>
  );
}

async function ProfileContent() {
  const me = await requireMerchant();
  const t = merchantSettings;
  const c = common;
  return (
    <div className="grid gap-4">
      <ProfileForm
        countries={countryOptions()}
        initial={{
          name: me.name,
          company: me.company,
          phone: me.phone,
          country: me.country,
          address: me.address,
          taxId: me.taxId,
        }}
        email={me.email}
        emailVerified={me.emailVerifiedAt !== null}
        t={t.profile}
        fieldTexts={t.fieldErrors}
        optional={t.optional}
      />
      <Card as="section">
        <CardHeader title={t.profile.details.title} description={t.profile.details.description} divided />
        <CardBody>
          <DescriptionList>
            <DescriptionItem label={t.profile.details.username}>
              <span dir="ltr" className="num">
                {me.username}
              </span>
            </DescriptionItem>
            <DescriptionItem label={t.profile.details.group}>
              <span dir="auto">{me.group.name}</span>
              <span className="text-ink-subtle">
                {" · "}
                {fmt(t.layout.summary.discount, { percent: formatPercent(me.group.discountPercent) })}
              </span>
            </DescriptionItem>
            <DescriptionItem label={t.profile.details.memberSince}>{utcDate(me.createdAt)}</DescriptionItem>
            <DescriptionItem label={t.profile.details.status}>
              <StatusBadge kind="account" status={me.status} label={statusLabel(c, "account", me.status)} />
            </DescriptionItem>
          </DescriptionList>
        </CardBody>
      </Card>
    </div>
  );
}
