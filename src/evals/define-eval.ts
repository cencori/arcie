import type { EvalInput, EvalDefinition, EvalConfig } from "./types";

export function defineEval(input: EvalInput): EvalDefinition {
  if (!input.test) throw new Error("Eval must have a test function");

  if ("input" in input || "run" in input || "checks" in input || "scores" in input) {
    throw new Error("Invalid eval format — use defineEval({ description?, test(t) })");
  }

  return {
    description: input.description ?? "untitled eval",
    judge: input.judge,
    timeoutMs: input.timeoutMs,
    tags: input.tags,
    metadata: input.metadata,
    test: input.test,
  };
}

export function defineEvalConfig(input: EvalConfig): EvalConfig {
  if (input.judge && !input.judge.model) {
    throw new Error("EvalConfig judge must specify a model");
  }
  if (input.maxConcurrency !== undefined && (!Number.isInteger(input.maxConcurrency) || input.maxConcurrency < 1)) {
    throw new Error("EvalConfig maxConcurrency must be a positive integer");
  }
  if (input.timeoutMs !== undefined && input.timeoutMs < 0) {
    throw new Error("EvalConfig timeoutMs must be non-negative");
  }
  return {
    judge: input.judge,
    reporters: input.reporters ?? ["console"],
    maxConcurrency: input.maxConcurrency ?? 1,
    timeoutMs: input.timeoutMs ?? 30_000,
  };
}
