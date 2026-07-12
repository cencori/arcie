import type { EvalReporter, EvalResult, EvalRunSummary, EvalDefinition } from "../types";

const VERDICT_ICONS: Record<string, string> = {
  passed: "\u2713",
  failed: "\u2717",
  scored: "\u26A0",
  skipped: "\u2014",
};

export const ConsoleReporter: EvalReporter = {
  onRunStart(_evals: EvalDefinition[], _target: string): void {
    console.log("");
  },

  onEvalComplete(result: EvalResult): void {
    const icon = VERDICT_ICONS[result.verdict] ?? "?";
    const time = result.durationMs < 1000
      ? `${result.durationMs}ms`
      : `${(result.durationMs / 1000).toFixed(1)}s`;
    const gateFailures = result.assertions.filter((a) => a.severity === "gate" && !a.passed).length;
    const softFailures = result.assertions.filter((a) => a.severity === "soft" && !a.passed).length;

    const parts: string[] = [];
    if (gateFailures > 0) parts.push(`${gateFailures} failed`);
    if (softFailures > 0) parts.push(`${softFailures} soft`);
    if (parts.length === 0) parts.push("all passed");

    console.log(`  ${icon} ${result.id} — ${parts.join(", ")} (${time})`);
    if (result.error) {
      console.log(`       error: ${result.error}`);
    }
    if (result.skipReason) {
      console.log(`       skipped: ${result.skipReason}`);
    }
  },

  onRunComplete(summary: EvalRunSummary): void {
    console.log("");
    const total = summary.total;
    const passed = summary.passed;
    const failed = summary.failed;
    const scored = summary.scored;
    const skipped = summary.skipped;
    const errored = summary.errored;

    console.log(`  Results: ${passed}/${total} passed` +
      (failed > 0 ? `, ${failed} failed` : "") +
      (scored > 0 ? `, ${scored} scored` : "") +
      (skipped > 0 ? `, ${skipped} skipped` : "") +
      (errored > 0 ? `, ${errored} errored` : ""));
  },
};
