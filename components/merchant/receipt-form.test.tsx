// The receipt form of an invoice: a merchant rank's file goes to the portal's file route.
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }) }));
const uploads = vi.hoisted(() => [] as { family: string; labels: { choose: string; tooLarge: string; hint?: string } }[]);
vi.mock("@/components/forms/file-upload", () => ({
  FileUpload: (props: { family: string; labels: { choose: string; tooLarge: string; hint?: string } }) => {
    uploads.push(props);
    return null;
  },
}));

import { ErrorTextProvider } from "@/lib/i18n/error-text";
import { errors } from "@/lib/i18n/messages/errors";
import { topUps } from "@/lib/i18n/messages/top-ups";
import { ReceiptForm } from "./receipt-form";

const render = (methods: { id: number; name: string }[]) =>
  renderToStaticMarkup(
    <ErrorTextProvider messages={errors}>
      <ReceiptForm
        invoiceId={9}
        methods={methods}
        labels={topUps.merchant.invoice}
        optionalLabel={topUps.merchant.shared.optional}
      />
    </ErrorTextProvider>,
  );

beforeEach(() => {
  uploads.length = 0;
});

describe("receipt form of an invoice", () => {
  it("uploads the receipt to the portal's file route, with the portal's size limit in its words", () => {
    render([]);
    expect(uploads).toHaveLength(1);
    expect(uploads[0].family).toBe("client");
    expect(uploads[0].labels.tooLarge).toContain("25 MB");
    expect(uploads[0].labels.choose).toBe(topUps.merchant.invoice.upload.choose);
  });

  it("asks which payment method was used only for an invoice that has none yet", () => {
    expect(render([])).not.toContain('name="gatewayId"');
    const html = render([{ id: 3, name: "Bank transfer" }]);
    expect(html).toContain('name="gatewayId"');
    expect(html).toContain("Bank transfer");
  });
});


describe("before its script has loaded", () => {
  it('is a post form whose submit button is disabled in the server HTML: nothing can go to the address', () => {
    const html = render([{ id: 1, name: "Bank" }]);
    expect(html).toMatch(/<form [^>]*method="post"/);
    expect(html).not.toMatch(/<form [^>]*action=/);
    const buttons = (html.match(/<button\b[^>]*>/g) ?? []).filter((tag) => /\btype="submit"/.test(tag));
    expect(buttons.length).toBeGreaterThan(0);
    for (const tag of buttons) expect(tag).toContain('disabled=""');
  });
});
