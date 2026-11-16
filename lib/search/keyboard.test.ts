import { describe, expect, it } from "vitest";
import { keyAction, type KeyContext } from "./keyboard";

const base: KeyContext = {
  key: "",
  open: true,
  count: 5,
  active: null,
  activeIsPhrase: false,
  ghost: false,
  caretAtEnd: true,
  hasText: true,
};
const press = (key: string, over: Partial<KeyContext> = {}) => keyAction({ ...base, key, ...over });

describe("keyboard model of the search combobox", () => {
  it("no option is active until Down or Up: Enter on plain text submits the form", () => {
    expect(press("Enter")).toEqual({ action: { type: "none" }, prevent: false });
  });

  it("Down and Up move the active option and wrap", () => {
    expect(press("ArrowDown")).toEqual({ action: { type: "move", active: 0 }, prevent: true });
    expect(press("ArrowDown", { active: 0 }).action).toEqual({ type: "move", active: 1 });
    expect(press("ArrowDown", { active: 4 }).action).toEqual({ type: "move", active: 0 });
    expect(press("ArrowUp").action).toEqual({ type: "move", active: 4 });
    expect(press("ArrowUp", { active: 0 }).action).toEqual({ type: "move", active: 4 });
  });

  it("Down on a closed list opens it on the first option; with no options yet it only opens", () => {
    expect(press("ArrowDown", { open: false, active: 3 }).action).toEqual({ type: "move", active: 0 });
    expect(press("ArrowDown", { count: 0 })).toEqual({ action: { type: "move", active: null }, prevent: true });
  });

  it("Enter opens the active option", () => {
    expect(press("Enter", { active: 2 })).toEqual({ action: { type: "activate", index: 2 }, prevent: true });
  });

  it("Escape closes the list, then clears the text, then lets the browser act", () => {
    expect(press("Escape")).toEqual({ action: { type: "close" }, prevent: true });
    expect(press("Escape", { open: false })).toEqual({ action: { type: "clear" }, prevent: true });
    expect(press("Escape", { open: false, hasText: false })).toEqual({ action: { type: "none" }, prevent: false });
  });

  it("Tab or Right at the end accepts the ghost when no option is active", () => {
    expect(press("Tab", { ghost: true })).toEqual({ action: { type: "accept" }, prevent: true });
    expect(press("ArrowRight", { ghost: true })).toEqual({ action: { type: "accept" }, prevent: true });
    expect(press("ArrowRight", { ghost: true, caretAtEnd: false })).toEqual({ action: { type: "none" }, prevent: false });
  });

  it("Tab or Right fills the active phrase", () => {
    expect(press("Tab", { active: 1, activeIsPhrase: true })).toEqual({ action: { type: "fill", index: 1 }, prevent: true });
    expect(press("ArrowRight", { active: 1, activeIsPhrase: true, ghost: true })).toEqual({ action: { type: "fill", index: 1 }, prevent: true });
  });

  it("Tab moves focus as usual when there is nothing to accept (and Shift+Tab always)", () => {
    expect(press("Tab")).toEqual({ action: { type: "none" }, prevent: false });
    expect(press("Tab", { active: 2, activeIsPhrase: false })).toEqual({ action: { type: "none" }, prevent: false });
    expect(press("Tab", { shiftKey: true, ghost: true })).toEqual({ action: { type: "none" }, prevent: false });
  });

  it("Home, End, Left (and Right on a service) stay in the text and leave the list", () => {
    for (const key of ["Home", "End", "ArrowLeft"]) {
      expect(press(key, { active: 2 })).toEqual({ action: { type: "leave" }, prevent: false });
      expect(press(key)).toEqual({ action: { type: "none" }, prevent: false });
    }
    expect(press("ArrowRight", { active: 2, activeIsPhrase: false })).toEqual({ action: { type: "leave" }, prevent: false });
  });

  it("keys with a modifier belong to the browser", () => {
    expect(press("ArrowDown", { altKey: true }).action.type).toBe("none");
    expect(press("Home", { ctrlKey: true, active: 1 }).action.type).toBe("none");
    expect(press("ArrowRight", { metaKey: true, ghost: true }).action.type).toBe("none");
  });

  it("other keys type as usual", () => {
    expect(press("a")).toEqual({ action: { type: "none" }, prevent: false });
  });
});
