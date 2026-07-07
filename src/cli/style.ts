const RESET = "\x1B[0m";
const BOLD = "\x1B[1m";
const GREY = "\x1B[38;5;242m";
const DIM = "\x1B[38;5;238m";
const RED = "\x1B[38;5;1m";
const GREEN = "\x1B[38;5;2m";
const YELLOW = "\x1B[38;5;3m";
const WHITE = "\x1B[38;5;15m";

export function bold(text: string): string {
  return `${BOLD}${text}${RESET}`;
}

export function grey(text: string): string {
  return `${GREY}${text}${RESET}`;
}

export function dim(text: string): string {
  return `${DIM}${text}${RESET}`;
}

export function dimmed(text: string): string {
  return grey(text);
}

export function red(text: string): string {
  return `${RED}${text}${RESET}`;
}

export function green(text: string): string {
  return `${GREEN}${text}${RESET}`;
}

export function yellow(text: string): string {
  return `${YELLOW}${text}${RESET}`;
}

export function white(text: string): string {
  return `${WHITE}${text}${RESET}`;
}

export const glyph = {
  user: "\u25B2",
  assistant: "\u25BC",
  tool: "\u25C7",
  error: "\u25B2",
  check: "\u2713",
  cross: "\u2717",
  bullet: "\u00B7",
  divider: "\u2500",
}
