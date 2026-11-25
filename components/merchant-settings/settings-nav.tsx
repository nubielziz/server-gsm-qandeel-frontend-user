// The settings sub-navigation (mockup "Account Settings"): on desktop a card on the start side with a black bar on
// the active item, on phones a row of pill tabs that scrolls sideways. One list, two looks, so there are no
// duplicate links. NavLink marks the current page with aria-current. The entries come from `settingsNav`
// (lib/account/settings-nav.ts), so a link is shown only for a page the account has.
import { Bell, KeyRound, Lock, ShieldCheck, User } from "lucide-react";
import type { ReactNode } from "react";
import { settingsNav, type SettingsNavItem, type SettingsNavSource, type SettingsSection } from "@/lib/account/settings-nav";
import { sitePath } from "@/lib/site-path";
import { NavLink } from "@/components/layout/nav-link";
import { Card } from "@/components/ui/card";

export type SettingsNavLabels = {
  navLabel: string;
  navTitle: string;
  /** The name of each section, by section id. */
  sections: Record<SettingsSection, string>;
};

const icons: Record<SettingsSection, ReactNode> = {
  profile: <User aria-hidden="true" />,
  security: <ShieldCheck aria-hidden="true" />,
  notifications: <Bell aria-hidden="true" />,
  "api-keys": <KeyRound aria-hidden="true" />,
  privacy: <Lock aria-hidden="true" />,
};

const itemClasses =
  "relative flex min-h-11 items-center gap-3 whitespace-nowrap rounded-control px-3.5 text-body font-medium text-ink-muted transition-colors " +
  "hover:text-ink lg:hover:bg-surface-muted " +
  "aria-[current=page]:font-bold aria-[current=page]:text-ink " +
  "max-lg:aria-[current=page]:bg-primary max-lg:aria-[current=page]:text-on-primary max-lg:hover:bg-surface-sunken max-lg:aria-[current=page]:hover:bg-primary " +
  "lg:aria-[current=page]:bg-surface-muted " +
  "[&_svg]:size-[18px] [&_svg]:shrink-0 " +
  "lg:before:absolute lg:before:inset-y-1.5 lg:before:start-0 lg:before:w-1 lg:before:rounded-e-full lg:before:bg-transparent lg:aria-[current=page]:before:bg-primary";

/** The navigation for an already-chosen list of entries (what the tests and the server slot both render). */
export function SettingsNavView({ items, labels }: { items: SettingsNavItem[]; labels: SettingsNavLabels }) {
  return (
    <nav aria-label={labels.navLabel}>
      <Card className="p-2 lg:p-4">
        <h2 className="hidden px-3.5 pb-3 pt-1 text-heading text-ink lg:block">{labels.navTitle}</h2>
        <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {items.map((item) => (
            <li key={item.section} className="max-lg:shrink-0">
              <NavLink href={sitePath(item.href)} match={item.match} className={itemClasses}>
                {icons[item.section]}
                {labels.sections[item.section]}
              </NavLink>
            </li>
          ))}
        </ul>
      </Card>
    </nav>
  );
}

/** The navigation of one account: the list `settingsNav` gives for its capabilities. */
export function SettingsNav({ caps, labels }: { caps: SettingsNavSource; labels: SettingsNavLabels }) {
  return <SettingsNavView items={settingsNav(caps)} labels={labels} />;
}
