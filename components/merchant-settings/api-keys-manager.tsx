"use client";
// API keys: the list (live first, revoked dimmed) and every action on it: create (secret shown once), edit name and
// allowed IPs, revoke. All dates arrive already formatted from the server (UTC), so nothing here depends on the
// browser's time zone. Mutations call the API from the browser, then refresh the route.
import { useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Ban, KeyRound, Pencil, Plus } from "lucide-react";
import { api } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import { pathOf } from "@/lib/api/query";
import type { ApiKey, ApiKeyCreated } from "@/lib/api/types";
import { fmt } from "@/lib/i18n/define";
import type { MerchantSettingsMessages } from "@/lib/i18n/messages/merchant-settings";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/layout/container";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { ProblemAlert, useFocusFirstInvalid, useFormProblem } from "./form-problem";
import { SecretModal } from "./secret-modal";

export const API_KEY_SCOPES = [
  "dhru",
  "account:read",
  "orders:read",
  "orders:write",
  "services:read",
  "account:*",
  "orders:*",
  "services:*",
] as const;

/** One key as the page shows it: raw values for actions, display strings for dates (formatted on the server). */
export type KeyRow = {
  id: number;
  name: string;
  prefix: string;
  scopes: string[];
  allowedIps: string[];
  rateLimitPerMin: number;
  /** "Nov 9, 2026" or null when never used. */
  lastUsed: string | null;
  lastUsedIp: string;
  /** "Dec 1, 2026" or null for no expiry. */
  expires: string | null;
  created: string;
  revoked: boolean;
  expired: boolean;
};

type ModalState =
  | { kind: "create"; minDate: string }
  | { kind: "secret"; name: string; secret: string }
  | { kind: "edit"; key: KeyRow }
  | { kind: "revoke"; key: KeyRow }
  | null;

type Props = {
  rows: KeyRow[];
  liveCount: number;
  max: number;
  t: MerchantSettingsMessages["apiKeys"];
  fieldTexts: MerchantSettingsMessages["fieldErrors"];
  optional: string;
};

/** One address or range per line (commas and spaces also separate); repeats dropped. */
export function parseIps(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).filter(Boolean))];
}

const scopeCopy = (t: Props["t"], scope: string) =>
  (t.scopeList as Record<string, { title: string; text: string } | undefined>)[scope] ?? { title: scope, text: "" };

