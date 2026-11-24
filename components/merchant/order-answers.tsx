// The answers of an order, as the merchant order page lists them (`GET /client/orders/:id`, `answers`): the label of the field
// as the order form showed it, and what was typed. A supplier writes the labels and people type the values, in any script, and a
// value may run over several lines (a text area): each part gets its own text direction and a value keeps its line breaks.
import { DescriptionItem } from "@/components/ui/description-list";
import type { MerchantOrderDetail } from "@/lib/api/types";

/** One answer of an order: the key of its field, the label buyers read and the value that was given, as text. */
export type OrderAnswer = MerchantOrderDetail["answers"][number];

/** The answers of an order read. An order read without the list (an API that does not send it yet) has none. */
export function answersOf(order: Partial<Pick<MerchantOrderDetail, "answers">>): OrderAnswer[] {
  return order.answers ?? [];
}

/** The rows of the "what was asked" list, one `DescriptionItem` per answer, to be placed in a `DescriptionList`. */
export function OrderAnswerItems({ answers }: { answers: readonly OrderAnswer[] }) {
  return answers.map((answer) => (
    <DescriptionItem key={answer.key} label={<span dir="auto">{answer.label}</span>}>
      <span dir="auto" className="whitespace-pre-line break-words">
        {answer.value}
      </span>
    </DescriptionItem>
  ));
}
