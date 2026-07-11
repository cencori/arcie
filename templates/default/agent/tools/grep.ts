import { defineTool } from "arcie";
import { z } from "zod";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const EXCLUDED_DIRS = new Set(["node_modules", ".git", "dist", ".next", "build", "out", ".memory"]);

interface Match {
  file: string;
  line: number;
  content: string;
}

function walkAndGrep(dir: string, pattern: RegExp, maxResults: number, projectRoot: string): Match[] {
  const matches: Match[] = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (matches.length >= maxResults) break;
      if (entry.startsWith(".") || EXCLUDED_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      let stat;
      try { stat = statSync(full); } catch { continue; }
      if (stat.isDirectory()) {
        matches.push(...walkAndGrep(full, pattern, maxResults - matches.length, projectRoot));
      } else if (stat.isFile() && stat.size < 500_000) {
        try {
          const content = readFileSync(full, "utf-8");
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (matches.length >= maxResults) break;
            if (pattern.test(lines[i]!)) {
              const rel = relative(projectRoot, full);
              matches.push({ file: rel, line: i + 1, content: lines[i]!.trim() });
            }
          }
        } catch {
          // skip binary/unreadable files
        }
      }
    }
  } catch {
    // skip unreadable directories
  }
  return matches;
}

export default defineTool({
  description:
    "Search file contents across the project using a regex pattern. Returns matching files with line numbers and content. Excludes node_modules, .git, dist, and build directories automatically.",
  inputSchema: z.object({
    pattern: z.string().describe("The regex pattern to search for (e.g. 'function\\s+\\w+' or 'TODO' or 'defineTool')"),
    path: z.string().optional().describe("Optional subdirectory to scope the search, e.g. 'agent/tools' or 'src'"),
    maxResults: z.number().optional().default(20).describe("Maximum number of matches to return"),
  }),
  execute: ({ pattern, path, maxResults }) => {
    const projectRoot = process.cwd();
    const searchDir = path ? join(projectRoot, path) : projectRoot;

    if (!existsSync(searchDir)) {
      return { pattern, error: `Directory not found: ${path ?? "."}`, matches: [], count: 0 };
    }

    let regex: RegExp;
    try {
      regex = new RegExp(pattern, "i");
    } catch {
      return { pattern, error: `Invalid regex pattern: "${pattern}"`, matches: [], count: 0 };
    }

    const matches = walkAndGrep(searchDir, regex, maxResults, projectRoot);

    return {
      pattern,
      path: path ?? ".",
      count: matches.length,
      truncated: matches.length >= maxResults,
      matches,
    };
  },
});
