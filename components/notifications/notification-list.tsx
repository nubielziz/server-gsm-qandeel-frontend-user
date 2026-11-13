// The notifications page of both areas (customer and merchant): All / Unread tabs, 20 items a page, "Mark all as read".
// A server component that reads the session, so the page renders it inside <Suspense> with <NotificationListSkeleton />.
// The tab and the page live in the URL (`?unread=1`, `?page=2`). Plan D11: `title` and `body` are plain text and are
// rendered as React text nodes (line breaks by CSS), never as HTML; each item names its own language and direction; the
// link goes through `notificationHref`; the list always asks for the page's language.
import { Bell, BellOff } from "lucide-react";
import { redirect } from "next/navigation";
import { isApiError } from "@/lib/api/errors";
import { listQuery, pageRange, parsePage } from "@/lib/api/query";
import { apiSessionList } from "@/lib/api/server";
import type { NotificationItem } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { dirOf, localePath } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { notifications } from "@/lib/i18n/messages/notifications";
import { first, type SearchParams } from "@/lib/merchant/lists";
import {
  NOTIFICATION_API,
  NOTIFICATION_FEED_ID,
  NOTIFICATIONS_PAGE,
  notificationHref,
  unreadTextInline,
  type NotificationSurface,
} from "@/lib/notifications/link";
import { BusyState } from "@/components/ui/busy-state";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, pageHref } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { readUnreadCount } from "./bell-slot";
import { CategoryIcon } from "./category-icon";
import { MarkAllRead, NotificationActions } from "./notification-actions";

const PAGE_SIZE = 20;

/** The size of the loaded page: the tab row, then the card. */
export function NotificationListSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-4">
      <Skeleton className="h-11" />
      <Skeleton className="h-96 rounded-card" />
    </div>
  );
}

export async function NotificationList({ surface, searchParams }: { surface: NotificationSurface; searchParams: Promise<SearchParams> }) {
  const [sp, locale, t, unreadTotal] = await Promise.all([searchParams, getLocale(), getMessages(notifications), readUnreadCount(surface)]);
  const unreadOnly = first(sp.unread) === "1";
  const page = parsePage(sp.page);
  const { start, end } = pageRange(page, PAGE_SIZE);
  const basePath = localePath(locale, NOTIFICATIONS_PAGE[surface]);
  const filters = unreadOnly ? { unread: "1" } : {};

  let rows: { data: NotificationItem[]; total: number };
  try {
    rows = await apiSessionList<NotificationItem>(NOTIFICATION_API[surface], {
      query: listQuery({ start, end }, { unread: unreadOnly ? "true" : undefined, locale }),
    });
  } catch (error) {
    if (isApiError(error) && error.status === 429) return <BusyState error={error} retryHref={pageHref(basePath, filters, page)} />;
    throw error;
  }
  const { data, total } = rows;
  // A page number past the end (an old bookmark, or everything on it was just read): back to the first page.
  if (data.length === 0 && total > 0 && page > 1) redirect(pageHref(basePath, filters, 1));

  const unreadOnScreen = data.some((item) => item.readAt === null);
  const newestId = data.reduce((newest, item) => Math.max(newest, item.id), 0);
  const showMarkAll = page === 1 && data.length > 0 && (unreadOnScreen || (unreadTotal ?? 0) > 0);
  const categoryLabels: Record<string, string> = t.categories;

  const tabs = [
    { key: "all", label: t.tabAll, href: basePath },
    {
      key: "unread",
      label: t.tabUnread,
      href: pageHref(basePath, { unread: "1" }, 1),
      count: unreadTotal !== null && unreadTotal > 0 ? unreadTextInline(unreadTotal, locale) : undefined,
    },
  ];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs label={t.tabsLabel} items={tabs} activeKey={unreadOnly ? "unread" : "all"} variant="pill" className="min-w-0" />
        {showMarkAll ? (
          <MarkAllRead
            surface={surface}
            locale={locale}
            upToId={newestId}
            labels={{ markAllRead: t.markAllRead, markedAll: t.markedAll, markedNone: t.markedNone }}
          />
        ) : null}
      </div>
      <Card id={NOTIFICATION_FEED_ID} tabIndex={-1}>
        {data.length === 0 ? (
          unreadOnly ? (
            <EmptyState
              icon={<BellOff aria-hidden="true" />}
              title={t.emptyUnreadTitle}
              description={t.emptyUnreadText}
              action={
                <ButtonLink href={basePath} variant="secondary">
                  {t.showAll}
                </ButtonLink>
              }
            />
          ) : (
            <EmptyState icon={<Bell aria-hidden="true" />} title={t.emptyTitle} description={t.emptyText} />
          )
        ) : (
          <>
            <ul className="divide-y divide-line">
              {data.map((item) => {
                const unread = item.readAt === null;
                const titleId = `notification-${item.id}-title`;
                const href = notificationHref(item.link, locale, surface);
                const category = Object.hasOwn(categoryLabels, item.category) ? categoryLabels[item.category] : undefined;
                return (
                  <li
                    key={item.id}
                    data-notification-id={item.id}
                    tabIndex={-1}
                    className={cn(
                      "grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 gap-y-3 px-4 py-4 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:px-5",
                      unread && "bg-surface-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-10 place-items-center rounded-full [&_svg]:size-5",
                        unread ? "bg-inverse text-on-inverse" : "bg-surface-sunken text-ink-muted",
                      )}
                    >
                      <CategoryIcon category={item.category} />
                    </span>
                    <div className="min-w-0">
                      {/* The text is in the language the API chose for it, which may not be the page's. */}
                      <div lang={item.locale} dir={dirOf(item.locale)}>
                        <h2 id={titleId} className={cn("break-words text-body text-ink", unread ? "font-bold" : "font-semibold")}>
                          {item.title}
                        </h2>
                        {item.body ? <p className="mt-1 whitespace-pre-line break-words text-body text-ink-muted">{item.body}</p> : null}
                      </div>
                      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-small text-ink-subtle">
                        {unread ? <Badge tone="inverse">{t.unread}</Badge> : null}
                        {category ? (
                          <>
                            <span>{category}</span>
                            <span aria-hidden="true">·</span>
                          </>
                        ) : null}
                        <time dateTime={item.createdAt}>{formatDateTime(item.createdAt, locale)}</time>
                      </p>
                    </div>
                    {href || unread ? (
                      <div className="max-sm:col-start-2 sm:self-start">
                        <NotificationActions
                          id={item.id}
                          surface={surface}
                          unread={unread}
                          href={href}
                          leavesList={unreadOnly}
                          titleId={titleId}
                          labels={{ open: t.open, markRead: t.markRead, markedRead: t.markedRead }}
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-line px-5 py-4">
              <Pagination total={total} pageSize={PAGE_SIZE} page={page} basePath={basePath} searchParams={filters} />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
