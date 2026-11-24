"use client";
// Notification preferences (PUT /client/notification-preferences): the low-balance threshold and the per-event email
// switches. Only what changed is sent. An older API also lists a `telegram` flag on each event and requires it on a saved
// row: the form never offers it and sends back the value the GET showed (see `changedEventRows`); an API that does not
// list it gets none. An event the site has no copy for keeps the API's label.
import { useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import type { NotificationPreferences } from "@/lib/api/types";
import { useErrorText } from "@/lib/i18n/error-text";
import type { MerchantSettingsMessages } from "@/lib/i18n/messages/merchant-settings";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/toast";
import { isMoneyInput, trimMoney } from "./format";
import { ProblemAlert, useFocusFirstInvalid, useFormProblem } from "./form-problem";

/** What the API showed for one event: the email switch, and the older API's `telegram` flag, kept only to send it back. */
export type EventState = { email: boolean; telegram?: boolean };
export type EventMap = Record<string, EventState>;
export type EventRow = { event: string; email: boolean; telegram?: boolean };

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

/** The events as the API showed them; a `telegram` flag is kept only when the API sent one. */
export function toEventMap(events: NotificationPreferences["events"]): EventMap {
  return Object.fromEntries(
    events.map((e) => [e.event, e.telegram === undefined ? { email: e.email } : { email: e.email, telegram: e.telegram }]),
  );
}

/**
 * The rows to PUT, in list order: the events whose email switch differs from what the server last showed (`base`).
 * A row carries the `telegram` value of `base` when the API showed one (an older API requires it and accepts the value
 * it showed), and none otherwise.
 */
export function changedEventRows(order: string[], working: EventMap, base: EventMap): EventRow[] {
  const rows: EventRow[] = [];
  for (const event of order) {
    const now = working[event] ?? { email: false };
    const was = base[event] ?? { email: false };
    if (now.email === was.email) continue;
    rows.push(was.telegram === undefined ? { event, email: now.email } : { event, email: now.email, telegram: was.telegram });
  }
  return rows;
}

type Props = {
  initial: NotificationPreferences;
  t: MerchantSettingsMessages["notifications"];
  fieldTexts: MerchantSettingsMessages["fieldErrors"];
};

export function NotificationsForm({ initial, t, fieldTexts }: Props) {
  const errorText = useErrorText();
  const formRef = useRef<HTMLFormElement>(null);
  const [order] = useState(() => initial.events.map((e) => ({ event: e.event, label: e.label })));
  const [base, setBase] = useState(() => ({
    threshold: trimMoney(initial.lowBalanceThreshold ?? ""),
    events: toEventMap(initial.events),
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
  );
  const dirty = thresholdChanged || changedEvents.length > 0;
  const [emailBefore, emailAfter = ""] = t.emailText.split("{address}");

  function setEmail(event: string, value: boolean) {
    setEvents((m) => ({ ...m, [event]: { ...m[event], email: value } }));
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
      const next = { threshold: trimMoney(saved.lowBalanceThreshold ?? ""), events: toEventMap(saved.events) };
      setBase(next);
      setThreshold(next.threshold);
      setEvents(next.events);
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
            <p className="text-body text-ink-muted">{t.eventsText}</p>
            <ul className="mt-2 divide-y divide-line rounded-card border border-line">
              {order.map((o) => {
                const key = EVENT_KEYS[o.event];
                const copy = key ? t.eventList[key] : { title: o.label, text: "" };
                const titleId = `event-${o.event.replace(/\W/g, "-")}`;
                const value = events[o.event] ?? { email: false };
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
                        onChange={(e) => setEmail(o.event, e.target.checked)}
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
  );
}
