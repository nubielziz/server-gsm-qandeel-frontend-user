// The quantity control of the checkout drawer: one control per mode of the service's rule (plan D17, BH §14.2).
//   range  → a number box bounded by min and max (step 1);
//   packs  → radio buttons, or a select above six packs (never a free number box);
//   single → no control, the line "1 per order";   exact → no control, the line "N per order".
// The rule is state of the form (it is read again from the API), so everything here is drawn from the `rule` prop.
// Presentational: the form owns the value (the text of the box, or the chosen pack as text) and the error.
import { useId } from "react";
import { Input, Select } from "@/components/ui/input";
import { RadioCard, RadioGroup } from "@/components/ui/radio-card";
import { formatNumber } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";
import type { Locale } from "@/lib/i18n/config";
import { quantityMode, quantityRuleText, type QuantityMessages, type QuantityRule } from "@/lib/quantity";

/** More packs than this are a select, not radio buttons. */
export const MAX_RADIO_PACKS = 6;

/** The elements that mark an error for the focus-to-first-error of the form: invalid fields, and the line of a no-control rule. */
export const INVALID_SELECTOR = "[aria-invalid='true'], [data-quantity-control][data-invalid='true']";

/** The root element of every mode carries this attribute: `focusQuantityControl` finds the control by it. */
const ROOT_SELECTOR = "[data-quantity-control]";

export type QuantityControlProps = {
  rule: QuantityRule;
  locale: Locale;
  /** The text of the number box, or the chosen pack (`"10"`). Empty: nothing chosen yet. */
  value: string;
  onChange: (value: string) => void;
  /** The refusal to show (client check or server 422), already translated from the rule. */
  error?: string;
  /** The field label ("Quantity"). */
  label: string;
  /** `start.drawer.quantityHint`: a sentence with `{rule}` (the rule text, "2 to 50 per order"). */
  hint: string;
  /** `common.quantity`: the rule texts. */
  quantityLabels: QuantityMessages;
  /** The first, empty option of the select (above six packs): "Select an option". */
  placeholder: string;
  /** "Instant delivery while stock lasts, otherwise within …" for an in-stock range or packs; null otherwise. */
  stockHint?: string | null;
};

export function QuantityControl({ rule, locale, value, onChange, error, label, hint, placeholder, quantityLabels, stockHint }: QuantityControlProps) {
  const id = useId().replace(/:/g, "");
  const mode = quantityMode(rule);
  const ruleText = quantityRuleText(rule, quantityLabels, locale);
  const hintNode = (
    <>
      <span className="block">{fmt(hint, { rule: ruleText })}</span>
      {stockHint ? <span className="mt-1 block">{stockHint}</span> : null}
    </>
  );

  if (mode.kind === "single" || mode.kind === "exact") {
    // No choice to make: say what the order holds. A refusal still has a place: a named group that can take focus,
    // with the error tied to it and announced politely. `aria-invalid` is not allowed on a group, so `data-invalid`
    // marks it for the form's focus-to-first-error (`INVALID_SELECTOR`).
    return (
      <div
        data-quantity-control=""
        role="group"
        aria-labelledby={`${id}-label`}
        aria-describedby={error ? `${id}-error` : undefined}
        data-invalid={error ? "true" : undefined}
        tabIndex={-1}
        className="grid gap-1.5 outline-none"
      >
        <p id={`${id}-label`} className="text-small font-semibold text-ink">
          {label}
        </p>
        <p className="text-body text-ink">
          <bdi>{ruleText}</bdi>
        </p>
        <div id={`${id}-error`} aria-live="polite">
          {error ? <p className="text-small font-medium text-danger-ink">{error}</p> : null}
        </div>
      </div>
    );
  }

  if (mode.kind === "packs") {
    if (mode.options.length > MAX_RADIO_PACKS) {
      return (
        <div data-quantity-control="">
          <Select
            name="quantity"
            label={label}
            hint={hintNode}
            error={error}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            options={mode.options.map((n) => ({ value: String(n), label: formatNumber(n, locale) }))}
            required
          />
        </div>
      );
    }
    return (
      <div data-quantity-control="">
        <RadioGroup legend={label} hint={hintNode} error={error} columns={3} required>
          {mode.options.map((n) => (
            <RadioCard
              key={n}
              name="quantity"
              value={String(n)}
              checked={value === String(n)}
              onChange={() => onChange(String(n))}
              title={<span className="num">{formatNumber(n, locale)}</span>}
            />
          ))}
        </RadioGroup>
      </div>
    );
  }

  return (
    <div data-quantity-control="">
      <Input
        name="quantity"
        type="number"
        inputMode="numeric"
        min={mode.min}
        max={mode.max}
        step={1}
        label={label}
        hint={hintNode}
        error={error}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      />
    </div>
  );
}

/**
 * Moves the keyboard focus to the control: the chosen pack, else the first pack, the number box or the select; with no
 * control (one per order, exactly N) the line itself. Call it from an event handler or a timer, after the control has
 * been drawn.
 */
export function focusQuantityControl(): void {
  const root = document.querySelector<HTMLElement>(ROOT_SELECTOR);
  if (!root) return;
  const target = root.querySelector<HTMLElement>("input:checked") ?? root.querySelector<HTMLElement>("input, select") ?? root;
  target.focus();
}
