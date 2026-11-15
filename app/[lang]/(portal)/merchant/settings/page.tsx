// Profile (mockup "Personal Information"): editable name, company, phone, country, address, tax id and the language of
// our emails; read-only email (with "Resend verification email" while unverified), username, group, referral code,
// status and verification. Works for pending merchants too (handoff §4.15).
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireMerchant } from "@/lib/api/session";
import { countryOptions } from "@/lib/countries";
import { formatPercent } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";
import { localePath } from "@/lib/i18n/config";
import { common, statusLabel } from "@/lib/i18n/messages/common";
import { merchantSettings } from "@/lib/i18n/messages/merchant-settings";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { ProfileForm } from "@/components/merchant-settings/profile-form";
import { utcDate } from "@/components/merchant-settings/format";
import { CardSkeleton } from "@/components/merchant-settings/skeletons";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DescriptionItem, DescriptionList } from "@/components/ui/description-list";
import { StatusBadge } from "@/components/ui/status-badge";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(merchantSettings);
  return { title: t.layout.nav.profile };
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<CardSkeleton rows={5} />}>
      <ProfileContent />
    </Suspense>
  );
}

async function ProfileContent() {
  const locale = await getLocale();
  const [me, t] = await Promise.all([requireMerchant(locale), getMessages(merchantSettings)]);
  const c = common[locale];
  return (
    <div className="grid gap-4">
      <ProfileForm
        countries={countryOptions(locale)}
        initial={{
          name: me.name,
          company: me.company,
          phone: me.phone,
          country: me.country,
          address: me.address,
          taxId: me.taxId,
          locale: me.locale,
        }}
        email={me.email}
        emailVerified={me.emailVerifiedAt !== null}
        languageNames={c.languageNames}
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
                {fmt(t.layout.summary.discount, { percent: formatPercent(me.group.discountPercent, locale) })}
              </span>
            </DescriptionItem>
            <DescriptionItem label={t.profile.details.referralCode}>
              <span dir="ltr" className="num">
                {me.referralCode}
              </span>
            </DescriptionItem>
            <DescriptionItem label={t.profile.details.memberSince}>{utcDate(me.createdAt, locale)}</DescriptionItem>
            <DescriptionItem label={t.profile.details.status}>
              <StatusBadge kind="account" status={me.status} label={statusLabel(c, "account", me.status)} />
            </DescriptionItem>
            <DescriptionItem label={t.profile.details.kyc}>
              <span className="inline-flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                <StatusBadge kind="kyc" status={me.kycStatus} label={statusLabel(c, "kyc", me.kycStatus)} />
                <Link
                  href={localePath(locale, "/merchant/settings/verification")}
                  className="inline-flex min-h-11 items-center text-small font-semibold text-ink underline underline-offset-4"
                >
                  {t.profile.details.viewKyc}
                </Link>
              </span>
            </DescriptionItem>
          </DescriptionList>
        </CardBody>
      </Card>
    </div>
  );
}
