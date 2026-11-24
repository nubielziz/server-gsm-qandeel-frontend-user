"use client";
// NewTicketForm: opens a support ticket (`POST /store/v1/tickets`, Turnstile). Answer: the ticket, plus its `token` ONLY
// when an order tracking token was given (handoff §5.7). With a token we go straight to the conversation page; without
// one the only way back in is the link in the receipt email, so the page says that and shows the ticket number.
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Mail } from "lucide-react";
import { api } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import type { TicketCreated } from "@/lib/api/types";
import { fmt } from "@/lib/i18n/define";
import { useErrorText } from "@/lib/i18n/error-text";
import type { SupportMessages } from "@/lib/i18n/messages/support";
import { sitePath } from "@/lib/site-path";
import { FormAlert } from "@/components/auth/form-alert";
import { feedbackFrom, NO_FEEDBACK, type FormFeedback } from "@/components/auth/form-errors";
import { useFocusOnFeedback } from "@/components/auth/use-focus-on-feedback";
import { useTurnstile } from "@/components/auth/use-turnstile";
import { Turnstile } from "@/components/turnstile";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useUiText } from "@/components/ui/ui-text";

export type NewTicketFormProps = {
  t: Pick<SupportMessages, "form" | "sent">;
  /** Prefill for a signed-in account (email, name) and from `?order=`. */
  defaults: { email: string; name: string; order: string; signedIn: boolean };
};

const CATEGORIES = ["refund", "delay", "failed_unlock", "billing", "wrong_imei", "howto", "presale", "other"] as const;
const SUBJECT_MAX = 150;
const MESSAGE_MAX = 4000;

/** The tracking token from what a customer pastes: the whole `…/track/<token>` link, or the bare token. */
export function trackingTokenFrom(input: string): string {
  const text = input.trim();
  const fromLink = /\/track\/([^/?#\s]+)/.exec(text);
  const raw = fromLink ? fromLink[1] : text;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function NewTicketForm({ t, defaults }: NewTicketFormProps) {
  const router = useRouter();
  const errorText = useErrorText();
  const ui = useUiText();
  const ts = useTurnstile();
  const form = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState({
    email: defaults.email,
    name: defaults.name,
    subject: "",
    category: "other" as (typeof CATEGORIES)[number],
    message: "",
    order: defaults.order,
  });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<FormFeedback>(NO_FEEDBACK);
  const [created, setCreated] = useState<{ number: string; email: string } | null>(null);
  useFocusOnFeedback(feedback, form);

  const set = (key: keyof typeof values) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));
  const orderToken = trackingTokenFrom(values.order);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const required = errorText.field({ field: "", code: "required", message: "" }) ?? "";
    const missing: Record<string, string> = {};
    // An order link already names the customer, so the email is optional then.
    if (!orderToken && !values.email.trim().includes("@")) missing.email = required;
    if (!values.subject.trim()) missing.subject = required;
    if (!values.message.trim()) missing.message = required;
    if (Object.keys(missing).length) {
      setFeedback({ fields: missing, message: null, reference: null });
      return;
    }
    setBusy(true);
    setFeedback(NO_FEEDBACK);
    const optional = (text: string) => (text.trim() ? text.trim() : undefined);
    let leaving = false;
    try {
      const turnstileToken = await ts.ensureToken();
      if (!turnstileToken) {
        setFeedback({ fields: {}, message: t.form.securityCheckWait, reference: null });
        return;
      }
      const ticket = await api.post<TicketCreated>(
        "/store/v1/tickets",
        {
          email: optional(values.email),
          name: optional(values.name),
          subject: values.subject.trim(),
          message: values.message.trim(),
          category: values.category,
          orderToken: optional(orderToken),
        },
        { turnstileToken },
      );
      if (ticket.token) {
        leaving = true;
        router.push(sitePath(`/support/tickets/${encodeURIComponent(ticket.token)}`));
      } else {
        setCreated({ number: ticket.number, email: values.email.trim() });
      }
    } catch (error) {
      setFeedback(
        isApiError(error) && error.status === 429
          ? { fields: {}, message: t.form.rateLimited, reference: null }
          : feedbackFrom(error, errorText, ["email", "name", "subject", "message", "category", "orderToken"], {
              orderToken: t.form.orderInvalid,
            }),
      );
    } finally {
      if (!leaving) setBusy(false);
      ts.reset();
    }
  }

  if (created) {
    return (
      <div className="grid gap-5">
        <Alert tone="success" title={fmt(t.sent.title, { number: created.number })}>
          {created.email ? fmt(t.sent.emailText, { email: created.email }) : t.sent.noEmailText}
        </Alert>
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              setCreated(null);
              setValues((v) => ({ ...v, subject: "", message: "" }));
            }}
          >
            {t.sent.another}
          </Button>
        </div>
      </div>
    );
  }

  const emailHint = defaults.signedIn ? t.form.emailSignedIn : orderToken ? t.form.emailHintOrder : t.form.emailHint;
  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="grid gap-5">
      <div className="grid items-start gap-5 sm:grid-cols-2">
        <Input
          type="email"
          name="email"
          label={t.form.email}
          hint={emailHint}
          leading={<Mail aria-hidden="true" />}
          autoComplete="email"
          inputMode="email"
          required={!orderToken}
          optionalLabel={orderToken ? ui.optional : undefined}
          value={values.email}
          onChange={set("email")}
          error={feedback.fields.email}
        />
        <Input
          name="name"
          label={t.form.name}
          optionalLabel={ui.optional}
          autoComplete="name"
          maxLength={100}
          value={values.name}
          onChange={set("name")}
          error={feedback.fields.name}
        />
      </div>
      <div className="grid items-start gap-5 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <Input
          name="subject"
          label={t.form.subject}
          placeholder={t.form.subjectPlaceholder}
          required
          maxLength={SUBJECT_MAX}
          value={values.subject}
          onChange={set("subject")}
          error={feedback.fields.subject}
        />
        <Select
          name="category"
          label={t.form.category}
          value={values.category}
          onChange={set("category")}
          options={CATEGORIES.map((c) => ({ value: c, label: t.form.categories[c] }))}
          error={feedback.fields.category}
        />
      </div>
      <Textarea
        name="message"
        label={t.form.message}
        placeholder={t.form.messagePlaceholder}
        hint={fmt(t.form.messageCount, { count: values.message.length, max: MESSAGE_MAX })}
        required
        rows={7}
        maxLength={MESSAGE_MAX}
        value={values.message}
        onChange={set("message")}
        error={feedback.fields.message}
      />
      <Input
        name="order"
        label={t.form.order}
        hint={t.form.orderHint}
        placeholder={t.form.orderPlaceholder}
        optionalLabel={ui.optional}
        autoComplete="off"
        dir="ltr"
        value={values.order}
        onChange={set("order")}
        error={feedback.fields.orderToken}
      />
      <Turnstile onToken={ts.setToken} resetKey={ts.resetKey} />
      <FormAlert message={feedback.message} reference={feedback.reference} />
      <div>
        <Button type="submit" size="lg" loading={busy}>
          {t.form.submit}
        </Button>
      </div>
    </form>
  );
}
