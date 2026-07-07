import type { Theme } from "../tui/theme";
import { maskLine, visibleLine } from "../tui/line-editor";
import { inputTextWidth, sliceVisible, visibleLength } from "../ui/terminal-text";
import type { SelectState } from "./select-input";
import type { TextInputState } from "./text-input";

export interface PanelCaret {
  readonly row: number;
  readonly col: number;
}

export interface PanelFrame {
  readonly rows: string[];
  readonly caret: PanelCaret;
}

/** Maximum select options rendered at once; longer lists window around the highlight. */
const MAX_VISIBLE_OPTIONS = 10;

export function renderTextPanel(
  state: TextInputState,
  theme: Theme,
  width: number,
): PanelFrame {
  const c = theme.colors;
  const rows: string[] = [renderHeader(state.message, theme, width)];

  const promptGlyph = c.cyan(theme.glyph.prompt);
  const promptWidth = visibleLength(`${theme.glyph.prompt} `);
  const budget = Math.max(1, width - promptWidth - 2);

  const displayLine = state.mask ? maskLine(state.line) : state.line;
  const view = visibleLine(displayLine, budget);
  const under = view.under.length === 0 ? " " : view.under;
  const inputRow = `  ${promptGlyph} ${view.before}${c.inverse(under)}${view.after}`;

  if (state.line.text.length === 0 && state.placeholder !== undefined) {
    const placeholder = c.dim(sliceVisible(state.placeholder, budget));
    rows.push(`  ${promptGlyph} ${c.inverse(" ")}${placeholder}`);
  } else {
    rows.push(inputRow);
  }

  if (state.validationError !== undefined) {
    rows.push(`  ${c.red(theme.glyph.error)} ${c.red(state.validationError)}`);
  }

  const caretCol =
    3 + promptWidth + inputTextWidth(state.mask ? maskLine(state.line).text.slice(0, maskLine(state.line).cursor) : view.before);

  return { rows, caret: { row: 2, col: caretCol } };
}

export function renderSelectPanel<T>(
  state: SelectState<T>,
  message: string,
  theme: Theme,
  width: number,
  options: { searchable?: boolean; placeholder?: string } = {},
): PanelFrame {
  const rows: string[] = [renderHeader(message, theme, width)];
  let caretRow = 1;
  let caretCol = 3;

  if (options.searchable === true) {
    const budget = Math.max(1, width - 4);
    const [filterRow, cursorCol] = renderFilterRow(state.query, budget, theme, options.placeholder);
    rows.push(filterRow);
    caretRow = 2;
    caretCol = cursorCol;
  }

  rows.push(...renderOptionRows(state, theme, width));
  return { rows, caret: { row: caretRow, col: caretCol } };
}

function renderHeader(message: string, theme: Theme, width: number): string {
  const c = theme.colors;
  const glyph = c.yellow(c.bold(theme.glyph.question));
  const trimmed = message.trim();
  const budget = Math.max(1, width - 2);
  return `${glyph} ${c.bold(sliceVisible(trimmed, budget))}`;
}

function renderFilterRow(
  query: string,
  budget: number,
  theme: Theme,
  placeholder: string | undefined,
): [string, number] {
  const c = theme.colors;
  const prefix = `  ${c.dim("/")} `;
  const prefixWidth = visibleLength(prefix);
  const empty = query.length === 0;
  const visible = empty
    ? placeholder !== undefined
      ? c.dim(sliceVisible(placeholder, budget))
      : c.dim(sliceVisible("type to filter", budget))
    : sliceVisible(query, budget);
  const row = `${prefix}${empty ? c.inverse(" ") : `${visible}${c.inverse(" ")}`}`;
  const caretCol = 1 + prefixWidth + (empty ? 0 : visibleLength(visible));
  return [row, caretCol];
}

function renderOptionRows<T>(state: SelectState<T>, theme: Theme, width: number): string[] {
  const c = theme.colors;
  if (state.matches.length === 0) {
    return [`  ${c.dim("no matches")}`];
  }

  const count = state.matches.length;
  const viewSize = Math.min(count, MAX_VISIBLE_OPTIONS);
  const start = Math.max(
    0,
    Math.min(state.selectedIndex - Math.floor(viewSize / 2), count - viewSize),
  );
  const end = Math.min(start + viewSize, count);
  const visible = state.matches.slice(start, end);

  const labelWidth = Math.min(
    Math.max(...visible.map((option) => visibleLength(option.label))),
    Math.max(8, Math.floor(width * 0.5)),
  );

  return visible.map((option, offset) => {
    const isCursor = start + offset === state.selectedIndex;
    const pointer = isCursor ? c.cyan(theme.glyph.selectedPointer) : " ";
    const label = padLabel(option.label, labelWidth);
    const styledLabel = isCursor ? c.bold(label) : label;
    const description =
      option.description !== undefined ? `  ${c.dim(option.description)}` : "";
    return `${pointer} ${styledLabel}${description}`;
  });
}

function padLabel(label: string, width: number): string {
  const visible = visibleLength(label);
  if (visible >= width) return sliceVisible(label, width);
  return `${label}${" ".repeat(width - visible)}`;
}

