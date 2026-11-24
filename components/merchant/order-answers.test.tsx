// The answers of an order on the merchant order page: read with a fallback to an empty list, a multi-line value keeps its line
// breaks, and the label and the value each get their own text direction.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DescriptionList } from "@/components/ui/description-list";
import { OrderAnswerItems, answersOf, type OrderAnswer } from "./order-answers";

const render = (answers: readonly OrderAnswer[]) =>
  renderToStaticMarkup(
    <DescriptionList>
      <OrderAnswerItems answers={answers} />
    </DescriptionList>,
  );

describe("answersOf", () => {
  it("is the list the API sent, and an empty list when the order was read without one", () => {
    const answers: OrderAnswer[] = [{ key: "serial", label: "Serial number", value: "A1" }];
    expect(answersOf({ answers })).toBe(answers);
    expect(answersOf({})).toEqual([]);
    expect(answersOf({ answers: undefined })).toEqual([]);
    expect(answersOf({ answers: null as never })).toEqual([]);
  });
});

describe("OrderAnswerItems", () => {
  it("draws one row per answer: the label, then the value", () => {
    const html = render([
      { key: "serial", label: "Serial number", value: "A1" },
      { key: "note", label: "Note", value: "Hello" },
    ]);
    expect(html.match(/<dt/g)).toHaveLength(2);
    expect(html).toMatch(/<dt[^>]*><span dir="auto">Serial number<\/span><\/dt>/);
    expect(html).toMatch(/<dd[^>]*><span [^>]*>A1<\/span><\/dd>/);
  });

  it("keeps the line breaks of a multi-line value and lets each part follow its own text direction", () => {
    const html = render([{ key: "note", label: "Note", value: "first line\nsecond line" }]);
    expect(html).toMatch(/<span dir="auto" class="[^"]*\bwhitespace-pre-line\b[^"]*">first line\nsecond line<\/span>/);
    expect(html).toMatch(/<dt[^>]*><span dir="auto">Note<\/span><\/dt>/);
  });

  it("draws nothing for an order without answers", () => {
    expect(render([])).not.toContain("<dt");
  });
});
