"use client";
// Webhook endpoints: the list and every action on it: create (signing secret shown once), edit URL and events,
// switch on/off, send a test event, delete. Dates arrive formatted from the server (UTC). Mutations call the API
// from the browser, then refresh the route.
import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { History, Pencil, Plus, Send, Trash2, Webhook as WebhookIcon } from "lucide-react";
import { api } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import { pathOf } from "@/lib/api/query";
import type { Webhook, WebhookCreated } from "@/lib/api/types";
import { fmt } from "@/lib/i18n/define";
import { useErrorText } from "@/lib/i18n/error-text";
import type { MerchantSettingsMessages } from "@/lib/i18n/messages/merchant-settings";
import { PageHeader } from "@/components/layout/container";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Switch } from "@/components/ui/checkbox";
import { Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { ProblemAlert, useFocusFirstInvalid, useFormProblem } from "./form-problem";
import { SecretModal } from "./secret-modal";

export const WEBHOOK_EVENTS = ["order.status_changed", "wallet.low_balance", "invoice.paid", "service.price_changed"] as const;
type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export type WebhookRow = {
  id: number;
  url: string;
  events: string[];
  isActive: boolean;
  failureCount: number;
  /** "Nov 9, 2026" */
  created: string;
};

type ModalState =
  | { kind: "create" }
  | { kind: "secret"; url: string; secret: string }
  | { kind: "edit"; row: WebhookRow }
  | { kind: "delete"; row: WebhookRow }
  | null;

type Props = {
  rows: WebhookRow[];
  max: number;
  /** Language-prefixed `/merchant/webhooks`: the delivery log of an endpoint is `<base>/<id>`. */
  basePath: string;
  t: MerchantSettingsMessages["webhooks"];
  fieldTexts: MerchantSettingsMessages["fieldErrors"];
};

const eventCopy = (t: Props["t"], event: string) =>
  (t.eventList as Record<string, { title: string; text: string } | undefined>)[event] ?? { title: event, text: "" };

export function WebhooksManager({ rows, max, basePath, t, fieldTexts }: Props) {
  const router = useRouter();
  const errorText = useErrorText();
  const [modal, setModal] = useState<ModalState>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  /** Switch positions the server has not confirmed yet: `{ id: { from, to } }`. */
  const [flips, setFlips] = useState<Record<number, { from: boolean; to: boolean }>>({});
  const [testing, setTesting] = useState<number | null>(null);
  const { problem, fail, failFields, clear } = useFormProblem(fieldTexts);
  const createRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLDivElement>(null);
  useFocusFirstInvalid(createRef, problem);
  useFocusFirstInvalid(editRef, problem);

  const limitReached = rows.length >= max;
  const refresh = () => startRefresh(() => router.refresh());
  const close = (kind: NonNullable<ModalState>["kind"]) => () => {
    setModal((m) => (m?.kind === kind ? null : m));
    clear();
  };
  const open = (next: ModalState) => {
    clear();
    setModal(next);
  };

  async function mutate<T>(action: () => Promise<T>, known: string[]): Promise<T | undefined> {
    setBusy(true);
    clear();
    try {
      const result = await action();
      refresh();
      return result;
    } catch (error) {
      // `url` + `invalid` is "private host" (the 5-endpoint rule is stopped before the request).
      if (isApiError(error) && error.fieldError("url")?.code === "invalid") failFields({ url: t.urlRejected });
      else fail(error, known);
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function create(values: { url: string; events: string[]; isActive: boolean }) {
    const created = await mutate(() => api.post<WebhookCreated>("/client/webhooks", values), ["url", "events", "isActive"]);
    if (created) setModal({ kind: "secret", url: created.endpoint.url, secret: created.secret });
  }

  async function edit(row: WebhookRow, values: { url: string; events: string[] }) {
    const body: { url?: string; events?: string[] } = {};
    if (values.url !== row.url) body.url = values.url;
    if (values.events.join() !== WEBHOOK_EVENTS.filter((e) => row.events.includes(e)).join()) body.events = values.events;
    if (Object.keys(body).length === 0) {
      setModal(null);
      return;
    }
    const saved = await mutate(() => api.patch<Webhook>(pathOf("/client/webhooks/:id", { id: row.id }), body), ["url", "events"]);
    if (saved) {
      toast.success(t.saved);
      setModal(null);
    }
  }

  async function remove(row: WebhookRow) {
    const done = await mutate(async () => {
      await api.delete(pathOf("/client/webhooks/:id", { id: row.id }));
      return true;
    }, []);
    if (done) {
      toast.success(t.deletedToast);
      setModal(null);
    }
  }

  async function toggle(row: WebhookRow, to: boolean) {
    setFlips((f) => ({ ...f, [row.id]: { from: row.isActive, to } }));
    try {
      await api.patch<Webhook>(pathOf("/client/webhooks/:id", { id: row.id }), { isActive: to });
      refresh();
    } catch (error) {
      setFlips((f) => Object.fromEntries(Object.entries(f).filter(([id]) => Number(id) !== row.id)));
      toast.error(errorText.message(error));
    }
  }

  async function sendTest(row: WebhookRow) {
    setTesting(row.id);
    try {
      await api.post(pathOf("/client/webhooks/:id/test", { id: row.id })); // no body
      toast.success(t.testSent, t.testSentText);
    } catch (error) {
      toast.error(isApiError(error) && error.code === "INVALID_TRANSITION" ? t.paused : errorText.message(error));
    } finally {
      setTesting(null);
    }
  }

  const heading = (
    <PageHeader
      variant="card"
      title={t.title}
      description={t.description}
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <p className="num text-small text-ink-subtle">{fmt(t.countOf, { count: rows.length, max })}</p>
          <Button startIcon={<Plus aria-hidden="true" />} disabled={limitReached} onClick={() => open({ kind: "create" })}>
            {t.create}
          </Button>
        </div>
      }
    />
  );

  return (
    <div className="grid gap-4">
      {heading}
      {limitReached ? <Alert tone="info">{fmt(t.limitReached, { max })}</Alert> : null}

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<WebhookIcon aria-hidden="true" />}
            title={t.empty}
            description={t.emptyText}
            action={
              <Button startIcon={<Plus aria-hidden="true" />} onClick={() => open({ kind: "create" })}>
                {t.create}
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className="grid gap-4">
          {rows.map((row) => {
            const flip = flips[row.id];
            const checked = flip && row.isActive === flip.from ? flip.to : row.isActive;
            return (
              <li key={row.id}>
                <Card as="article">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-5 pt-5 sm:px-6 sm:pt-6">
                    <div className="min-w-0 flex-1 basis-64">
                      <h2 className="num break-all font-mono text-body font-semibold text-ink" dir="ltr">
                        {row.url}
                      </h2>
                      <p className="mt-1.5 flex flex-wrap items-center gap-2 text-small text-ink-subtle">
                        <Badge tone={checked ? "success" : "warning"}>{checked ? t.active : t.pausedTitle}</Badge>
                        <span>
                          {t.createdAt}: {row.created}
                        </span>
                      </p>
                    </div>
                    <div role="group" aria-label={fmt(t.actionsFor, { url: row.url })} className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        startIcon={<Send aria-hidden="true" />}
                        loading={testing === row.id}
                        onClick={() => sendTest(row)}
                      >
                        {t.test}
                      </Button>
                      <ButtonLink size="sm" variant="secondary" startIcon={<History aria-hidden="true" />} href={`${basePath}/${row.id}`}>
                        {t.deliveries}
                      </ButtonLink>
                      <Button size="sm" variant="secondary" startIcon={<Pencil aria-hidden="true" />} onClick={() => open({ kind: "edit", row })}>
                        {t.edit}
                      </Button>
                      <Button size="sm" variant="secondary" startIcon={<Trash2 aria-hidden="true" />} onClick={() => open({ kind: "delete", row })}>
                        {t.delete}
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:p-6">
                    <dl className="grid gap-4">
                      <div>
                        <dt className="text-small text-ink-subtle">{t.events}</dt>
                        <dd className="mt-1 flex flex-wrap gap-1.5">
                          {row.events.map((e) => (
                            <Badge key={e} tone="outline" shape="tag" title={eventCopy(t, e).text || undefined}>
                              <span dir="ltr">{e}</span>
                            </Badge>
                          ))}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-small text-ink-subtle">{t.failures}</dt>
                        <dd className="mt-0.5 text-body font-medium text-ink">
                          {row.failureCount > 0 ? fmt(t.failuresText, { count: row.failureCount }) : t.noFailures}
                        </dd>
                      </div>
                    </dl>
                    <div className="sm:w-64">
                      <Switch
                        label={t.activeLabel}
                        description={t.activeHint}
                        checked={checked}
                        disabled={flip !== undefined && row.isActive === flip.from}
                        onChange={(e) => toggle(row, e.target.checked)}
                      />
                      {!checked ? <p className="mt-1 text-small text-warning-ink">{t.pausedText}</p> : null}
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={modal?.kind === "create"}
        onClose={close("create")}
        title={t.createTitle}
        description={t.createText}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setModal(null)}>
              {t.cancel}
            </Button>
            <Button type="submit" form="webhook-create" loading={busy || refreshing}>
              {t.createSubmit}
            </Button>
          </>
        }
      >
        <div ref={createRef}>
          {modal?.kind === "create" ? (
            <EndpointForm id="webhook-create" mode="create" t={t} problem={problem} failFields={failFields} onSubmit={create} />
          ) : null}
        </div>
      </Modal>

      <Modal
        open={modal?.kind === "edit"}
        onClose={close("edit")}
        title={t.editTitle}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setModal(null)}>
              {t.cancel}
            </Button>
            <Button type="submit" form="webhook-edit" loading={busy || refreshing}>
              {t.save}
            </Button>
          </>
        }
      >
        <div ref={editRef}>
          {modal?.kind === "edit" ? (
            <EndpointForm
              id="webhook-edit"
              mode="edit"
              t={t}
              initial={{ url: modal.row.url, events: modal.row.events }}
              problem={problem}
              failFields={failFields}
              onSubmit={(v) => edit(modal.row, v)}
            />
          ) : null}
        </div>
      </Modal>

      <Modal
        open={modal?.kind === "delete"}
        onClose={close("delete")}
        size="sm"
        title={t.deleteTitle}
        description={modal?.kind === "delete" ? fmt(t.deleteText, { url: modal.row.url }) : undefined}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setModal(null)}>
              {t.cancel}
            </Button>
            <Button variant="danger" loading={busy || refreshing} onClick={() => modal?.kind === "delete" && remove(modal.row)}>
              {t.deleteSubmit}
            </Button>
          </>
        }
      >
        <ProblemAlert problem={modal?.kind === "delete" ? problem : null} />
      </Modal>

      <SecretModal
        open={modal?.kind === "secret"}
        onClose={close("secret")}
        title={t.secretTitle}
        warning={t.secretWarning}
        subject={modal?.kind === "secret" ? fmt(t.secretFor, { url: modal.url }) : ""}
        secret={modal?.kind === "secret" ? modal.secret : ""}
        done={t.secretDone}
      />
    </div>
  );
}