export function ApiKeysManager({ rows, liveCount, max, t, fieldTexts, optional }: Props) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const { problem, fail, failFields, clear } = useFormProblem(fieldTexts);
  const createRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLDivElement>(null);
  useFocusFirstInvalid(createRef, problem);
  useFocusFirstInvalid(editRef, problem);

  const limitReached = liveCount >= max;
  const close = (kind: NonNullable<ModalState>["kind"]) => () => {
    setModal((m) => (m?.kind === kind ? null : m));
    clear();
  };
  const openCreate = () => {
    clear();
    const minDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    setModal({ kind: "create", minDate });
  };

  async function mutate<T>(action: () => Promise<T>, known: string[]): Promise<T | undefined> {
    setBusy(true);
    clear();
    try {
      const result = await action();
      startRefresh(() => router.refresh());
      return result;
    } catch (error) {
      // 422 on `name` with code `invalid` is the "10 active keys" rule.
      if (isApiError(error) && error.fieldError("name")?.code === "invalid") {
        failFields({ name: fmt(t.limitReached, { max }) });
      } else {
        fail(error, known);
      }
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function create(values: { name: string; scopes: string[]; ips: string[]; date: string }) {
    const body: { name: string; scopes: string[]; allowedIps?: string[]; expiresAt?: string } = {
      name: values.name,
      scopes: values.scopes,
    };
    if (values.ips.length > 0) body.allowedIps = values.ips;
    if (values.date) body.expiresAt = `${values.date}T23:59:59.999Z`;
    const created = await mutate(() => api.post<ApiKeyCreated>("/client/api-keys", body), ["name", "scopes", "allowedIps", "expiresAt"]);
    if (created) setModal({ kind: "secret", name: created.key.name, secret: created.secret });
  }

  async function edit(key: KeyRow, values: { name: string; ips: string[] }) {
    const body: { name?: string; allowedIps?: string[] } = {};
    if (values.name !== key.name) body.name = values.name;
    if (values.ips.join("\n") !== key.allowedIps.join("\n")) body.allowedIps = values.ips;
    if (Object.keys(body).length === 0) {
      setModal(null);
      return;
    }
    const saved = await mutate(() => api.patch<ApiKey>(pathOf("/client/api-keys/:id", { id: key.id }), body), ["name", "allowedIps"]);
    if (saved) {
      toast.success(t.saved);
      setModal(null);
    }
  }

  async function revoke(key: KeyRow) {
    const done = await mutate(async () => {
      await api.delete(pathOf("/client/api-keys/:id", { id: key.id }));
      return true;
    }, []);
    if (done) {
      toast.success(t.revokedToast);
      setModal(null);
    }
  }

  const header = (
    <PageHeader
      variant="card"
      title={t.title}
      description={t.description}
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <p className="num text-small text-ink-subtle">{fmt(t.countOf, { live: liveCount, max })}</p>
          <Button startIcon={<Plus aria-hidden="true" />} disabled={limitReached} onClick={openCreate}>
            {t.create}
          </Button>
        </div>
      }
    />
  );

  return (
    <div className="grid gap-4">
      {header}
      {limitReached ? <Alert tone="info">{fmt(t.limitReached, { max })}</Alert> : null}

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<KeyRound aria-hidden="true" />}
            title={t.empty}
            description={t.emptyText}
            action={
              <Button startIcon={<Plus aria-hidden="true" />} onClick={openCreate}>
                {t.create}
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className="grid gap-4">
          {rows.map((row) => (
            <li key={row.id}>
              <KeyCard row={row} t={t} onEdit={() => (clear(), setModal({ kind: "edit", key: row }))} onRevoke={() => (clear(), setModal({ kind: "revoke", key: row }))} />
            </li>
          ))}
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
            <Button type="submit" form="api-key-create" loading={busy || refreshing}>
              {t.createSubmit}
            </Button>
          </>
        }
      >
        <div ref={createRef}>
          {modal?.kind === "create" ? (
            <KeyForm
              id="api-key-create"
              mode="create"
              t={t}
              optional={optional}
              minDate={modal.minDate}
              problem={problem}
              failFields={failFields}
              onSubmit={create}
            />
          ) : null}
        </div>
      </Modal>

      <Modal
        open={modal?.kind === "edit"}
        onClose={close("edit")}
        title={t.editTitle}
        description={t.editText}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setModal(null)}>
              {t.cancel}
            </Button>
            <Button type="submit" form="api-key-edit" loading={busy || refreshing}>
              {t.save}
            </Button>
          </>
        }
      >
        <div ref={editRef}>
          {modal?.kind === "edit" ? (
            <KeyForm
              id="api-key-edit"
              mode="edit"
              t={t}
              optional={optional}
              initial={{ name: modal.key.name, ips: modal.key.allowedIps }}
              problem={problem}
              failFields={failFields}
              onSubmit={(v) => edit(modal.key, v)}
            />
          ) : null}
        </div>
      </Modal>

      <Modal
        open={modal?.kind === "revoke"}
        onClose={close("revoke")}
        size="sm"
        title={t.revokeTitle}
        description={modal?.kind === "revoke" ? fmt(t.revokeText, { name: modal.key.name }) : undefined}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setModal(null)}>
              {t.cancel}
            </Button>
            <Button variant="danger" loading={busy || refreshing} onClick={() => modal?.kind === "revoke" && revoke(modal.key)}>
              {t.revokeSubmit}
            </Button>
          </>
        }
      >
        <ProblemAlert problem={modal?.kind === "revoke" ? problem : null} />
      </Modal>

      <SecretModal
        open={modal?.kind === "secret"}
        onClose={close("secret")}
        title={t.secretTitle}
        warning={t.secretWarning}
        subject={modal?.kind === "secret" ? fmt(t.secretName, { name: modal.name }) : ""}
        secret={modal?.kind === "secret" ? modal.secret : ""}
        done={t.secretDone}
      />
    </div>
  );
}

