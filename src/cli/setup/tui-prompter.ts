import { LiveRegion, type TerminalOutput } from "../tui/renderer/live-region";
import { attachKeyStream } from "../tui/attach-keys";
import { createTheme, detectUnicode, type Theme } from "../tui/theme";
import type { TerminalKey } from "../tui/key-parser";
import { applyLineEditorKey } from "../tui/line-editor";
import { renderCliTaggedLine } from "../ui/output";
import type {
  AcknowledgePromptOptions,
  Prompter,
  SelectPromptOptions,
  SearchableSelectPromptOptions,
  SpinnerHandle,
  SpinnerOutcome,
  TextPromptOptions,
} from "./prompter";
import {
  createSelectState,
  moveDown,
  moveUp,
  selected,
  setQuery,
  type SelectState,
} from "./select-input";
import {
  applyTextInputKey,
  createTextInputState,
  validateTextInput,
  type TextInputState,
} from "./text-input";
import { renderSelectPanel, renderTextPanel } from "./setup-panel";

export interface TuiPrompterOptions {
  readonly output?: TerminalOutput;
  readonly theme?: Theme;
  readonly spinnerIntervalMs?: number;
}

export function createTuiPrompter(options: TuiPrompterOptions = {}): Prompter {
  return new TuiPrompter(options);
}

class TuiPrompter implements Prompter {
  readonly #region: LiveRegion;
  readonly #theme: Theme;
  readonly #spinnerIntervalMs: number;
  #detachKeys: (() => void) | undefined;
  #spinnerTimer: ReturnType<typeof setInterval> | undefined;
  #spinnerFrame = 0;
  #spinnerMessage = "";
  #stopped = false;

  constructor(options: TuiPrompterOptions) {
    this.#theme = options.theme ?? createTheme({ unicode: detectUnicode() });
    this.#region = new LiveRegion({ output: options.output });
    this.#spinnerIntervalMs = options.spinnerIntervalMs ?? 90;
  }

  get log() {
    return {
      info: (message: string) => this.#writeTagged("info", message, "info"),
      success: (message: string) => this.#writeTagged("ok", message, "success"),
      warning: (message: string) => this.#writeTagged("warn", message, "warning"),
      error: (message: string) => this.#writeTagged("error", message, "danger"),
    };
  }

  section(title: string, lines: readonly string[]): void {
    const c = this.#theme.colors;
    const rows = [c.bold(c.cyan(title))];
    for (const line of lines) rows.push(`  ${c.dim(line)}`);
    this.#region.commit(rows);
  }

  spinner(message: string): SpinnerHandle {
    this.#stopSpinner();
    this.#spinnerMessage = message;
    this.#spinnerFrame = 0;
    this.#paintSpinner();
    this.#spinnerTimer = setInterval(() => {
      this.#spinnerFrame += 1;
      this.#paintSpinner();
    }, this.#spinnerIntervalMs);
    this.#spinnerTimer.unref?.();

