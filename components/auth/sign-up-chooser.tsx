"use client";
// SignUpChooser: "Customer or Merchant?" with the difference spelled out. Customer: an email and an emailed link that
// creates the account on first use (MagicLinkForm). Merchant: resellers message the team on WhatsApp from the
// application page, staff open the account and then they get group prices, a wallet and API access. The choice starts
// from `?as=`.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Check, Store, UserRound } from "lucide-react";
import type { AuthMessages } from "@/lib/i18n/messages/auth";
import { sitePath } from "@/lib/site-path";
import { ButtonLink } from "@/components/ui/button";
import { RadioCard, RadioGroup } from "@/components/ui/radio-card";
import { authLinkClass } from "./auth-heading";
import { MagicLinkForm } from "./magic-link-form";

export type SignUpChooserProps = {
  t: Pick<AuthMessages, "fields" | "shared" | "signUp" | "signIn">;
};

export function SignUpChooser({ t }: SignUpChooserProps) {
  const params = useSearchParams();
  const [kind, setKind] = useState<"customer" | "merchant">(params.get("as") === "merchant" ? "merchant" : "customer");

  return (
    <div className="grid gap-6">
      <RadioGroup legend={t.signUp.choose}>
        <RadioCard
          name="kind"
          value="customer"
          checked={kind === "customer"}
          onChange={() => setKind("customer")}
          icon={<UserRound aria-hidden="true" />}
          title={t.signUp.customer.title}
          description={t.signUp.customer.text}
        />
        <RadioCard
          name="kind"
          value="merchant"
          checked={kind === "merchant"}
          onChange={() => setKind("merchant")}
          icon={<Store aria-hidden="true" />}
          title={t.signUp.merchant.title}
          description={t.signUp.merchant.text}
        />
      </RadioGroup>

      {kind === "customer" ? (
        <MagicLinkForm
          strings={{
            email: t.fields.email,
            emailPlaceholder: t.fields.emailPlaceholder,
            hint: t.signUp.customerForm.hint,
            submit: t.signUp.customerForm.submit,
            sentText: t.signUp.customerForm.sentText,
            sentTitle: t.shared.checkEmailTitle,
            useDifferentEmail: t.shared.useDifferentEmail,
            securityCheckWait: t.shared.securityCheckWait,
          }}
        />
      ) : (
        <div className="grid gap-5">
          <p className="text-body text-ink-muted">{t.signUp.merchantInfo.intro}</p>
          <ul className="grid gap-2.5">
            {t.signUp.merchantInfo.points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-body text-ink">
                <Check aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <ButtonLink href={sitePath("/merchant/register")} size="lg" block>
            {t.signUp.merchantInfo.submit}
          </ButtonLink>
        </div>
      )}

      <p className="text-center text-body text-ink-muted">
        {t.signUp.haveAccount}{" "}
        <Link href={sitePath("/sign-in")} className={authLinkClass}>
          {t.signIn.submit}
        </Link>
      </p>
    </div>
  );
}
