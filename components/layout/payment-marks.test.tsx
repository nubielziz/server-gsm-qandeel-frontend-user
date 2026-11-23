import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { common } from "@/lib/i18n/messages/common";
import { ACCEPTED_PAYMENTS } from "@/lib/payments/accepted-methods";
import { PaymentMarks } from "./payment-marks";

const FOLDER = path.join(__dirname, "../../public/images/payment-marks");
const methods = ACCEPTED_PAYMENTS.flatMap((group) => group.methods);
const text = { title: common.footer.payments, groups: common.footer.paymentGroups };

describe("PaymentMarks", () => {
  it("names every method of the owner's list, in its three groups", () => {
    const html = renderToStaticMarkup(<PaymentMarks t={text} />);
    expect(methods).toHaveLength(23);
    for (const method of methods) expect(html).toContain(">" + method.name + "</li>");
    expect(html).toContain("Payment methods");
    for (const title of Object.values(common.footer.paymentGroups)) expect(html).toContain(title);
  });

  it("every logo it names is a file, and the folder holds no file the list does not use", () => {
    const used = new Set(methods.flatMap((method) => (method.logo ? [method.logo] : [])));
    for (const file of used) expect(existsSync(path.join(FOLDER, file)), file).toBe(true);
    expect(readdirSync(FOLDER).sort()).toEqual([...used].sort());
  });

  it("a method without a logo file has an icon, so no tile is empty", () => {
    for (const method of methods) expect(Boolean(method.logo) || Boolean(method.icon), method.name).toBe(true);
  });
});
