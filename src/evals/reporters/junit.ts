import type { EvalReporter, EvalResult, EvalRunSummary, EvalDefinition } from "../types";

export function createJunitReporter(outputPath?: string): EvalReporter {
  const results: EvalResult[] = [];

  return {
    onRunStart(_evals: EvalDefinition[], _target: string): void {
      results.length = 0;
    },

    onEvalComplete(result: EvalResult): void {
      results.push(result);
    },

    onRunComplete(summary: EvalRunSummary): void {
      const lines: string[] = [];
      lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
      lines.push(`<testsuite name="arcie.evals" tests="${summary.total}" failures="${summary.failed}" errors="${summary.errored}" skipped="${summary.skipped}">`);

      for (const r of results) {
        lines.push(`  <testcase classname="${escapeXml(r.id)}" name="${escapeXml(r.description)}" time="${(r.durationMs / 1000).toFixed(3)}">`);
        if (r.skipReason) {
          lines.push(`    <skipped message="${escapeXml(r.skipReason)}"/>`);
        }
        if (r.error) {
          lines.push(`    <error message="${escapeXml(r.error)}"/>`);
        }
        for (const a of r.assertions) {
          if (!a.passed) {
            const type = a.severity === "gate" ? "failure" : "failure";
            lines.push(`      <${type} message="${escapeXml(a.message ?? a.name)}" type="${a.severity}"/>`);
          }
        }
        lines.push(`  </testcase>`);
      }

      lines.push(`</testsuite>`);

      const output = lines.join("\n");

      if (outputPath) {
        try {
          const fs = require("node:fs");
          fs.writeFileSync(outputPath, output, "utf-8");
          console.log(`  JUnit report written to ${outputPath}`);
        } catch {
          console.warn("  Failed to write JUnit report");
        }
      } else {
        console.log(output);
      }
    },
  };
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
