import { EMPTY_LINE, applyLineEditorKey, lineOf, type LineState } from "../tui/line-editor";
import type { TerminalKey } from "../tui/key-parser";

export interface TextInputState {
  readonly line: LineState;
  readonly message: string;
  readonly placeholder?: string;
  readonly mask: boolean;
  readonly validate?: (value: string) => string | undefined;
  readonly validationError?: string;
}

export interface CreateTextInputOptions {
  readonly message: string;
  readonly placeholder?: string;
  readonly defaultValue?: string;
  readonly mask?: boolean;
  readonly validate?: (value: string) => string | undefined;
}

export function createTextInputState(options: CreateTextInputOptions): TextInputState {
  const line = options.defaultValue ? lineOf(options.defaultValue) : EMPTY_LINE;
  const state: TextInputState = {
    line,
    message: options.message,
    mask: options.mask ?? false,
  };
  const result: TextInputState = { ...state };
  if (options.placeholder !== undefined) (result as { placeholder?: string }).placeholder = options.placeholder;
  if (options.validate !== undefined) (result as { validate?: (v: string) => string | undefined }).validate = options.validate;
  return result;
}

export function applyTextInputKey(
  state: TextInputState,
  key: TerminalKey,
): TextInputState | undefined {
  const nextLine = applyLineEditorKey(state.line, key, { multiline: false });
  if (nextLine === undefined) return undefined;
  const next: TextInputState = { ...state, line: nextLine };
  if (state.validationError !== undefined) {
    (next as { validationError?: string }).validationError = undefined;
  }
  return next;
}

/**
 * Runs the caller-supplied `validate` against the current draft and returns
 * a state carrying the error message, or `undefined` when the draft is
 * accepted. Submit paths call this and only complete the promise when it
 * returns `undefined`.
 */
export function validateTextInput(state: TextInputState): TextInputState | undefined {
  if (state.validate === undefined) return undefined;
  const error = state.validate(state.line.text);
  if (error === undefined) return undefined;
  return { ...state, validationError: error };
}
