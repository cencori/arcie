import { describe, it, expect } from "vitest";
import { LiveRegion, type TerminalOutput } from "../src/cli/tui/renderer/live-region";

function fakeOutput(columns = 80, rows = 24): TerminalOutput & { chunks: string[] } {
  const chunks: string[] = [];
  const listeners: Array<() => void> = [];
  return {
    chunks,
    isTTY: true,
    columns,
    rows,
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
    on(_event: "resize", listener: () => void) {
      listeners.push(listener);
      return this;
    },
    off(_event: "resize", listener: () => void) {
      const idx = listeners.indexOf(listener);
      if (idx >= 0) listeners.splice(idx, 1);
      return this;
    },
  };
}

describe("LiveRegion", () => {
  it("first paint hides cursor, erases, writes rows, shows cursor", () => {
    const out = fakeOutput();
    const region = new LiveRegion({ output: out });
    region.paint(["> "], { row: 1, col: 3 });

    const combined = out.chunks.join("");
    expect(combined).toContain("\x1B[?25l");
    expect(combined).toContain("\x1B[G");
    expect(combined).toContain("\x1B[J");
    expect(combined).toContain("> ");
    expect(combined).toContain("\x1B[3G");
    expect(combined).toContain("\x1B[?25h");
  });

  it("second paint moves cursor up past previous frame before erasing", () => {
    const out = fakeOutput();
    const region = new LiveRegion({ output: out });
    region.paint(["> ", "status"], { row: 1, col: 3 });
    out.chunks.length = 0;
    region.paint(["> x", "status"], { row: 1, col: 4 });

    const combined = out.chunks.join("");
    expect(combined).toContain("\x1B[1A");
    expect(combined).toContain("> x\nstatus");
    expect(combined).toContain("\x1B[4G");
  });

  it("commit writes newline-terminated rows above the live region and repaints", () => {
    const out = fakeOutput();
    const region = new LiveRegion({ output: out });
    region.paint(["> "], { row: 1, col: 3 });
    out.chunks.length = 0;

    region.commit(["user: hello", "assistant: hi"]);

    const combined = out.chunks.join("");
    expect(combined).toContain("user: hello\n");
    expect(combined).toContain("assistant: hi\n");
    expect(combined).toContain("> ");
    expect(combined).toContain("\x1B[3G");
  });

  it("empty paint clears the region", () => {
    const out = fakeOutput();
    const region = new LiveRegion({ output: out });
    region.paint(["a", "b"], { row: 1, col: 1 });
    out.chunks.length = 0;
    region.paint([], { row: 1, col: 1 });

    const combined = out.chunks.join("");
    expect(combined).toContain("\x1B[1A");
    expect(combined).toContain("\x1B[J");
  });

  it("stop clears the region and shows the cursor", () => {
    const out = fakeOutput();
    const region = new LiveRegion({ output: out });
    region.paint(["a", "b"], { row: 1, col: 1 });
    out.chunks.length = 0;

    region.stop();
    const combined = out.chunks.join("");
    expect(combined).toContain("\x1B[?25h");
    expect(combined).toContain("\x1B[J");
  });

  it("stop after stop is a no-op", () => {
    const out = fakeOutput();
    const region = new LiveRegion({ output: out });
    region.paint(["a"], { row: 1, col: 1 });
    region.stop();
    out.chunks.length = 0;
    region.stop();
    expect(out.chunks.length).toBe(0);
  });

  it("commit with no live frame still emits the rows", () => {
    const out = fakeOutput();
    const region = new LiveRegion({ output: out });
    region.commit(["header"]);

    const combined = out.chunks.join("");
    expect(combined).toContain("header\n");
  });
});
