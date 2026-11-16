import { describe, expect, it } from "vitest";
import { ghostFor, ghostShown, isCaretAtEnd } from "./ghost";

describe("ghostFor: what is drawn after the typed text", () => {
  it("draws the answer's ghost after its own text, case and trailing space kept", () => {
    expect(ghostFor({ input: "icl", ghost: "oud" }, "icl")).toBe("oud");
    expect(ghostFor({ input: "SAMS", ghost: "ung" }, "SAMS")).toBe("ung");
    // `samsung ` (with its space) asked for the next word: the ghost follows the space, no double space.
    expect(ghostFor({ input: "samsung ", ghost: "frp" }, "samsung ")).toBe("frp");
  });

  it("shortens at once while the typed letters agree with it, without case", () => {
    expect(ghostFor({ input: "icl", ghost: "oud" }, "iclo")).toBe("ud");
    expect(ghostFor({ input: "icl", ghost: "oud" }, "iclOU")).toBe("d");
    expect(ghostFor({ input: "icl", ghost: "oud" }, "icloud")).toBe("");
    expect(ghostFor({ input: "samsung", ghost: " frp" }, "samsung ")).toBe("frp");
  });

  it("draws nothing for a different letter, a deleted letter, an empty box or no ghost", () => {
    expect(ghostFor({ input: "icl", ghost: "oud" }, "icla")).toBe("");
    expect(ghostFor({ input: "icl", ghost: "oud" }, "ic")).toBe("");
    expect(ghostFor({ input: "icl", ghost: "oud" }, "")).toBe("");
    expect(ghostFor({ input: "icl", ghost: null }, "icl")).toBe("");
    expect(ghostFor(null, "icl")).toBe("");
  });
});

describe("ghostShown: when the ghost may be drawn", () => {
  const base = { ghost: "oud", overflow: false, caretAtEnd: true, coarse: false, optionActive: false };
  it("draws it when it fits, the caret is at the end and there is a Tab key", () => {
    expect(ghostShown(base)).toBe(true);
  });
  it("hides it when the text overflows the box", () => {
    expect(ghostShown({ ...base, overflow: true })).toBe(false);
  });
  it("hides it when the caret is not at the end or text is selected", () => {
    expect(ghostShown({ ...base, caretAtEnd: false })).toBe(false);
  });
  it("hides it on coarse pointers (no Tab key) and while an option is active", () => {
    expect(ghostShown({ ...base, coarse: true })).toBe(false);
    expect(ghostShown({ ...base, optionActive: true })).toBe(false);
  });
  it("draws nothing without a ghost", () => {
    expect(ghostShown({ ...base, ghost: "" })).toBe(false);
  });
});

describe("isCaretAtEnd", () => {
  it("is true only for a collapsed caret after the last character", () => {
    expect(isCaretAtEnd({ value: "icl", selectionStart: 3, selectionEnd: 3 })).toBe(true);
    expect(isCaretAtEnd({ value: "icl", selectionStart: 1, selectionEnd: 1 })).toBe(false);
    expect(isCaretAtEnd({ value: "icl", selectionStart: 0, selectionEnd: 3 })).toBe(false);
    expect(isCaretAtEnd({ value: "", selectionStart: 0, selectionEnd: 0 })).toBe(true);
    expect(isCaretAtEnd({ value: "icl", selectionStart: null, selectionEnd: null })).toBe(false);
  });
});
