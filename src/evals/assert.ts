import type { EvalAssertion } from "./types";

export class AssertionCollector {
  private entries: AssertionEntry[] = [];

  record(name: string, severity: "gate" | "soft", scoreFn: () => { score: number; message?: string }, threshold: number): number {
    const idx = this.entries.length;
    this.entries.push({ name, severity, scoreFn, threshold });
    return idx;
  }

  updateEntry(idx: number, severity: "gate" | "soft", threshold: number): void {
    if (idx >= 0 && idx < this.entries.length) {
      this.entries[idx].severity = severity;
      this.entries[idx].threshold = threshold;
    }
  }

  finalize(): EvalAssertion[] {
    const results: EvalAssertion[] = [];
    for (const entry of this.entries) {
      try {
        const { score, message } = entry.scoreFn();
        const passed = entry.severity === "gate"
          ? score >= entry.threshold
          : entry.threshold === 0 || score >= entry.threshold;
        results.push({
          name: entry.name,
          severity: entry.severity,
          passed,
          score,
          threshold: entry.threshold,
          message,
        });
      } catch (err) {
        results.push({
          name: entry.name,
          severity: "gate",
          passed: false,
          score: 0,
          threshold: 1,
          message: `Assertion threw: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
    return results;
  }
}

interface AssertionEntry {
  name: string;
  severity: "gate" | "soft";
  scoreFn: () => { score: number; message?: string };
  threshold: number;
}
