import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";

const __dirname = dirname(fileURLToPath(import.meta.url));
let _version = "0.0.0";
try {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf-8"));
  _version = pkg.version;
} catch {}

export const ARCIE_WORDMARK = "arcie";

export function version(): string {
  return _version;
}

export function arcieCliBanner(): string {
  return `${chalk.bgBlack.white(` ${ARCIE_WORDMARK} `)} ${chalk.dim(`v${_version}`)}`;
}

export function showHeader(): void {
  console.log(`  ${chalk.bold("arcie")} ${chalk.dim(`v${_version}`)}`);
  console.log();
}

export function divider(): void {
  console.log();
  console.log(`  ${chalk.dim("─".repeat(50))}`);
  console.log();
}
