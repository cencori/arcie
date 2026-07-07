import { describe, it, expect } from "vitest";
import {
  applyTextInputKey,
  createTextInputState,
  validateTextInput,
} from "../src/cli/setup/text-input";

describe("TextInputState", () => {
  it("seeds the buffer with defaultValue and places the caret at the end", () => {
    const state = createTextInputState({ message: "Name", defaultValue: "hello" });
    expect(state.line.text).toBe("hello");
    expect(state.line.cursor).toBe(5);
  });

  it("appends typed text through applyTextInputKey", () => {
    let state = createTextInputState({ message: "Name" });
    state = applyTextInputKey(state, { type: "text", value: "hi", framing: "unframed" })!;
    expect(state.line.text).toBe("hi");
  });

  it("returns undefined for keys the line editor does not handle", () => {
    const state = createTextInputState({ message: "Name" });
    expect(applyTextInputKey(state, { type: "enter" })).toBeUndefined();
    expect(applyTextInputKey(state, { type: "up" })).toBeUndefined();
  });

  it("clears validationError when the draft changes", () => {
    const seeded = {
      ...createTextInputState({ message: "Name" }),
      validationError: "required",
    };
    const next = applyTextInputKey(seeded, { type: "text", value: "a", framing: "unframed" });
    expect(next?.validationError).toBeUndefined();
  });

  it("validateTextInput returns a state with validationError when invalid", () => {
    const state = createTextInputState({
      message: "Key",
      validate: (v) => (v.length < 4 ? "too short" : undefined),
    });
    const failed = validateTextInput(state);
    expect(failed?.validationError).toBe("too short");
  });

  it("validateTextInput returns undefined when accepted", () => {
    const seeded = createTextInputState({
      message: "Key",
      defaultValue: "abcdef",
      validate: (v) => (v.length < 4 ? "too short" : undefined),
    });
    expect(validateTextInput(seeded)).toBeUndefined();
  });

  it("no validate function → validateTextInput returns undefined", () => {
    const state = createTextInputState({ message: "Name" });
    expect(validateTextInput(state)).toBeUndefined();
  });
});