function KeyCard({ row, t, onEdit, onRevoke }: { row: KeyRow; t: Props["t"]; onEdit: () => void; onRevoke: () => void }) {
  if (row.revoked) {
    // A revoked key is history: one dimmed line instead of the full card.
    return (
      <Card as="article" tone="muted">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3.5 sm:px-6">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="text-body font-semibold text-ink-muted" dir="auto">
              {row.name}
            </h2>
            <code dir="ltr" className="num rounded-badge bg-surface-sunken px-1.5 py-0.5 font-mono text-small text-ink-muted">
              {row.prefix}…
            </code>
            <Badge tone="neutral">{t.revoked}</Badge>
          </div>
          <p className="text-small text-ink-subtle">
            {t.createdAt}: {row.created}
            <span aria-hidden="true"> · </span>
            {t.lastUsed}: {row.lastUsed ?? t.neverUsed}
          </p>
        </div>
      </Card>
    );
  }
  const state = row.expired ? { tone: "warning" as const, label: t.expired } : { tone: "success" as const, label: t.active };
  return (
    <Card as="article" tone={row.expired ? "muted" : "default"}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="min-w-0">
          <h2 className="text-subheading text-ink" dir="auto">
            {row.name}
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-small text-ink-subtle">
            <code dir="ltr" className="num rounded-badge bg-surface-sunken px-1.5 py-0.5 font-mono text-ink-muted">
              {row.prefix}…
            </code>
            <Badge tone={state.tone}>{state.label}</Badge>
          </p>
        </div>
        <div role="group" aria-label={fmt(t.actionsFor, { name: row.name })} className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" startIcon={<Pencil aria-hidden="true" />} onClick={onEdit}>
            {t.edit}
            <span className="sr-only"> {row.name}</span>
          </Button>
          <Button size="sm" variant="secondary" startIcon={<Ban aria-hidden="true" />} onClick={onRevoke}>
            {t.revoke}
            <span className="sr-only"> {row.name}</span>
          </Button>
        </div>
      </div>
      <dl className="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
        <Detail label={t.scopes} wide>
          <span className="flex flex-wrap gap-1.5">
            {row.scopes.map((s) => (
              <Badge key={s} tone="outline" shape="tag" title={scopeCopy(t, s).text || undefined}>
                <span dir="ltr">{s}</span>
              </Badge>
            ))}
          </span>
        </Detail>
        <Detail label={t.allowedIps}>
          {row.allowedIps.length === 0 ? (
            t.anyIp
          ) : (
            <bdi dir="ltr" className="num break-words">
              {row.allowedIps.join(", ")}
            </bdi>
          )}
        </Detail>
        <Detail label={t.rate}>{fmt(t.perMinute, { count: row.rateLimitPerMin })}</Detail>
        <Detail label={t.lastUsed}>
          {row.lastUsed ? (
            <>
              {row.lastUsed}
              {row.lastUsedIp ? (
                <span className="block text-small font-normal text-ink-subtle">
                  <bdi dir="ltr" className="num">
                    {row.lastUsedIp}
                  </bdi>
                </span>
              ) : null}
            </>
          ) : (
            t.neverUsed
          )}
        </Detail>
        <Detail label={t.expires}>{row.expires ?? t.noExpiry}</Detail>
        <Detail label={t.createdAt}>{row.created}</Detail>
      </dl>
    </Card>
  );
}

function Detail({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={cn("min-w-0", wide && "sm:col-span-2 lg:col-span-3")}>
      <dt className="text-small text-ink-subtle">{label}</dt>
      <dd className="mt-0.5 text-body font-medium text-ink">{children}</dd>
    </div>
  );
}

