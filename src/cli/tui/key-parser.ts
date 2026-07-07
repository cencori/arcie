export type TerminalKey =
  | {
      type: "text";
      value: string;
      framing: "unframed" | "bracketed-paste";
    }
  | { type: "newline" }
  | { type: "backspace" }
  | { type: "delete" }
  | { type: "enter" }
  | { type: "up" }
  | { type: "down" }
  | { type: "left" }
  | { type: "right" }
  | { type: "home" }
  | { type: "end" }
  | { type: "tab" }
  | { type: "escape" }
  | { type: "ctrl-a" }
  | { type: "ctrl-e" }
  | { type: "ctrl-d" }
  | { type: "ctrl-k" }
  | { type: "ctrl-n" }
  | { type: "ctrl-p" }
  | { type: "ctrl-u" }
  | { type: "ctrl-w" }
  | { type: "ctrl-l" }
  | { type: "ctrl-r" }
  | { type: "ctrl-c" }
  | { type: "ignore" };

export interface KeyToken {
  key?: TerminalKey;
  consumed: number;
  incomplete?: boolean;
}

const CSI_FINAL = /[@-~]/u;
const PASTE_START = "\x1B[200~";
const PASTE_END = "\x1B[201~";

export function sanitizePastedText(text: string): string {
  let printable = "";
  for (const character of text.replace(/\r\n?/gu, "\n")) {
    if (character === "\n" || character === "\t") {
      printable += character;
      continue;
    }
    const code = character.codePointAt(0);
    if (code === undefined) continue;
    if (code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) continue;
    printable += character;
  }
  return printable;
}

export function isIncompletePaste(buffer: string): boolean {
  return buffer.startsWith(PASTE_START) && !buffer.includes(PASTE_END, PASTE_START.length);
}

export function stripPasteStart(buffer: string): string {
  return buffer.startsWith(PASTE_START) ? buffer.slice(PASTE_START.length) : buffer;
}

export function stripPromptControlCharacters(text: string): string {
  let printable = "";
  for (const character of text) {
    if (character >= " " && character !== "\x7f") printable += character;
  }
  return printable;
}

export function nextKey(buffer: string): KeyToken {
  const first = buffer[0];
  if (first === undefined) return { consumed: 0, incomplete: true };

  if (first === "\x1B") {
    if (buffer.length === 1) return { consumed: 0, incomplete: true };
    const second = buffer[1];
    if (second === "O") {
      if (buffer.length < 3) return { consumed: 0, incomplete: true };
      return { key: parseKey(Buffer.from(buffer.slice(0, 3))), consumed: 3 };
    }
    if (second === "[") {
      if (buffer.startsWith(PASTE_START)) {
        const end = buffer.indexOf(PASTE_END, PASTE_START.length);
        if (end === -1) return { consumed: 0, incomplete: true };
        return {
          key: {
            type: "text",
            value: sanitizePastedText(buffer.slice(PASTE_START.length, end)),
            framing: "bracketed-paste",
          },
          consumed: end + PASTE_END.length,
        };
      }
      for (let i = 2; i < buffer.length; i += 1) {
        if (CSI_FINAL.test(buffer[i]!)) {
          return { key: parseKey(Buffer.from(buffer.slice(0, i + 1))), consumed: i + 1 };
        }
      }
      return { consumed: 0, incomplete: true };
    }
    return { key: { type: "escape" }, consumed: 1 };
  }

  if (first < " " || first === "\x7F") {
    return { key: parseKey(Buffer.from(first)), consumed: 1 };
  }

  let end = 1;
  while (end < buffer.length) {
    const char = buffer[end]!;
    if (char === "\x1B" || char < " " || char === "\x7F") break;
    end += 1;
  }
  return { key: parseKey(Buffer.from(buffer.slice(0, end))), consumed: end };
}

export function parseKey(chunk: Buffer): TerminalKey {
  const value = chunk.toString("utf8");

  switch (value) {
    case "": return { type: "ctrl-a" };
    case "": return { type: "ctrl-e" };
    case "": return { type: "ctrl-d" };
    case "": return { type: "ctrl-k" };
    case "": return { type: "ctrl-n" };
    case "": return { type: "ctrl-p" };
    case "": return { type: "ctrl-l" };
    case "": return { type: "ctrl-r" };
    case "": return { type: "ctrl-u" };
    case "": return { type: "ctrl-w" };
    case "": return { type: "ctrl-c" };
    case "\r":
    case "\n":
      return { type: "enter" };
    case "\x1b[27;2;13~":
    case "\x1b[13;2u":
      return { type: "newline" };
    case "":
    case "\b":
      return { type: "backspace" };
    case "\x1B[A":
    case "\x1BOA":
      return { type: "up" };
    case "\x1B[B":
    case "\x1BOB":
      return { type: "down" };
    case "\x1B[C":
    case "\x1BOC":
      return { type: "right" };
    case "\x1B[D":
    case "\x1BOD":
      return { type: "left" };
    case "\x1B[H":
    case "\x1BOH":
    case "\x1B[1~":
      return { type: "home" };
    case "\x1B[F":
    case "\x1BOF":
    case "\x1B[4~":
      return { type: "end" };
    case "\x1B[3~":
      return { type: "delete" };
    case "\t":
      return { type: "tab" };
    case "\x1B":
      return { type: "escape" };
    default: {
      const printable = stripPromptControlCharacters(value);
      return printable.length > 0
        ? { type: "text", value: printable, framing: "unframed" }
        : { type: "ignore" };
    }
  }
}
