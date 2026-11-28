"use client";
// SignedInTicketForm: opens a ticket for a signed-in account (feature 28): `POST /store/v1/me/tickets` for a retail account,
// `POST /client/tickets` for a merchant rank (the family says which). The public form's fields without the email, the name
// and the security check (the session is the proof), and an order picker with the person's own recent orders (optional; a
// foreign id is refused by the API as `unknown_order`). Files go with a message in the thread, not here. After saving, a
// retail account goes to the ticket's token page (the answer has the token) and a merchant rank to its thread
// (`createdTicketHref`). 5 tickets an hour per account: a 429 says so.
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api/browser";
import type { AccountFamily } from "@/lib/account/family";
import { FAMILY_ROUTES } from "@/lib/account/routes";
import { isApiError } from "@/lib/api/errors";
import type { ClientTicket, MyTicketCreated, SignedInTicketInput, Ticket } from "@/lib/api/types";
import { fmt } from "@/lib/i18n/define";
import { useErrorText } from "@/lib/i18n/error-text";
import { useMounted } from "@/lib/use-mounted";
import type { SupportMessages } from "@/lib/i18n/messages/support";
import { sitePath } from "@/lib/site-path";
import { createdTicketHref } from "@/lib/support/new-ticket-link";
import { FormAlert } from "@/components/auth/form-alert";
import { feedbackFrom, NO_FEEDBACK, type FormFeedback } from "@/components/auth/form-errors";
import { useFocusOnFeedback } from "@/components/auth/use-focus-on-feedback";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";

export type SignedInTicketFormProps = {
  /** The family of the signed-in account: it picks the route that opens the ticket and the page that shows it. */
  family: AccountFamily;
  t: Pick<SupportMessages, "form" | "newForm">;
  /** The person's orders for the picker, already named for their area (`SF-12 · Service · Nov 9, 2026`). */
  orders: { id: number; label: string }[];
  /** The order picked at first (`?order=`, from "Open a new ticket" of a closed ticket), when the picker offers it. */
  defaultOrderId?: number | null;
};

const CATEGORIES: readonly Ticket["category"][] = ["refund", "delay", "failed_unlock", "billing", "wrong_imei", "howto", "presale", "other"];
const SUBJECT_MAX = 150;
const MESSAGE_MAX = 4000;

export function SignedInTicketForm({ family, t, orders, defaultOrderId = null }: SignedInTicketFormProps) {
  const router = useRouter();
  const errorText = useErrorText();
  const form = useRef<HTMLFormElement>(null);
  const mounted = useMounted();
  const [values, setValues] = useState(() => ({
    subject: "",
    category: "other" as Ticket["category"],
    message: "",
    orderId: defaultOrderId !== null && orders.some((order) => order.id === defaultOrderId) ? String(defaultOrderId) : "",
  }));
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<FormFeedback>(NO_FEEDBACK);
  useFocusOnFeedback(feedback, form);

  const set = (key: keyof typeof values) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const required = errorText.field({ field: "", code: "required", message: "" }) ?? "";
    const missing: Record<string, string> = {};
    if (!values.subject.trim()) missing.subject = required;
    if (!values.message.trim()) missing.message = required;
    if (Object.keys(missing).length) {
      setFeedback({ fields: missing, message: null, reference: null });
      return;
    }
    setBusy(true);
    setFeedback(NO_FEEDBACK);
    let leaving = false;
    const body: SignedInTicketInput = {
      subject: values.subject.trim(),
      message: values.message.trim(),
      category: values.category,
      ...(values.orderId ? { orderId: Number(values.orderId) } : {}),
    };
    try {
      const created = await api.post<MyTicketCreated | ClientTicket>(FAMILY_ROUTES[family].tickets, body);
      leaving = true;
      // The ticket exists: when the answer has no page to open (it should), the list is where it shows.
      router.push(createdTicketHref(family, created) ?? sitePath("/account/support"));
    } catch (error) {
      setFeedback(
        isApiError(error) && error.status === 429
          ? { fields: {}, message: t.form.rateLimited, reference: null }
          : feedbackFrom(error, errorText, ["subject", "message", "category", "orderId"]),
      );
    } finally {
      if (!leaving) setBusy(false);
    }
  }

  return (
    <form ref={form} method="post" onSubmit={onSubmit} noValidate className="grid gap-5">
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
          options={CATEGORIES.map((category) => ({ value: category, label: t.form.categories[category] }))}
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
      {orders.length > 0 ? (
        <Select
          name="orderId"
          label={t.newForm.orderLabel}
          hint={t.newForm.orderHint}
          value={values.orderId}
          onChange={set("orderId")}
          options={[{ value: "", label: t.newForm.orderNone }, ...orders.map((order) => ({ value: String(order.id), label: order.label }))]}
          error={feedback.fields.orderId}
        />
      ) : null}
      <FormAlert message={feedback.message} reference={feedback.reference} />
      <div>
        <Button type="submit" size="lg" loading={busy} disabled={!mounted}>
          {t.newForm.submit}
        </Button>
      </div>
    </form>
  );
}
