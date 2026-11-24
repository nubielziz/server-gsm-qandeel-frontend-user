// The details of one service at an account's own price, above the merchant order form (the checkout of an account of a
// merchant rank, components/checkout/merchant-checkout.tsx): the price per unit, the delivery time, the type, the quantity
// rule, the staff's note and the model, network and MEP reference lists. Server Component: no hooks, no reads.
import { Card, CardBody } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import type { MerchantServiceDetail } from "@/lib/api/types";
import { formatNumber } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";
import type { CommonMessages } from "@/lib/i18n/messages/common";
import type { MerchantMessages } from "@/lib/i18n/messages/merchant";
import { formatMinutes } from "@/lib/merchant/format";
import { fromMerchantRule, quantityRuleText } from "@/lib/quantity";

const OPTION_LISTS = ["model", "network", "mep"] as const;
const OPTION_PREVIEW = 12;

/** The service details card (`merchant.service` words): what the account pays per unit and what the service needs. */
export function ServiceAbout({ service: s, t, c }: { service: MerchantServiceDetail; t: MerchantMessages; c: CommonMessages }) {
  const lists = OPTION_LISTS.map((list) => ({ list, items: s.options.filter((o) => o.list === list) })).filter((l) => l.items.length > 0);
  const term = "text-small font-semibold text-ink-muted";
  return (
    <Card as="section" aria-label={t.service.about}>
      <CardBody className="grid gap-5">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
          <div>
            <dt className={term}>{t.service.yourPrice}</dt>
            <dd className="mt-0.5">
              <span className="num text-heading">
                <Money amount={s.price} currency={s.currency} />
              </span>{" "}
              <span className="text-small text-ink-subtle">{t.service.perUnit}</span>
            </dd>
          </div>
          <div>
            <dt className={term}>{t.service.delivery}</dt>
            <dd className="mt-0.5 text-body font-semibold text-ink">{s.slaMinutes > 0 ? formatMinutes(s.slaMinutes) : s.deliveryTime || t.shared.dash}</dd>
          </div>
          <div>
            <dt className={term}>{t.service.type}</dt>
            <dd className="mt-0.5 text-body font-semibold text-ink">{(c.serviceType as Record<string, string>)[s.type] ?? s.type}</dd>
          </div>
          <div>
            <dt className={term}>{t.service.quantity}</dt>
            <dd className="mt-0.5 text-body font-semibold text-ink">
              <bdi>{quantityRuleText(fromMerchantRule(s), c.quantity)}</bdi>
            </dd>
          </div>
        </dl>
        {s.info.trim() ? (
          <div>
            <h3 className="text-subheading text-ink">{t.service.info}</h3>
            <p className="mt-1 whitespace-pre-line text-body text-ink-muted" dir="auto">
              {s.info}
            </p>
          </div>
        ) : null}
        {lists.length > 0 ? (
          <div className="grid gap-3 rounded-card bg-surface-muted p-4">
            <div>
              <h3 className="text-subheading text-ink">{t.service.options.title}</h3>
              <p className="text-small text-ink-subtle">{t.service.options.note}</p>
            </div>
            {lists.map(({ list, items }) => (
              <div key={list}>
                <p className="text-small font-semibold text-ink">{t.service.options[list]}</p>
                <p className="text-small text-ink-muted" dir="auto">
                  {items
                    .slice(0, OPTION_PREVIEW)
                    .map((o) => o.label || o.value)
                    .join(" · ")}
                  {items.length > OPTION_PREVIEW ? ` · ${fmt(t.service.options.more, { count: formatNumber(items.length - OPTION_PREVIEW) })}` : ""}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
