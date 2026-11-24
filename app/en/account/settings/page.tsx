// Profile, for an account of either rank. A retail account edits its name, phone and country, then its currency and marketing
// choice (the email and the rank are read-only); a merchant rank edits name, company, phone, country, address and tax id.
// Both see the read-only account details under the form. The layout (navigation, summary, help) is the settings layout.
import { Suspense } from "react";
import type { Metadata } from "next";
import { familyOf } from "@/lib/account/family";
import { SETTINGS_PATHS } from "@/lib/account/settings-nav";
import { getStoreConfig } from "@/lib/api/public";
import { requireAccount } from "@/lib/api/session";
import type { AccountMe } from "@/lib/api/types";
import { countryName, countryOptions } from "@/lib/countries";
import { getCurrency } from "@/lib/currency";
import { formatPercent } from "@/lib/format";
import { INTL_LOCALE } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/define";
import { account } from "@/lib/i18n/messages/account";
import { common, statusLabel } from "@/lib/i18n/messages/common";
import { merchantSettings } from "@/lib/i18n/messages/merchant-settings";
import { sitePath } from "@/lib/site-path";
import { PreferencesForm } from "@/components/account/preferences-form";
import { ProfileForm as RetailProfileForm } from "@/components/account/profile-form";
import { utcDate } from "@/components/merchant-settings/format";
import { ProfileForm as MerchantProfileForm } from "@/components/merchant-settings/profile-form";
import { CardSkeleton } from "@/components/merchant-settings/skeletons";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DescriptionItem, DescriptionList } from "@/components/ui/description-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageTransition } from "@/components/layout/page-transition";

export function generateMetadata(): Metadata {
  return { title: account.settings.nav.profile, robots: { index: false, follow: false } };
}

/** The countries the shop has a tax rate for (the API refuses any other), plus the saved one, sorted by name. */
function countryChoices(taxRates: { country: string }[], saved: string): { code: string; name: string }[] {
  const codes = new Set(taxRates.map((rate) => rate.country));
  if (saved) codes.add(saved);
  const collator = new Intl.Collator(INTL_LOCALE);
  return [...codes].map((code) => ({ code, name: countryName(code) })).sort((a, b) => collator.compare(a.name, b.name));
}

/** What staff manage and the account only reads: the Dhru username (merchant rank), the rank, when it began and its status. */
function AccountDetails({ me }: { me: AccountMe }) {
  const t = account.settings;
  const merchant = familyOf(me) === "client";
  return (
    <Card as="section" aria-labelledby="details-title">
      <CardHeader title={<span id="details-title">{t.details.title}</span>} description={t.details.description} divided />
      <CardBody>
        <DescriptionList>
          {me.username ? (
            <DescriptionItem label={t.details.username}>
              <span dir="ltr" className="num">
                {me.username}
              </span>
            </DescriptionItem>
          ) : null}
          <DescriptionItem label={t.details.rank}>
            <span dir="auto">{me.rank.name}</span>
            {merchant ? (
              <span className="text-ink-subtle">
                {" · "}
                {fmt(t.summary.discount, { percent: formatPercent(me.rank.discountPercent) })}
              </span>
            ) : null}
          </DescriptionItem>
          <DescriptionItem label={t.details.memberSince}>{utcDate(me.createdAt)}</DescriptionItem>
          <DescriptionItem label={t.details.status}>
            <StatusBadge kind="account" status={me.status} label={statusLabel(common, "account", me.status)} />
          </DescriptionItem>
        </DescriptionList>
      </CardBody>
    </Card>
  );
}

async function RetailProfile({ me }: { me: AccountMe }) {
  const [config, shopCurrency] = await Promise.all([getStoreConfig(), getCurrency()]);
  const s = account.settings;
  const currencies = config.currencies.map((cur) => ({ code: cur.code, name: cur.name }));
  // The currency the shop shows: the account's choice, else the visitor's cookie, else the base currency.
  const currency = me.currency && currencies.some((cur) => cur.code === me.currency) ? me.currency : shopCurrency.code;
  return (
    <div className="grid gap-4">
      <Card as="section" id="profile" aria-labelledby="profile-title">
        <CardHeader title={<span id="profile-title">{s.profile.title}</span>} description={s.profile.description} />
        <CardBody>
          <RetailProfileForm
            initial={{ name: me.name, phone: me.phone, country: me.country, currency: me.currency }}
            email={me.email}
            countries={countryChoices(config.taxRates, me.country)}
            t={s.profile}
          />
        </CardBody>
      </Card>

      <Card as="section" id="preferences" aria-labelledby="preferences-title">
        <CardHeader title={<span id="preferences-title">{s.preferences.title}</span>} description={s.preferences.description} />
        <CardBody>
          {/* Keyed by the shown currency: a country change in the profile resets it on the API, and the form must start again from it. */}
          <PreferencesForm
            key={currency}
            initial={{ currency, marketingOptIn: me.marketingOptIn }}
            currencies={currencies}
            t={s.preferences}
          />
        </CardBody>
      </Card>

      <AccountDetails me={me} />
    </div>
  );
}

function MerchantProfile({ me }: { me: AccountMe }) {
  const t = merchantSettings;
  return (
    <div className="grid gap-4">
      <MerchantProfileForm
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
      <AccountDetails me={me} />
    </div>
  );
}

async function ProfileContent() {
  const me = await requireAccount(sitePath(SETTINGS_PATHS.profile));
  return familyOf(me) === "client" ? <MerchantProfile me={me} /> : <RetailProfile me={me} />;
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
