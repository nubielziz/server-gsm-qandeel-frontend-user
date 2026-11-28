"use client";
// MerchantApplyForm: the short form of the "Become a merchant" page (first name, last name, email, phone, country; no password).
// Its WhatsApp button checks the details like the sign-up form does and then opens the team's chat with them written into the
// prefilled message, after the sentence the page has always sent. Nothing goes to our API and nothing is kept: the details
// travel only inside the `wa.me` link. The decisions are in merchant-apply.ts (unit tested). The countries are the shop's tax-rate
// countries when it has any, else every country (the page's slot passes them). The form is server-rendered, so it says
// `method="post"` (a submit before the script loads can never put the fields in the address) and keeps its button disabled until
// the component has mounted in the browser (`useMounted`).
import { useRef, useState, type FormEvent } from "react";
import type { AuthMessages } from "@/lib/i18n/messages/auth";
import { useMounted } from "@/lib/use-mounted";
import { DetailsFields } from "./details-fields";
import { type FormFeedback, NO_FEEDBACK } from "./form-errors";
import { prepareMerchantChat } from "./merchant-apply";
import { MerchantWhatsAppActions } from "./merchant-whatsapp-actions";
import { EMPTY_DETAILS, type DetailsValues } from "./sign-up-fields";
import { useFocusOnFeedback } from "./use-focus-on-feedback";

export type MerchantApplyFormProps = {
  /** The team's WhatsApp number as digits, for the link. */
  digits: string;
  /** The number as text. */
  display: string;
  countries: readonly { code: string; name: string }[];
  t: {
    fields: AuthMessages["fields"];
    errors: AuthMessages["signUp"]["errors"];
    becomeMerchant: AuthMessages["becomeMerchant"];
  };
};

/** Opens the chat in a new tab; a blocked popup falls back to this tab, so the button never does nothing. */
function openChat(href: string) {
  const tab = window.open(href, "_blank");
  if (tab) tab.opener = null;
  else window.location.assign(href);
}

export function MerchantApplyForm({ digits, display, countries, t }: MerchantApplyFormProps) {
  const form = useRef<HTMLFormElement>(null);
  const mounted = useMounted();
  const [values, setValues] = useState<DetailsValues>(EMPTY_DETAILS);
  const [feedback, setFeedback] = useState<FormFeedback>(NO_FEEDBACK);

  useFocusOnFeedback(feedback, form);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const chat = prepareMerchantChat(values, {
      digits,
      base: t.becomeMerchant.message,
      labels: {
        firstName: t.fields.firstName,
        lastName: t.fields.lastName,
        email: t.fields.email,
        phone: t.fields.phone,
        country: t.fields.country,
      },
      countries,
      text: t.errors,
    });
    if (!chat.ok) {
      setFeedback({ fields: chat.problems, message: null, reference: null });
      return;
    }
    setFeedback(NO_FEEDBACK);
    openChat(chat.href);
  }

  return (
    <form ref={form} method="post" onSubmit={onSubmit} noValidate className="grid gap-5">
      <DetailsFields
        values={values}
        onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
        errors={feedback.fields}
        countries={countries}
        t={t.fields}
      />
      <p className="text-small text-ink-subtle">{t.becomeMerchant.detailsNote}</p>
      <MerchantWhatsAppActions display={display} t={t.becomeMerchant} disabled={!mounted} />
    </form>
  );
}
