import type { EvalDefinition, EvalResult, EvalRunSummary, EvalReporter, EvalConfig } from "./types";
import type { StreamEvent } from "../protocol/events";
import { AssertionCollector } from "./assert";
import { createEvalContext, EvalSkipped, EvalRequirementFailed } from "./context";
import { buildJudgeContext } from "./judge";

export interface RunEvalsOptions {
  evals: Map<string, EvalDefinition>;
  config: EvalConfig;
  sendFn: (input: string) => Promise<string>;
  reporters: EvalReporter[];
  target: string;
}

export async function runEvals(options: RunEvalsOptions): Promise<EvalRunSummary> {
  const { evals, config, sendFn, reporters, target } = options;
  const results: EvalResult[] = [];
  const defs = Array.from(evals.entries());
  const maxConc = config.maxConcurrency ?? 1;

  for (const reporter of reporters) {
    await reporter.onRunStart(defs.map(([, d]) => d), target);
  }

  let idx = 0;
  while (idx < defs.length) {
    const batch = defs.slice(idx, idx + maxConc);
    idx += maxConc;
    const batchResults = await Promise.all(
      batch.map(([id, def]) => executeEval({ id, def, config, sendFn })),
    );
    results.push(...batchResults);
    for (const result of batchResults) {
      for (const reporter of reporters) {
        await reporter.onEvalComplete(result);
      }
    }
  }

  const summary: EvalRunSummary = {
    target,
    results,
    passed: results.filter((r) => r.verdict === "passed").length,
    failed: results.filter((r) => r.verdict === "failed").length,
    scored: results.filter((r) => r.verdict === "scored").length,
    skipped: results.filter((r) => r.verdict === "skipped").length,
    errored: results.filter((r) => r.error !== undefined).length,
    total: results.length,
  };

  for (const reporter of reporters) {
    await reporter.onRunComplete(summary);
  }

  return summary;
}

interface ExecuteEvalOptions {
  id: string;
  def: EvalDefinition;
  config: EvalConfig;
  sendFn: (input: string) => Promise<string>;
}

async function executeEval(options: ExecuteEvalOptions): Promise<EvalResult> {
  const { id, def, config, sendFn } = options;
  const startedAt = Date.now();
  const allEvents: StreamEvent[] = [];
  let output = "";
  let error: string | undefined;
  let skipReason: string | undefined;

  const collector = new AssertionCollector();
  const ctx = createEvalContext({
    collector,
    definition: def,
    sendFn: async (input: string) => {
      const result = await sendFn(input);
      return result;
    },
    getEvents: () => allEvents,
  });

  ctx.judge = buildJudgeContext(collector, () => ctx.reply, def.judge?.model ?? config.judge?.model);

  try {
    const timeoutMs = def.timeoutMs ?? config.timeoutMs ?? 30_000;
    const timer = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Eval timed out after ${timeoutMs}ms`)), timeoutMs),
    );
    await Promise.race([Promise.resolve(def.test(ctx)), timer]);
  } catch (err) {
    if (err instanceof EvalSkipped) {
      skipReason = err.message;
    } else if (err instanceof EvalRequirementFailed) {
      // already recorded as assertion
    } else {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  output = ctx.reply;
  const assertions = collector.finalize();

  const verdict = computeVerdict(assertions, error, skipReason);

  return {
    id,
    description: def.description,
    verdict,
    assertions,
    output,
    events: allEvents,
    error,
    skipReason,
    startedAt,
    finishedAt: Date.now(),
    durationMs: Date.now() - startedAt,
  };
}

function computeVerdict(
  assertions: import("./types").EvalAssertion[],
  error: string | undefined,
  skipReason: string | undefined,
): import("./types").EvalVerdict {
  if (skipReason) return "skipped";
  if (error) return "failed";
  const hasFailedGate = assertions.some((a) => a.severity === "gate" && !a.passed);
  if (hasFailedGate) return "failed";
  const hasFailedSoft = assertions.some((a) => a.severity === "soft" && !a.passed);
  if (hasFailedSoft) return "scored";
  return "passed";
}
