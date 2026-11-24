// The greeting at the top of the overview: one line for every account, worded by what the account has. Pure.
import { rankKindOf, type RankSource } from "@/lib/account/family";
import { fmt } from "@/lib/i18n/define";
import { account } from "@/lib/i18n/messages/account";
import { merchant } from "@/lib/i18n/messages/merchant";

/** The part of the account answer the greeting reads. */
export type WelcomeSource = RankSource & { name?: string | null; email?: string | null };

/**
 * The overview's heading. A name greets by name. Without one, a retail account (one made by the email link has no name yet)
 * is greeted plainly, and a merchant rank by its email, so the heading never ends in a bare comma.
 *
 * @param me the signed-in account
 * @returns the heading text
 */
export function welcomeTitle(me: WelcomeSource): string {
  const merchantRank = rankKindOf(me) === "merchant";
  const template = merchantRank ? merchant.dashboard.welcome : account.overview.welcome;
  const name = me.name?.trim();
  if (name) return fmt(template, { name });
  if (merchantRank && me.email) return fmt(template, { name: me.email });
  return account.overview.welcomeAnonymous;
}
