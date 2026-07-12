import { readdirSync, existsSync, statSync } from "node:fs";
import { resolve, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import type { EvalDefinition } from "./types";

const _require = createRequire(import.meta.url);

export function discoverEvalFiles(appRoot: string): string[] {
  const evalsDir = resolve(appRoot, "evals");
  if (!existsSync(evalsDir)) return [];

  const results: string[] = [];
  walkDir(evalsDir, results);
  return results.sort();
}

function walkDir(dir: string, results: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries.sort()) {
    const fullPath = resolve(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath, results);
    } else if (entry.endsWith(".eval.ts") || entry.endsWith(".eval.js")) {
      results.push(fullPath);
    }
  }
}

export function importEvalFiles(appRoot: string, filePaths: string[]): Map<string, EvalDefinition> {
  const evalsDir = resolve(appRoot, "evals");
  const map = new Map<string, EvalDefinition>();

  for (const filePath of filePaths) {
    const relative = filePath.startsWith(evalsDir)
      ? filePath.slice(evalsDir.length + 1)
      : filePath;
    const id = relative.replace(/\.eval\.(ts|js)$/, "");

    try {
      const mod = _require(filePath);
      const def = mod.default ?? mod;
      if (Array.isArray(def)) {
        def.forEach((d: EvalDefinition, i: number) => {
          const entryId = `${id}/${String(i).padStart(4, "0")}`;
          map.set(entryId, d);
        });
      } else {
        map.set(id, def);
      }
    } catch {
      // skip unloadable files
    }
  }

  return map;
}

export function importEvalConfig(appRoot: string): Record<string, unknown> | null {
  const tsPath = resolve(appRoot, "evals", "evals.config.ts");
  const jsPath = resolve(appRoot, "evals", "evals.config.js");
  const target = existsSync(tsPath) ? tsPath : existsSync(jsPath) ? jsPath : null;
  if (!target) return null;
  try {
    const mod = _require(target);
    return mod.default ?? mod;
  } catch {
    return null;
  }
}
