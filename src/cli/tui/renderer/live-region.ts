export interface TerminalOutput {
  readonly isTTY?: boolean;
  readonly columns?: number;
  readonly rows?: number;
  write(chunk: string): boolean;
  on(event: "resize", listener: () => void): unknown;
  off(event: "resize", listener: () => void): unknown;
}

export interface LiveRegionCaret {
  readonly row: number;
  readonly col: number;
}

export interface LiveRegionOptions {
  readonly output?: TerminalOutput;
  readonly onResize?: (size: { columns: number; rows: number }) => void;
}

const ESC = "\x1B[";
const ERASE_DOWN = `${ESC}J`;
const CURSOR_TO_COL_1 = `${ESC}G`;
const HIDE_CURSOR = `${ESC}?25l`;
const SHOW_CURSOR = `${ESC}?25h`;

function cursorUp(rows: number): string {
  return rows > 0 ? `${ESC}${rows}A` : "";
}

function cursorDown(rows: number): string {
  return rows > 0 ? `${ESC}${rows}B` : "";
}

function cursorToColumn(col: number): string {
  return `${ESC}${Math.max(1, col)}G`;
}

/**
 * Bottom-anchored redraw region.
 *
 * `paint(rows)` diffs against the previously painted frame and rewrites only
 * what changed. `commit(rows)` scrolls new lines above the live region into
 * scrollback and repaints. Callers own the string contents; this class owns
 * cursor arithmetic.
 */
export class LiveRegion {
  readonly #output: TerminalOutput;
  readonly #resizeListener: () => void;
  #lastFrame: string[] = [];
  #caret: LiveRegionCaret = { row: 0, col: 1 };
  #stopped = false;

  constructor(options: LiveRegionOptions = {}) {
    this.#output = options.output ?? (process.stdout as unknown as TerminalOutput);
    this.#resizeListener = () => {
      if (this.#stopped) return;
      options.onResize?.({
        columns: this.#output.columns ?? 80,
        rows: this.#output.rows ?? 24,
      });
      const previous = this.#lastFrame;
      this.#lastFrame = [];
      this.paint(previous, this.#caret);
    };
    this.#output.on("resize", this.#resizeListener);
  }

  get columns(): number {
    return this.#output.columns ?? 80;
  }

  get rows(): number {
    return this.#output.rows ?? 24;
  }

  /**
   * Redraws the live region to match `rows`. The cursor is positioned at
   * `caret` (1-indexed row within the region, 1-indexed column). Passing an
   * empty array clears the region without leaving trailing blank lines.
   */
  paint(rows: readonly string[], caret: LiveRegionCaret = { row: 1, col: 1 }): void {
    if (this.#stopped) return;
    const output = this.#output;
    const previousHeight = this.#lastFrame.length;

    let chunk = HIDE_CURSOR;
    if (previousHeight > 0) {
      chunk += cursorUp(previousHeight - 1) + CURSOR_TO_COL_1 + ERASE_DOWN;
    } else {
      chunk += CURSOR_TO_COL_1 + ERASE_DOWN;
    }
    chunk += rows.join("\n");

    const rowsBelowCaret = Math.max(0, rows.length - Math.max(1, caret.row));
    if (rowsBelowCaret > 0) chunk += cursorUp(rowsBelowCaret);
    chunk += cursorToColumn(caret.col);
    chunk += SHOW_CURSOR;

    output.write(chunk);
    this.#lastFrame = [...rows];
    this.#caret = caret;
  }

  /**
   * Commits `rows` to scrollback above the live region, then repaints the
   * region beneath them. Rows are terminated by newlines so the terminal
   * scrolls each into history.
   */
  commit(rows: readonly string[]): void {
    if (this.#stopped) return;
    if (rows.length === 0) return;
    const output = this.#output;
    const previousHeight = this.#lastFrame.length;

    let chunk = HIDE_CURSOR;
    if (previousHeight > 0) {
      chunk += cursorUp(previousHeight - 1) + CURSOR_TO_COL_1 + ERASE_DOWN;
    } else {
      chunk += CURSOR_TO_COL_1;
    }
    for (const row of rows) chunk += `${row}\n`;
    output.write(chunk);

    const preserved = this.#lastFrame;
    const caret = this.#caret;
    this.#lastFrame = [];
    if (preserved.length > 0) {
      this.paint(preserved, caret);
    } else {
      output.write(SHOW_CURSOR);
    }
  }

  /**
   * Clears the live region and shows the cursor at the start of what used to
   * be the region's first row. Idempotent; safe to call from cleanup paths.
   */
  stop(): void {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#output.off("resize", this.#resizeListener);
    if (this.#lastFrame.length > 0) {
      const chunk =
        cursorUp(this.#lastFrame.length - 1) + CURSOR_TO_COL_1 + ERASE_DOWN + SHOW_CURSOR;
      this.#output.write(chunk);
    } else {
      this.#output.write(SHOW_CURSOR);
    }
    this.#lastFrame = [];
  }
}