    return {
      update: (next: string) => {
        this.#spinnerMessage = next;
        this.#paintSpinner();
      },
      stop: (outcome: SpinnerOutcome = { kind: "silent" }) => {
        this.#stopSpinner();
        this.#region.paint([], { row: 1, col: 1 });
        if (outcome.kind === "silent") return;
        this.#writeTagged(
          outcome.kind === "success" ? "ok" : outcome.kind === "warning" ? "warn" : "error",
          outcome.message ?? this.#spinnerMessage,
          outcome.kind === "success"
            ? "success"
            : outcome.kind === "warning"
              ? "warning"
              : "danger",
        );
      },
    };
  }

  async text(options: TextPromptOptions): Promise<string | undefined> {
    this.#stopSpinner();
    return this.#runPrompt<string>((resolve) => {
      let state: TextInputState = createTextInputState(options);
      const paint = () => this.#paintFrame(this.#textFrame(state));
      paint();
      return (key) => {
        if (key.type === "ctrl-c" || key.type === "escape") {
          resolve(undefined);
          return "end";
        }
        if (key.type === "enter") {
          const failed = validateTextInput(state);
          if (failed !== undefined) {
            state = failed;
            paint();
            return "continue";
          }
          resolve(state.line.text);
          return "end";
        }
        const next = applyTextInputKey(state, key);
        if (next !== undefined) {
          state = next;
          paint();
        }
        return "continue";
      };
    });
  }

  async select<T>(options: SelectPromptOptions<T>): Promise<T | undefined> {
    return this.#selectImpl(options, false);
  }

  async searchableSelect<T>(options: SearchableSelectPromptOptions<T>): Promise<T | undefined> {
    return this.#selectImpl(options, true);
  }

  async acknowledge(options: AcknowledgePromptOptions): Promise<void> {
    this.#stopSpinner();
    await this.#runPrompt<void>((resolve) => {
      const c = this.#theme.colors;
      const rows = [`${c.yellow(c.bold(this.#theme.glyph.question))} ${c.bold(options.message)}`];
      for (const line of options.lines ?? []) rows.push(`  ${c.dim(line)}`);
      rows.push(`  ${c.dim("press enter to continue")}`);
      this.#region.paint(rows, { row: rows.length, col: 1 });
      return (key) => {
        if (key.type === "ctrl-c" || key.type === "escape" || key.type === "enter") {
          resolve();
          return "end";
        }
        return "continue";
      };
    });
  }

  stop(): void {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#stopSpinner();
    this.#detachKeys?.();
    this.#detachKeys = undefined;
    this.#region.stop();
  }

  async #selectImpl<T>(
    options: SelectPromptOptions<T> | SearchableSelectPromptOptions<T>,
    searchable: boolean,
  ): Promise<T | undefined> {
    this.#stopSpinner();
    return this.#runPrompt<T>((resolve) => {
      let state: SelectState<T> = createSelectState(options.options, {
        initialValue: options.initialValue,
      });
      const placeholder =
        "placeholder" in options ? (options as SearchableSelectPromptOptions<T>).placeholder : undefined;
      const paint = () =>
        this.#paintFrame(
          renderSelectPanel(state, options.message, this.#theme, this.#region.columns, {
            searchable,
            placeholder,
          }),
        );
      paint();
      return (key) => {
        if (key.type === "ctrl-c" || key.type === "escape") {
          resolve(undefined);
          return "end";
        }
        if (key.type === "enter") {
          const chosen = selected(state);
          if (chosen === undefined) return "continue";
          resolve(chosen.value);
          return "end";
        }
        if (key.type === "up" || key.type === "ctrl-p") {
          state = moveUp(state);
          paint();
          return "continue";
        }
        if (key.type === "down" || key.type === "ctrl-n") {
          state = moveDown(state);
          paint();
          return "continue";
        }
        if (searchable) {
          if (key.type === "backspace") {
            state = setQuery(state, state.query.slice(0, -1));
            paint();
            return "continue";
          }
          if (key.type === "text") {
            state = setQuery(state, `${state.query}${key.value}`);
            paint();
            return "continue";
          }
          const draft = applyLineEditorKey({ text: state.query, cursor: state.query.length }, key, {
            multiline: false,
          });
          if (draft !== undefined && draft.text !== state.query) {
            state = setQuery(state, draft.text);
            paint();
          }
        }
        return "continue";
      };
    });
  }

  #runPrompt<T>(
    setup: (resolve: (value: T | undefined) => void) => (key: TerminalKey) => "continue" | "end",
  ): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve) => {
      let done = false;
      const detach = attachKeyStream((key) => {
        if (done) return;
        const outcome = onKey(key);
        if (outcome === "end") {
          done = true;
          this.#detachKeys?.();
          this.#detachKeys = undefined;
          this.#region.paint([], { row: 1, col: 1 });
        }
      });
      this.#detachKeys = detach;
      const onKey = setup((value) => resolve(value));
    });
  }

  #textFrame(state: TextInputState) {
    return renderTextPanel(state, this.#theme, this.#region.columns);
  }

  #paintFrame(frame: { rows: string[]; caret: { row: number; col: number } }): void {
    this.#region.paint(frame.rows, frame.caret);
  }

  #paintSpinner(): void {
    const glyph = this.#theme.spinner[this.#spinnerFrame % this.#theme.spinner.length] ?? "-";
    const row = `${this.#theme.colors.cyan(glyph)} ${this.#spinnerMessage}`;
    this.#region.paint([row], { row: 1, col: 1 });
  }

  #stopSpinner(): void {
    if (this.#spinnerTimer !== undefined) {
      clearInterval(this.#spinnerTimer);
      this.#spinnerTimer = undefined;
    }
  }

  #writeTagged(tag: string, message: string, tone: "info" | "success" | "warning" | "danger"): void {
    const themeAdapter = {
      accent: this.#theme.colors.cyan,
      color: this.#theme.color,
      danger: this.#theme.colors.red,
      heading: (t: string) => this.#theme.colors.bold(this.#theme.colors.cyan(t)),
      info: this.#theme.colors.blue,
      label: this.#theme.colors.bold,
      muted: this.#theme.colors.dim,
      plain: (t: string) => t,
      subagent: this.#theme.colors.orange,
      success: this.#theme.colors.green,
      warning: this.#theme.colors.yellow,
    };
    this.#region.commit([
      renderCliTaggedLine(themeAdapter, { message, tag, tone }),
    ]);
  }
}