type FormProps = {
  id: string;
  mode: "create" | "edit";
  t: Props["t"];
  initial?: { url: string; events: string[] };
  problem: ReturnType<typeof useFormProblem>["problem"];
  failFields: (fields: Record<string, string>) => void;
  onSubmit: (values: { url: string; events: WebhookEvent[]; isActive: boolean }) => void;
};

function EndpointForm({ id, mode, t, initial, problem, failFields, onSubmit }: FormProps) {
  const [url, setUrl] = useState(initial?.url ?? "https://");
  const [events, setEvents] = useState<string[]>(initial?.events ?? []);
  const [isActive, setIsActive] = useState(true);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const local: Record<string, string> = {};
    const trimmed = url.trim();
    if (trimmed === "" || trimmed === "https://") local.url = t.urlRequired;
    else if (!/^https:\/\//i.test(trimmed)) local.url = t.urlInsecure;
    if (events.length === 0) local.events = t.eventsRequired;
    if (Object.keys(local).length > 0) {
      failFields(local);
      return;
    }
    onSubmit({ url: trimmed, events: WEBHOOK_EVENTS.filter((e) => events.includes(e)), isActive });
  }

  return (
    <form id={id} onSubmit={submit} noValidate className="grid gap-5">
      <ProblemAlert problem={problem} />
      <Input
        label={t.url}
        required
        name="url"
        type="url"
        maxLength={2048}
        autoComplete="off"
        spellCheck={false}
        hint={t.urlHint}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        error={problem?.fields.url}
      />
      <fieldset aria-describedby="events-error" className="grid gap-1">
        <legend className="text-small font-semibold text-ink">
          {t.eventsLegend}
          <span aria-hidden="true" className="ms-0.5 text-danger-ink">
            *
          </span>
        </legend>
        <div className="mt-1 grid gap-0.5">
          {WEBHOOK_EVENTS.map((event) => (
            <Checkbox
              key={event}
              label={eventCopy(t, event).title}
              description={
                <>
                  <bdi dir="ltr" className="num">
                    {event}
                  </bdi>
                  {` · ${eventCopy(t, event).text}`}
                </>
              }
              checked={events.includes(event)}
              onChange={(e) => setEvents((list) => (e.target.checked ? [...list, event] : list.filter((x) => x !== event)))}
            />
          ))}
        </div>
        <div id="events-error" aria-live="polite">
          {problem?.fields.events ? <p className="text-small font-medium text-danger-ink">{problem.fields.events}</p> : null}
        </div>
      </fieldset>
      {mode === "create" ? <Switch label={t.startActive} checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> : null}
    </form>
  );
}
