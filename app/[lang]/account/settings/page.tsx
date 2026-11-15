// Account settings (mockup "Account Settings"): a section list on the start side, the forms in the middle and an
// account summary + help on the end side. Sections: Profile (name, phone, country; the email is read-only, no route
// changes it), Preferences (language, currency, marketing), Password and Privacy (data export / deletion requests).
import type { Metadata } from "next";
import { Suspense } from "react";
import { BadgeCheck } from "lucide-react";
import { requireCustomer } from "@/lib/api/session";
import { getStoreConfig } from "@/lib/api/public";
import { countryName } from "@/lib/countries";
import { getCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/format";
import { localePath, type Locale } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/define";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { account } from "@/lib/i18n/messages/account";
import { common } from "@/lib/i18n/messages/common";
import { portal } from "@/lib/i18n/messages/portal";
import { PasswordForm } from "@/components/account/password-form";
import { PreferencesForm } from "@/components/account/preferences-form";
import { PrivacyRequests } from "@/components/account/privacy-requests";
import { ProfileForm } from "@/components/account/profile-form";
import { PageHeader } from "@/components/layout/container";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageTransition } from "@/components/layout/page-transition";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(account);
  return { title: t.settings.metaTitle, robots: { index: false, follow: false } };
}

/** The countries the shop has a tax rate for (the API refuses any other), plus the saved one, named in the page language. */
function countryChoices(taxRates: { country: string }[], saved: string, locale: Locale): { code: string; name: string }[] {
  const codes = new Set(taxRates.map((rate) => rate.country));
  if (saved) codes.add(saved);
  const collator = new Intl.Collator(locale);
  return [...codes].map((code) => ({ code, name: countryName(code, locale) })).sort((a, b) => collator.compare(a.name, b.name));
}

function SettingsSkeleton() {
  return (
    <div aria-busy="true" className="grid grid-cols-1 gap-4 lg:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[14rem_minmax(0,1fr)_20rem]">
      <Skeleton className="h-12 rounded-card lg:h-56" />
      <div className="grid content-start gap-4">
        <Skeleton className="h-[43rem] rounded-card sm:h-[28rem]" />
        <Skeleton className="h-96 rounded-card" />
        <Skeleton className="h-96 rounded-card" />
        <Skeleton className="h-72 rounded-card" />
      </div>
      <div className="grid content-start gap-4 lg:col-start-2 xl:col-start-3 xl:row-start-1">
        <Skeleton className="h-52 rounded-card" />
        <Skeleton className="h-44 rounded-card" />
      </div>
    </div>
  );
}

async function SettingsContent() {
  const locale = await getLocale();
  const [me, t, c, p, config, shopCurrency] = await Promise.all([
    requireCustomer(locale),
    getMessages(account),
    getMessages(common),
    getMessages(portal),
    getStoreConfig(),
    getCurrency(),
  ]);
  const s = t.settings;
  const sections = [
    { id: "profile", label: s.sections.profile },
    { id: "preferences", label: s.sections.preferences },
    { id: "password", label: s.sections.password },
    { id: "privacy", label: s.sections.privacy },
  ];
  const currencies = config.currencies.map((cur) => ({ code: cur.code, name: cur.name }));
  // The currency the shop shows: the account's choice, else the visitor's cookie, else the base currency.
  const currency = me.currency && currencies.some((cur) => cur.code === me.currency) ? me.currency : shopCurrency.code;
  const name = me.name || me.email;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[14rem_minmax(0,1fr)_20rem]">
      <nav aria-label={s.navLabel} className="lg:sticky lg:top-4 lg:self-start">
        <ul className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-0 lg:rounded-card lg:border lg:border-line lg:bg-surface lg:p-2 lg:shadow-card">
          {sections.map((section) => (
            <li key={section.id} className="shrink-0">
              <a
                href={`#${section.id}`}
                className="inline-flex min-h-11 w-full items-center rounded-control px-3 text-body font-semibold text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink max-lg:border max-lg:border-line-strong max-lg:bg-surface lg:min-h-12"
              >
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="grid content-start gap-4">
        <Card as="section" id="profile" aria-labelledby="profile-title">
          <CardHeader title={<span id="profile-title">{s.profile.title}</span>} description={s.profile.description} />
          <CardBody>
            <ProfileForm
              initial={{ name: me.name, phone: me.phone, country: me.country, currency: me.currency }}
              email={me.email}
              countries={countryChoices(config.taxRates, me.country, locale)}
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
              initial={{ locale: me.locale === "ar" ? "ar" : "en", currency, marketingOptIn: me.marketingOptIn }}
              currencies={currencies}
              t={s.preferences}
            />
          </CardBody>
        </Card>

        <Card as="section" id="password" aria-labelledby="password-title">
          <CardHeader
            title={<span id="password-title">{s.password.title}</span>}
            description={me.hasPassword ? s.password.description : undefined}
          />
          <CardBody>
            {me.hasPassword ? (
              <PasswordForm t={s.password} />
            ) : (
              <Alert
                title={s.password.noneTitle}
                action={
                  <ButtonLink href={`${localePath(locale, "/forgot-password")}?as=customer`} variant="secondary" size="sm">
                    {s.password.noneAction}
                  </ButtonLink>
                }
              >
                {s.password.noneText}
              </Alert>
            )}
          </CardBody>
        </Card>

        <Card as="section" id="privacy" aria-labelledby="privacy-title">
          <CardHeader title={<span id="privacy-title">{s.privacy.title}</span>} description={s.privacy.description} />
          <CardBody>
            <PrivacyRequests locale={locale} t={s.privacy} requestStatus={c.status.request} />
          </CardBody>
        </Card>
      </div>

      <div className="grid content-start gap-4 lg:col-start-2 xl:col-start-3 xl:row-start-1">
        <Card as="section" aria-labelledby="summary-title">
          <CardHeader title={<span id="summary-title">{s.summary.title}</span>} />
          <CardBody>
            <div className="flex items-center gap-4">
              <Avatar name={name} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-subheading text-ink">{name}</p>
                <p className="text-small text-ink-subtle">{p.customerRole}</p>
                <p className="text-small text-ink-subtle">{fmt(s.summary.memberSince, { date: formatDate(me.createdAt, locale, { month: "long", year: "numeric" }) })}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <span dir="ltr" className="min-w-0 break-all text-body text-ink">
                {me.email}
              </span>
              <Badge tone={me.emailVerifiedAt ? "success" : "warning"} icon={me.emailVerifiedAt ? <BadgeCheck aria-hidden="true" /> : undefined}>
                {me.emailVerifiedAt ? s.summary.verified : s.summary.notVerified}
              </Badge>
            </div>
          </CardBody>
        </Card>

        <Card as="section" tone="muted" aria-labelledby="help-title">
          <CardHeader title={<span id="help-title">{s.help.title}</span>} description={s.help.text} />
          <CardBody>
            <ButtonLink href={localePath(locale, "/support")} variant="secondary" block>
              {s.help.contact}
            </ButtonLink>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export default async function AccountSettingsPage() {
  const t = await getMessages(account);
  return (
    <PageTransition>
      <div className="grid gap-4">
        <PageHeader variant="card" title={t.settings.title} description={t.settings.subtitle} />
        <Suspense fallback={<SettingsSkeleton />}>
          <SettingsContent />
        </Suspense>
      </div>
    </PageTransition>
  );
}
