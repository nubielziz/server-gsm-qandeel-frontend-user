// AccountArea: the signed-in state in the header: "Sign in" button, or the bell, the wallet pill and the account menu.
// The shop header's "Sign in" button opens the sign-in panel under it (SignInPopover: password, email link, or the sign-up page);
// on phones, and in the compact checkout header, it is a plain link to the sign-in page.
// It reads the session cookies, so it must be rendered inside <Suspense fallback={<AccountAreaSkeleton />}>.
// There is one account type: the menu is the same for every rank, with a row more or less (the wallet row of a retail rank
// shows only while its store balance does). The rows come from
// `accountMenuItems` (lib/account/account-menu.ts); the wallet is the request's one shared read (`readAccountWallet`).
import { Fragment, Suspense, type ReactNode } from "react";
import { ClipboardList, LogIn, Settings, UserRound, Wallet } from "lucide-react";
import Link from "next/link";
import { accountMenuItems, walletRowShows, type AccountMenuLink, type AccountMenuRow } from "@/lib/account/account-menu";
import { capabilitiesOf } from "@/lib/account/capabilities";
import { readAccountWallet } from "@/lib/account/wallet-read";
import { getAccount } from "@/lib/api/session";
import { auth } from "@/lib/i18n/messages/auth";
import { common } from "@/lib/i18n/messages/common";
import { sitePath } from "@/lib/site-path";
import { SignInPopover } from "@/components/auth/sign-in-popover";
import { signInStepsText } from "@/components/auth/sign-in-steps-text";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { Skeleton } from "@/components/ui/skeleton";
import { BellSkeleton, BellSlot } from "@/components/notifications/bell-slot";
import { WalletPillLink, walletPillOf } from "./wallet-pill";
import { SignOutButton } from "./sign-out-button";

/** A same-size placeholder for the account area while the session is read. */
export function AccountAreaSkeleton({ compact }: { compact?: boolean }) {
  return compact ? <Skeleton className="size-11 rounded-full" /> : <Skeleton className="size-11 rounded-control sm:w-24" />;
}

/** What each page row shows: its label and its icon. */
const ROWS: Record<AccountMenuLink["id"], { label: string; icon: ReactNode }> = {
  account: { label: common.header.myAccount, icon: <UserRound aria-hidden="true" /> },
  orders: { label: common.header.myOrders, icon: <ClipboardList aria-hidden="true" /> },
  wallet: { label: common.header.myWallet, icon: <Wallet aria-hidden="true" /> },
  settings: { label: common.header.settings, icon: <Settings aria-hidden="true" /> },
};

/**
 * The rows of the avatar menu: the page rows, then a separator and the one Sign out row. Draws what
 * `accountMenuItems` decided; it reads nothing.
 */
export function AccountMenuRows({ rows }: { rows: AccountMenuRow[] }) {
  const t = common;
  return (
    <>
      {rows.map((row) =>
        row.id === "signOut" ? (
          <Fragment key={row.id}>
            <MenuSeparator />
            <SignOutButton label={t.header.signOut} pendingLabel={t.header.signingOut} />
          </Fragment>
        ) : (
          <MenuItem key={row.id} href={sitePath(row.path)} icon={ROWS[row.id].icon}>
            {ROWS[row.id].label}
          </MenuItem>
        ),
      )}
    </>
  );
}

/** The area for this request's visitor. Exported for its test; the page renders `AccountArea`, which adds the Suspense. */
export async function AccountAreaContent({ compact }: { compact?: boolean }) {
  // The account and its wallet are the request's shared reads: the home box, the frame and the pages ask the same
  // questions, so the header costs no call of its own. A failed read gives the signed-out button or no pill: the header must
  // never break its page. The compact shop header of a checkout (avatar only) never reads the wallet.
  const [me, wallet] = await Promise.all([
    getAccount().catch(() => null),
    compact ? null : readAccountWallet().catch(() => null),
  ]);
  const t = common;

  if (!me) {
    const signIn = sitePath("/sign-in");
    return (
      <>
        {/* Phones: an icon-only button keeps the header on one line. */}
        <Link
          href={signIn}
          aria-label={t.header.signIn}
          title={t.header.signIn}
          className={
            "inline-flex size-11 items-center justify-center rounded-control sm:hidden " +
            (compact ? "border border-line-strong bg-surface text-ink" : "bg-primary text-on-primary")
          }
        >
          <LogIn aria-hidden="true" className="size-5" />
        </Link>
        <span className="hidden sm:inline-flex">
          {compact ? (
            <ButtonLink href={signIn} variant="secondary" size="md">
              {t.header.signIn}
            </ButtonLink>
          ) : (
            // The panel under the button. A checkout keeps the plain link: it has its own way to sign in, in its page.
            <SignInPopover href={signIn} label={t.header.signIn} t={signInStepsText(auth)} />
          )}
        </span>
      </>
    );
  }

  const capabilities = capabilitiesOf(me);
  const pill = walletPillOf(wallet);
  const rows = accountMenuItems(walletRowShows(me, wallet));
  const name = me.name || me.email;

  return (
    <div className="flex items-center gap-2">
      {/* The notification bell of the signed-in visitor (owner, 2026-11-15: the bell belongs in the shop header too, not only
          in the account area). It mounts the live stream, so a stream opens wherever a signed-in visitor sees a bell; a
          signed-out visitor gets neither. The inbox is the one of the account's family. Its own Suspense: the unread count
          streams in without holding back the rest of the account area. Not in the compact checkout header. */}
      {compact ? null : (
        <Suspense fallback={<BellSkeleton />}>
          <BellSlot family={capabilities.family} />
        </Suspense>
      )}
      {pill ? <WalletPillLink pill={pill} variant="header" /> : null}
      <Menu
        label={t.header.accountMenu}
        align="end"
        chevron={!compact}
        trigger={
          <>
            <Avatar name={name} size="md" />
            {compact ? null : <span className="sr-only">{name}</span>}
          </>
        }
      >
        <MenuLabel>
          <p className="truncate text-body font-bold text-ink">{name}</p>
          {me.email ? <p className="truncate text-small text-ink-subtle">{me.email}</p> : null}
          {/* The rank chip: the account's own rank name, the same place for every account. */}
          {me.rank?.name ? (
            <Badge tone="neutral" className="mt-1.5">
              {me.rank.name}
            </Badge>
          ) : null}
        </MenuLabel>
        <MenuSeparator />
        <AccountMenuRows rows={rows} />
      </Menu>
    </div>
  );
}

export type AccountAreaProps = {
  /** Compact (checkout header): avatar only, no bell, no wallet pill, no chevron. */
  compact?: boolean;
};

/** Sign in button, or bell, wallet pill and account menu. Wraps itself in <Suspense> with a same-size skeleton. */
export function AccountArea({ compact }: AccountAreaProps) {
  return (
    <Suspense fallback={<AccountAreaSkeleton compact={compact} />}>
      <AccountAreaContent compact={compact} />
    </Suspense>
  );
}
