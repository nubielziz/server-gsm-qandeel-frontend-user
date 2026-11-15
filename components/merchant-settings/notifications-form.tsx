"use client";
// Notification preferences (PUT /client/notification-preferences): the low-balance threshold, per-event email and
// Telegram switches, and the Telegram link (POST /client/telegram/link, no body). Only what changed is sent.
// Until Telegram is linked its switches are disabled and every row goes back with the Telegram value the GET showed (the
// server accepts that value, and answers 422 `events.N.telegram` "Link Telegram first." only when a row switches Telegram
// on; Announcements start with Telegram on, which takes effect once a chat is linked). In a setup with no bot the link
// answers 503 UNAVAILABLE ("not available yet"). An event the site has no copy for keeps the API's label.
import { useRef, useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { api } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import type { NotificationPreferences } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";
import { useErrorText } from "@/lib/i18n/error-text";
import type { Locale } from "@/lib/i18n/config";
import type { MerchantSettingsMessages } from "@/lib/i18n/messages/merchant-settings";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/toast";
import { isMoneyInput, trimMoney } from "./format";
import { ProblemAlert, useFocusFirstInvalid, useFormProblem } from "./form-problem";

export type Channels = { email: boolean; telegram: boolean };
export type EventMap = Record<string, Channels>;
export type EventRow = { event: string } & Channels;

/** The API's event names → keys of `t.eventList`. */
const EVENT_KEYS: Record<string, keyof MerchantSettingsMessages["notifications"]["eventList"]> = {
  "wallet.low_balance": "walletLowBalance",
  "service.price_changed": "servicePriceChanged",
  "deposit.approved": "depositApproved",
  "invoice.paid": "invoicePaid",
  "order.completed": "orderCompleted",
  "order.failed": "orderFailed",
  "broadcast.announcement": "broadcastAnnouncement",
};

function toMap(events: NotificationPreferences["events"]): EventMap {
  return Object.fromEntries(events.map((e) => [e.event, { email: e.email, telegram: e.telegram }]));
}

/**
 * The rows to PUT, in list order: the events whose switches differ from what the server last showed (`base`).
 * While Telegram is not linked, a row carries the Telegram value of `base` whatever `working` says.
 */
export function changedEventRows(order: string[], working: EventMap, base: EventMap, linked: boolean): EventRow[] {
  const rows: EventRow[] = [];
  for (const event of order) {
    const now = working[event] ?? { email: false, telegram: false };
    const was = base[event] ?? { email: false, telegram: false };
    const telegram = linked ? now.telegram : was.telegram;
    if (now.email !== was.email || telegram !== was.telegram) rows.push({ event, email: now.email, telegram });
  }
  return rows;
}

type Props = {
  locale: Locale;
  initial: NotificationPreferences;
  t: MerchantSettingsMessages["notifications"];
  fieldTexts: MerchantSettingsMessages["fieldErrors"];
};

export function NotificationsForm({ locale, initial, t, fieldTexts }: Props) {
  const errorText = useErrorText();
  const formRef = useRef<HTMLFormElement>(null);
  const [order] = useState(() => initial.events.map((e) => ({ event: e.event, label: e.label })));
  const [linked, setLinked] = useState(initial.telegram.linked);
  const [base, setBase] = useState(() => ({
    threshold: trimMoney(initial.lowBalanceThreshold ?? ""),
    events: toMap(initial.events),
  }));
  const [threshold, setThreshold] = useState(base.threshold);
  const [events, setEvents] = useState<EventMap>(base.events);
  const [saving, setSaving] = useState(false);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const { problem, fail, failFields, clear } = useFormProblem(fieldTexts);
  useFocusFirstInvalid(formRef, problem);

  // What changed since the last save.
  const thresholdValue = threshold.trim();
  const thresholdChanged = thresholdValue !== base.threshold;
  const changedEvents = changedEventRows(
    order.map((o) => o.event),
    events,
    base.events,
    linked,
  );
  const dirty = thresholdChanged || changedEvents.length > 0;
  const [emailBefore, emailAfter = ""] = t.emailText.split("{address}");

  function setChannel(event: string, channel: keyof Channels, value: boolean) {
    setEvents((m) => ({ ...m, [event]: { ...m[event], [channel]: value } }));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!dirty || saving) return;
    if (thresholdValue !== "" && !isMoneyInput(thresholdValue)) {
      failFields({ lowBalanceThreshold: t.thresholdInvalid });
      return;
    }
    const body: { lowBalanceThreshold?: string | null; events?: EventRow[] } = {};
    if (thresholdChanged) body.lowBalanceThreshold = thresholdValue === "" ? null : thresholdValue;
    if (changedEvents.length > 0) body.events = changedEvents;
    clear();
    setRowErrors({});
    setSaving(true);
    try {
      const saved = await api.put<NotificationPreferences>("/client/notification-preferences", body);
      const next = { threshold: trimMoney(saved.lowBalanceThreshold ?? ""), events: toMap(saved.events) };
      setBase(next);
      setThreshold(next.threshold);
      setEvents(next.events);
      setLinked(saved.telegram.linked);
      toast.success(t.saved);
    } catch (error) {
      // `events.N.*` errors index the list we sent: show them on the matching event row.
      const rows: Record<string, string> = {};
      if (isApiError(error)) {
        for (const fe of error.fieldErrors) {
          const m = /^events\.(\d+)\./.exec(fe.field);
          const sent = m ? changedEvents[Number(m[1])] : undefined;
          if (sent) rows[sent.event] ??= fieldTexts[fe.code as keyof typeof fieldTexts] ?? errorText.field(fe) ?? "";
        }
      }
      setRowErrors(rows);
      fail(error, ["lowBalanceThreshold", "events"]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4">
      <TelegramCard
        locale={locale}
        linked={linked}
        t={t}
        onLinkedChange={setLinked}
      />
      <Card as="section">
        <form ref={formRef} onSubmit={onSubmit} noValidate aria-busy={saving || undefined} className="flex min-w-0 flex-col">
          <CardHeader title={t.title} description={t.description} divided />
          <CardBody className="grid gap-6">
            <ProblemAlert problem={problem} />

            <div className="grid gap-1">
              <p className="text-body font-semibold text-ink">{t.email}</p>
              <p className="text-body text-ink-muted">
                {emailBefore}
                <span dir="ltr" className="font-medium text-ink">
                  {initial.email.address}
                </span>
                {emailAfter}
              </p>
              <p className="text-small text-ink-subtle">{t.alwaysSent}</p>
            </div>

            <section aria-labelledby="threshold-title" className="grid gap-3">
              <h3 id="threshold-title" className="text-subheading text-ink">
                {t.threshold}
              </h3>
              <Input
                label={t.thresholdLabel}
                name="lowBalanceThreshold"
                inputMode="decimal"
                dir="ltr"
                autoComplete="off"
                placeholder="0.00"
                hint={t.thresholdHint}
                trailing={<span className="pe-2 text-small font-semibold text-ink-subtle">USD</span>}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                error={problem?.fields.lowBalanceThreshold}
                fieldClassName="max-w-xs"
              />
            </section>

            <section aria-labelledby="events-title" className="grid gap-1">
              <h3 id="events-title" className="text-subheading text-ink">
                {t.events}
              </h3>
              <p className="text-body text-ink-muted">{linked ? t.eventsText : t.telegramFirst}</p>
              <ul className="mt-2 divide-y divide-line rounded-card border border-line">
                {order.map((o) => {
                  const key = EVENT_KEYS[o.event];
                  const copy = key ? t.eventList[key] : { title: o.label, text: "" };
                  const titleId = `event-${o.event.replace(/\W/g, "-")}`;
                  const value = events[o.event] ?? { email: false, telegram: false };
                  return (
                    <li key={o.event} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
                      <div className="min-w-0 flex-1 basis-56">
                        <p id={titleId} className="text-body font-semibold text-ink">
                          {copy.title}
                        </p>
                        {copy.text ? <p className="text-small text-ink-subtle">{copy.text}</p> : null}
                        {rowErrors[o.event] ? (
                          <p role="alert" className="mt-1 text-small font-medium text-danger-ink">
                            {rowErrors[o.event]}
                          </p>
                        ) : null}
                      </div>
                      <div role="group" aria-labelledby={titleId} className="flex shrink-0 flex-wrap items-center gap-x-6">
                        <Switch
                          label={t.emailSwitch}
                          wrapperClassName="gap-3"
                          checked={value.email}
                          onChange={(e) => setChannel(o.event, "email", e.target.checked)}
                        />
                        <Switch
                          label={t.telegramSwitch}
                          wrapperClassName="gap-3"
                          checked={value.telegram}
                          disabled={!linked}
                          onChange={(e) => setChannel(o.event, "telegram", e.target.checked)}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          </CardBody>
          <CardFooter>
            <p className="text-small text-ink-subtle" aria-live="polite">
              {dirty ? t.footerHint : t.footerClean}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                disabled={!dirty || saving}
                onClick={() => {
                  setThreshold(base.threshold);
                  setEvents(base.events);
                  setRowErrors({});
                  clear();
                }}
              >
                {t.discard}
              </Button>
              <Button type="submit" loading={saving} disabled={!dirty}>
                {t.save}
              </Button>
            </div>
            <span role="status" className="sr-only">
              {saving ? t.saving : ""}
            </span>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

function TelegramCard({
  locale,
  linked,
  t,
  onLinkedChange,
}: {
  locale: Locale;
  linked: boolean;
  t: MerchantSettingsMessages["notifications"];
  onLinkedChange: (linked: boolean) => void;
}) {
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  async function createLink() {
    setBusy(true);
    setUnavailable(false);
    try {
      const made = await api.post<{ url: string; expiresAt: string }>("/client/telegram/link");
      setLink(made);
      // Only ever open a Telegram address; the button below stays for popup blockers.
      try {
        if (new URL(made.url).hostname === "t.me") window.open(made.url, "_blank", "noopener,noreferrer");
      } catch {
        /* a malformed URL is never opened */
      }
    } catch (error) {
      if (isApiError(error) && error.code === "UNAVAILABLE") setUnavailable(true);
      else toast.error(errorText.message(error));
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    setChecking(true);
    try {
      const prefs = await api.get<NotificationPreferences>("/client/notification-preferences");
      onLinkedChange(prefs.telegram.linked);
      if (prefs.telegram.linked) setLink(null);
    } catch (error) {
      toast.error(errorText.message(error));
    } finally {
      setChecking(false);
    }
  }

  return (
    <Card as="section">
      <CardHeader
        title={t.telegram}
        description={t.telegramText}
        divided
        actions={<Badge tone={linked ? "success" : "neutral"}>{linked ? t.telegramLinked : t.telegramNotLinked}</Badge>}
      />
      <CardBody className="grid gap-4">
        {unavailable ? <Alert tone="info">{t.unavailable}</Alert> : null}
        {link ? (
          <Alert tone="info" action={<ButtonLink href={link.url} external variant="secondary" size="sm">{t.linkOpen}</ButtonLink>}>
            {fmt(t.linkReady, { time: formatDate(link.expiresAt, locale, { timeStyle: "short" }) })}
          </Alert>
        ) : null}
        {linked ? (
          <p className="text-small text-ink-subtle">{t.telegramUnlink}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button startIcon={<Send aria-hidden="true" />} loading={busy} onClick={createLink}>
              {t.link}
            </Button>
            {link ? (
              <Button variant="secondary" loading={checking} onClick={check}>
                {t.linkRefresh}
              </Button>
            ) : null}
            <span role="status" className="sr-only">
              {busy ? t.linking : ""}
            </span>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
