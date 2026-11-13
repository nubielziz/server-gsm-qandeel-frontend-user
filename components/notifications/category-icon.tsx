// The icon of a notification's category. A category this site does not know yet (the API may add one) gets the bell.
// Decorative: the category's name is printed beside it. Server-compatible.
import {
  Bell,
  ClipboardList,
  CreditCard,
  Headset,
  Megaphone,
  ReceiptText,
  Tag,
  TriangleAlert,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { NotificationCategory } from "@/lib/api/types";

const ICONS: Record<NotificationCategory, LucideIcon> = {
  announcement: Megaphone,
  marketing: Tag,
  order: ClipboardList,
  payment: CreditCard,
  wallet: Wallet,
  billing: ReceiptText,
  support: Headset,
  account: UserRound,
  alert: TriangleAlert,
};

export function CategoryIcon({ category, className }: { category: string; className?: string }) {
  const Icon = Object.hasOwn(ICONS, category) ? ICONS[category as NotificationCategory] : Bell;
  return <Icon aria-hidden="true" className={className} />;
}
