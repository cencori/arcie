import { stdin as input } from "node:process";
import { isIncompletePaste, nextKey, type TerminalKey } from "./key-parser";

/**
 * Puts stdin into raw mode, decodes bytes into `TerminalKey`s, and delivers
 * them to `onKey`. Returns a detach function that restores the previous raw
 * mode and stops delivering keys. Safe to call in a non-TTY (raw mode is
 * skipped; delivered keys become whatever the terminal sends).
 */
export function attachKeyStream(onKey: (key: TerminalKey) => void): () => void {
  let buffer = "";
  const originalRawMode = input.isRaw;

  const onData = (chunk: Buffer): void => {
    buffer += chunk.toString("utf8");
    if (isIncompletePaste(buffer)) return;
    while (buffer.length > 0) {
      const token = nextKey(buffer);
      if (token.incomplete === true) break;
      buffer = buffer.slice(token.consumed);
      if (token.key !== undefined && token.key.type !== "ignore") onKey(token.key);
    }
  };

  try {
    input.setRawMode?.(true);
  } catch {
    // Non-TTY: raw mode not available; keystrokes still deliver.
  }
  input.resume();
  input.on("data", onData);

  return () => {
    input.off("data", onData);
    try {
      input.setRawMode?.(originalRawMode ?? false);
    } catch {
      /* ignore */
    }
    input.pause();
  };
}
