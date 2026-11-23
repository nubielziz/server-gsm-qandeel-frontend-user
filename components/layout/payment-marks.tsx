// PaymentMarks: the footer's list of the payment methods the shop takes (owner, 2026-11-23), in three groups. Static: the list
// is lib/payments/accepted-methods.ts, nothing is read from the API. Each method is its logo on a small light tile (the
// footer is dark, most marks are made for a light background) with its name beside it; the logo is decoration, the name is
// the text. Logos are files (public/images/payment-marks, docs/LOGOS.md), never drawn; a method without a file gets an icon.
import Image from "next/image";
import { Landmark, Wallet } from "lucide-react";
import { ACCEPTED_PAYMENTS, type AcceptedGroupKey, type AcceptedMethod } from "@/lib/payments/accepted-methods";

export type PaymentMarksText = { title: string; groups: Record<AcceptedGroupKey, string> };

function Mark({ method }: { method: AcceptedMethod }) {
  if (method.logo) return <Image src={"/images/payment-marks/" + method.logo} alt="" width={20} height={20} />;
  return method.icon === "bank" ? <Landmark aria-hidden="true" /> : <Wallet aria-hidden="true" />;
}

export function PaymentMarks({ t }: { t: PaymentMarksText }) {
  return (
    <section aria-labelledby="footer-payments" className="mt-10 border-t border-inverse-raised pt-8">
      <h2 id="footer-payments" className="text-body font-bold text-on-inverse">
        {t.title}
      </h2>
      <div className="mt-4 grid gap-5">
        {ACCEPTED_PAYMENTS.map((group) => (
          <div key={group.key} className="grid gap-2">
            <h3 id={"footer-payments-" + group.key} className="text-small font-semibold text-on-inverse-muted">
              {t.groups[group.key]}
            </h3>
            <ul aria-labelledby={"footer-payments-" + group.key} className="flex flex-wrap gap-2">
              {group.methods.map((method) => (
                <li
                  key={method.name}
                  className="inline-flex items-center gap-2 rounded-control border border-inverse-raised py-1 ps-1 pe-3 text-small text-on-inverse"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-badge bg-surface text-ink [&_svg]:size-4">
                    <Mark method={method} />
                  </span>
                  {method.name}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