type FormProps = {
  id: string;
  mode: "create" | "edit";
  t: Props["t"];
  optional: string;
  minDate?: string;
  initial?: { name: string; ips: string[] };
  problem: ReturnType<typeof useFormProblem>["problem"];
  failFields: (fields: Record<string, string>) => void;
  onSubmit: (values: { name: string; scopes: string[]; ips: string[]; date: string }) => void;
};

function KeyForm({ id, mode, t, optional, minDate, initial, problem, failFields, onSubmit }: FormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [scopes, setScopes] = useState<string[]>([]);
  const [ipsText, setIpsText] = useState((initial?.ips ?? []).join("\n"));
  const [date, setDate] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ips = parseIps(ipsText);
    const local: Record<string, string> = {};
    if (!name.trim()) local.name = t.nameRequired;
    if (mode === "create" && scopes.length === 0) local.scopes = t.scopesRequired;
    if (ips.length > 20) local.allowedIps = t.ipsTooMany;
    if (mode === "create" && date && minDate && date < minDate) local.expiresAt = t.expiresPast;
    if (Object.keys(local).length > 0) {
      failFields(local);
      return;
    }
    onSubmit({ name: name.trim(), scopes: API_KEY_SCOPES.filter((s) => scopes.includes(s)), ips, date });
  }

  // `allowedIps.N` errors name an entry by position: show which address was refused.
  const entries = parseIps(ipsText);
  const ipErrors = Object.entries(problem?.fields ?? {})
    .filter(([path]) => path === "allowedIps" || path.startsWith("allowedIps."))
    .map(([path, text]) => {
      const entry = entries[Number(path.split(".")[1])];
      return entry ? `${entry}: ${text}` : text;
    });

  return (
    <form id={id} onSubmit={submit} noValidate className="grid gap-5">
      <ProblemAlert problem={problem} />
      <Input
        label={t.name}
        required
        name="name"
        maxLength={60}
        autoComplete="off"
        hint={t.nameHint}
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={problem?.fields.name}
      />
      {mode === "create" ? (
        <fieldset aria-describedby="scopes-hint scopes-error" className="grid gap-1">
          <legend className="text-small font-semibold text-ink">
            {t.scopesLegend}
            <span aria-hidden="true" className="ms-0.5 text-danger-ink">
              *
            </span>
          </legend>
          <p id="scopes-hint" className="text-small text-ink-subtle">
            {t.scopesHint}
          </p>
          <div className="mt-1 grid gap-0.5">
            {API_KEY_SCOPES.map((scope) => (
              <Checkbox
                key={scope}
                label={scopeCopy(t, scope).title}
                description={
                  <>
                    <bdi dir="ltr" className="num">
                      {scope}
                    </bdi>
                    {` · ${scopeCopy(t, scope).text}`}
                  </>
                }
                checked={scopes.includes(scope)}
                onChange={(e) => setScopes((list) => (e.target.checked ? [...list, scope] : list.filter((s) => s !== scope)))}
              />
            ))}
          </div>
          <div id="scopes-error" aria-live="polite">
            {problem?.fields.scopes ? <p className="text-small font-medium text-danger-ink">{problem.fields.scopes}</p> : null}
          </div>
        </fieldset>
      ) : null}
      <Textarea
        label={t.ipsLabel}
        optionalLabel={optional}
        name="allowedIps"
        rows={4}
        dir="ltr"
        spellCheck={false}
        autoComplete="off"
        placeholder="203.0.113.10&#10;198.51.100.0/24"
        hint={t.ipsHint}
        value={ipsText}
        onChange={(e) => setIpsText(e.target.value)}
        error={ipErrors.length > 0 ? ipErrors.join(" · ") : undefined}
      />
      {mode === "create" ? (
        <Input
          label={t.expiresLabel}
          optionalLabel={optional}
          name="expiresAt"
          type="date"
          min={minDate}
          hint={t.expiresHint}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          error={problem?.fields.expiresAt}
          fieldClassName="max-w-xs"
        />
      ) : null}
    </form>
  );
}
