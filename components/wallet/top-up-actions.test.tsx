// What a retail rank can do with a manual top-up: its receipt goes to the shop's file route.
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }) }));
const uploads = vi.hoisted(() => [] as { family: string; labels: { tooLarge: string } }[]);
vi.mock("@/components/forms/file-upload", () => ({
  FileUpload: (props: { family: string; labels: { tooLarge: string } }) => {
    uploads.push(props);
    return null;
  },
}));

import { ErrorTextProvider } from "@/lib/i18n/error-text";
import { errors } from "@/lib/i18n/messages/errors";
import { topUps } from "@/lib/i18n/messages/top-ups";
import { TopUpActions } from "./top-up-actions";

const render = (canReceipt: boolean, canCancel: boolean) =>
  renderToStaticMarkup(
    <ErrorTextProvider messages={errors}>
      <TopUpActions id={42} canReceipt={canReceipt} canCancel={canCancel} labels={topUps.actions} errors={topUps.errors} />
    </ErrorTextProvider>,
  );

beforeEach(() => {
  uploads.length = 0;
});

describe("top-up actions of a retail rank", () => {
  it("uploads the receipt to the shop's file route, with the shop's size limit in its words", () => {
    render(true, true);
    expect(uploads).toHaveLength(1);
    expect(uploads[0].family).toBe("store");
    expect(uploads[0].labels.tooLarge).toContain("5 MB");
  });

  it("shows no receipt box once a receipt was sent", () => {
    render(false, false);
    expect(uploads).toHaveLength(0);
  });
});
