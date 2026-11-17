import type { ReactElement } from "react";
import { Banknote, Landmark } from "lucide-react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// There is no DOM in these tests, so the component's state is a stand-in: `useState` answers the list of failed pictures the
// test holds, and applies the updater the component passes. The component is called as a function and the element it
// returns is read; the picture's own `onError` is called by hand, as the browser would after an `error` event.
const hook = vi.hoisted(() => ({ failed: [] as readonly string[] }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: () => [
    hook.failed,
    (update: (list: readonly string[]) => readonly string[]) => {
      hook.failed = update(hook.failed);
    },
  ],
}));
// The files `npm run logos` listed: a test says which bundled logos "exist" without needing the files.
const listed = vi.hoisted(() => ({ files: {} as Record<string, number[]> }));
vi.mock("@/lib/payment-logo-sizes.json", () => ({ default: listed.files }));

import { PaymentMethodLogo, type PaymentMethodLogoProps } from "./payment-method-logo";

const UPLOADED = "/store/v1/media/7db48410b0249faa175969aa2caa6d316adf34466f57a071ce6ad60e7bb1e022.png";
const OTHER_UPLOAD = "/store/v1/media/1111111111111111111111111111111111111111111111111111111111111111.webp";
const BUNDLED = "/images/payments/vodafone_cash.png";

type Picture = ReactElement<{ src: string; alt: string; onError: () => void }>;
type Chip = ReactElement<{ className: string; "aria-hidden"?: string; children: ReactElement }>;

/** Draws the logo once with the failures the test holds. */
const draw = (props: Partial<PaymentMethodLogoProps> = {}) => PaymentMethodLogo({ name: "Vodafone Cash", ...props }) as Chip;
/** The picture inside the chip, or null when the chip holds an icon. */
const pictureOf = (chip: Chip): Picture | null => (chip.props["aria-hidden"] ? null : (chip.props.children as Picture));

beforeEach(() => {
  hook.failed = [];
  for (const key of Object.keys(listed.files)) delete listed.files[key];
  listed.files["payments/vodafone_cash.png"] = [128, 128];
});

describe("PaymentMethodLogo: a picture that fails to load", () => {
  it("shows the uploaded logo first, then the preset's bundled logo once the upload failed, then the icon", () => {
    const props = { logoUrl: UPLOADED, preset: "vodafone_cash", methodType: "bank" as const };
    expect(pictureOf(draw(props))?.props.src).toBe(UPLOADED);

    pictureOf(draw(props))?.props.onError(); // the upload does not load
    expect(pictureOf(draw(props))?.props.src).toBe(BUNDLED);

    pictureOf(draw(props))?.props.onError(); // the bundled file does not load either
    const chip = draw(props);
    expect(pictureOf(chip)).toBeNull();
    expect(chip.props["aria-hidden"]).toBe("true");
    expect(chip.props.children.type).toBe(Landmark);
  });

  it("shows the icon when the failed upload has no preset (a custom method)", () => {
    const props = { logoUrl: UPLOADED, preset: null, methodType: "wise" as const };
    pictureOf(draw(props))?.props.onError();
    const chip = draw(props);
    expect(pictureOf(chip)).toBeNull();
    expect(chip.props.children.type).toBe(Banknote);
  });

  it("shows the icon when the failed upload's preset has no bundled file listed", () => {
    const props = { logoUrl: UPLOADED, preset: "instapay", methodType: "bank" as const };
    pictureOf(draw(props))?.props.onError();
    expect(pictureOf(draw(props))).toBeNull();
  });

  it("shows the icon when the bundled logo fails and there is no upload", () => {
    const props = { preset: "vodafone_cash", methodType: "bank" as const };
    expect(pictureOf(draw(props))?.props.src).toBe(BUNDLED);
    pictureOf(draw(props))?.props.onError();
    const chip = draw(props);
    expect(pictureOf(chip)).toBeNull();
    expect(chip.props.children.type).toBe(Landmark);
  });

  it("remembers a failure once, however many times the browser reports it", () => {
    const props = { logoUrl: UPLOADED, preset: "vodafone_cash" };
    const picture = pictureOf(draw(props));
    picture?.props.onError();
    picture?.props.onError();
    expect(hook.failed).toEqual([UPLOADED]);
  });

  it("tries another upload again: only the address that failed is skipped", () => {
    pictureOf(draw({ logoUrl: UPLOADED }))?.props.onError();
    expect(pictureOf(draw({ logoUrl: UPLOADED }))).toBeNull();
    expect(pictureOf(draw({ logoUrl: OTHER_UPLOAD }))?.props.src).toBe(OTHER_UPLOAD);
  });

  it("keeps the chip's size and the alternative text of the picture it falls back to", () => {
    const props = { logoUrl: UPLOADED, preset: "vodafone_cash", alt: "" };
    expect(draw(props).props.className).toContain("h-8 w-12");
    pictureOf(draw(props))?.props.onError();
    const fallback = draw(props);
    expect(fallback.props.className).toContain("h-8 w-12");
    expect(pictureOf(fallback)?.props.alt).toBe("");
    expect(pictureOf(draw({ ...props, alt: undefined }))?.props.alt).toBe("Vodafone Cash");
  });
});
