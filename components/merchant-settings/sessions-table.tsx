// Active sessions (GET /client/sessions, newest activity first): device summary, IP, last active, signed in, and the
// end-session action. Rendered on the server (dates in UTC, no hydration drift); only the buttons are client code.
import { Laptop, Smartphone } from "lucide-react";
import { sitePath } from "@/lib/site-path";
import type { MerchantSession } from "@/lib/api/types";
import type { MerchantSettingsMessages } from "@/lib/i18n/messages/merchant-settings";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { utcDateTime } from "./format";
import { SessionActions } from "./session-actions";
import { describeUserAgent } from "./user-agent";

type Props = {
  sessions: MerchantSession[];
  t: MerchantSettingsMessages["security"]["sessions"];
  utc: string;
};

export function SessionsTable({ sessions, t, utc }: Props) {
  const signInHref = `${sitePath("/sign-in")}?as=merchant`;
  const rows = [...sessions].sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt));
  return (
    <Card id="sessions" as="section">
      <CardHeader title={t.title} description={t.description} divided />
      <CardBody flush>
        {rows.length === 0 ? (
          <EmptyState compact title={t.empty} />
        ) : (
          <Table stacked caption={t.caption}>
            <TableHead>
              <tr>
                <TableHeaderCell>{t.device}</TableHeaderCell>
                <TableHeaderCell>{t.ip}</TableHeaderCell>
                <TableHeaderCell>{t.lastActive}</TableHeaderCell>
                <TableHeaderCell>{t.signedIn}</TableHeaderCell>
                <TableHeaderCell>
                  <span className="sr-only">{t.actions}</span>
                </TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {rows.map((s) => {
                const device = describeUserAgent(s.userAgent);
                const name =
                  device.browser && device.os
                    ? `${device.browser} · ${device.os}`
                    : (device.browser ?? device.os ?? t.unknownDevice);
                const Icon = device.mobile ? Smartphone : Laptop;
                return (
                  <TableRow key={s.id}>
                    <TableCell label={t.device}>
                      <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="inline-flex items-center gap-2 font-semibold">
                          <Icon aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
                          <span dir="ltr">{name}</span>
                        </span>
                        {s.current ? <Badge tone="success">{t.thisDevice}</Badge> : null}
                      </span>
                    </TableCell>
                    <TableCell label={t.ip}>
                      <span dir="ltr" className="num">
                        {s.ip || "—"}
                      </span>
                    </TableCell>
                    <TableCell label={t.lastActive}>{utcDateTime(s.lastSeenAt, utc)}</TableCell>
                    <TableCell label={t.signedIn}>{utcDateTime(s.createdAt, utc)}</TableCell>
                    <TableCell className="md:text-end">
                      <SessionActions
                        id={s.id}
                        current={s.current}
                        signInHref={signInHref}
                        t={{
                          end: t.end,
                          ending: t.ending,
                          signOut: t.signOut,
                          confirmTitle: t.confirmTitle,
                          confirmText: t.confirmText,
                          cancel: t.cancel,
                          ended: t.ended,
                        }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}
