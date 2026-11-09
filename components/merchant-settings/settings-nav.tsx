// The settings sub-navigation (mockup "Account Settings"): on desktop a card on the start side with a black bar on
// the active item, on phones a row of pill tabs that scrolls sideways. One list, two looks, so there are no
// duplicate links. NavLink marks the current page with aria-current.
import { Bell, BadgeCheck, ShieldCheck, User } from "lucide-react";
import { localePath, type Locale } from "@/lib/i18n/config";
import { NavLink } from "@/components/layout/nav-link";
import { Card } from "@/components/ui/card";

export type SettingsNavLabels = {
  navLabel: string;
  navTitle: string;
  profile: string;
  security: string;
  notifications: string;
  verification: string;
};

const itemClasses =
  "relative flex min-h-11 items-center gap-3 whitespace-nowrap rounded-control px-3.5 text-body font-medium text-ink-muted transition-colors " +
  "hover:text-ink lg:hover:bg-surface-muted " +
  "aria-[current=page]:font-bold aria-[current=page]:text-ink " +
  "max-lg:aria-[current=page]:bg-inverse max-lg:aria-[current=page]:text-on-inverse max-lg:hover:bg-surface-sunken max-lg:aria-[current=page]:hover:bg-inverse " +
  "lg:aria-[current=page]:bg-surface-muted " +
  "[&_svg]:size-[18px] [&_svg]:shrink-0 " +
  "lg:before:absolute lg:before:inset-y-1.5 lg:before:start-0 lg:before:w-1 lg:before:rounded-e-full lg:before:bg-transparent lg:aria-[current=page]:before:bg-inverse";

export function SettingsNav({ locale, labels }: { locale: Locale; labels: SettingsNavLabels }) {
  const items = [
    { href: "/merchant/settings", label: labels.profile, icon: <User aria-hidden="true" />, match: "exact" as const },
    { href: "/merchant/settings/security", label: labels.security, icon: <ShieldCheck aria-hidden="true" /> },
    { href: "/merchant/settings/notifications", label: labels.notifications, icon: <Bell aria-hidden="true" /> },
    { href: "/merchant/settings/verification", label: labels.verification, icon: <BadgeCheck aria-hidden="true" /> },
  ];
  return (
    <nav aria-label={labels.navLabel}>
      <Card className="p-2 lg:p-4">
        <h2 className="hidden px-3.5 pb-3 pt-1 text-heading text-ink lg:block">{labels.navTitle}</h2>
        <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {items.map((item) => (
            <li key={item.href} className="max-lg:shrink-0">
              <NavLink href={localePath(locale, item.href)} match={item.match} className={itemClasses}>
                {item.icon}
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </Card>
    </nav>
  );
}
