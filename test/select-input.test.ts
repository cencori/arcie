import { describe, it, expect } from "vitest";
import {
  createSelectState,
  moveDown,
  moveUp,
  selected,
  setQuery,
} from "../src/cli/setup/select-input";

const OPTIONS = [
  { value: "claude-sonnet-5", label: "Claude Sonnet 5", description: "Anthropic" },
  { value: "claude-opus-4.8", label: "Claude Opus 4.8", description: "Anthropic" },
  { value: "gpt-5", label: "GPT-5", description: "OpenAI" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", description: "Google" },
];

describe("SelectState", () => {
  it("initializes with all options and index 0", () => {
    const state = createSelectState(OPTIONS);
    expect(state.matches.length).toBe(4);
    expect(state.selectedIndex).toBe(0);
    expect(selected(state)?.value).toBe("claude-sonnet-5");
  });

  it("honors initialValue when provided", () => {
    const state = createSelectState(OPTIONS, { initialValue: "gpt-5" });
    expect(selected(state)?.value).toBe("gpt-5");
  });

  it("filters by label substring case-insensitively", () => {
    const state = setQuery(createSelectState(OPTIONS), "SoNn");
    expect(state.matches.map((m) => m.value)).toEqual(["claude-sonnet-5"]);
    expect(selected(state)?.value).toBe("claude-sonnet-5");
  });

  it("filters by description substring", () => {
    const state = setQuery(createSelectState(OPTIONS), "anthropic");
    expect(state.matches.length).toBe(2);
    expect(state.matches.every((m) => m.description === "Anthropic")).toBe(true);
  });

  it("preserves the highlighted option across a query change when it still matches", () => {
    const base = createSelectState(OPTIONS, { initialValue: "claude-opus-4.8" });
    expect(selected(base)?.value).toBe("claude-opus-4.8");
    const filtered = setQuery(base, "claude");
    expect(selected(filtered)?.value).toBe("claude-opus-4.8");
  });

  it("resets highlight to 0 when the previous highlight is filtered out", () => {
    const base = createSelectState(OPTIONS, { initialValue: "gpt-5" });
    const filtered = setQuery(base, "claude");
    expect(selected(filtered)?.value).toBe("claude-sonnet-5");
  });

  it("moveDown wraps at the end", () => {
    let state = createSelectState(OPTIONS);
    for (let i = 0; i < 4; i += 1) state = moveDown(state);
    expect(state.selectedIndex).toBe(0);
  });

  it("moveUp wraps at the start", () => {
    const state = moveUp(createSelectState(OPTIONS));
    expect(state.selectedIndex).toBe(3);
  });

  it("moveDown / moveUp are no-ops on an empty match list", () => {
    const state = setQuery(createSelectState(OPTIONS), "nomatch");
    expect(state.matches.length).toBe(0);
    expect(moveDown(state).selectedIndex).toBe(0);
    expect(moveUp(state).selectedIndex).toBe(0);
    expect(selected(state)).toBeUndefined();
  });

  it("setQuery with the same query returns the same reference", () => {
    const state = createSelectState(OPTIONS);
    expect(setQuery(state, "")).toBe(state);
  });
});
