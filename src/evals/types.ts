import type { StreamEvent } from "../protocol/events";

export type EvalVerdict = "passed" | "failed" | "scored" | "skipped";

export interface EvalAssertion {
  name: string;
  severity: "gate" | "soft";
  passed: boolean;
  score: number;
  threshold: number;
  message?: string;
}

export interface EvalResult {
  id: string;
  description: string;
  verdict: EvalVerdict;
  assertions: EvalAssertion[];
  output: string;
  events: StreamEvent[];
  error?: string;
  skipReason?: string;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
}

export interface EvalRunSummary {
  target: string;
  results: EvalResult[];
  passed: number;
  failed: number;
  scored: number;
  skipped: number;
  errored: number;
  total: number;
}

export interface EvalJudgeConfig {
  model: string;
}

export interface EvalConfig {
  judge?: EvalJudgeConfig;
  reporters?: ("console" | "junit")[];
  maxConcurrency?: number;
  timeoutMs?: number;
}

export interface EvalInput {
  description?: string;
  judge?: EvalJudgeConfig;
  timeoutMs?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  test: (t: EvalContext) => Promise<void> | void;
}

export interface EvalDefinition {
  description: string;
  judge?: EvalJudgeConfig;
  timeoutMs?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  test: (t: EvalContext) => Promise<void> | void;
}

export interface EvalAssertionHandle {
  gate: (threshold?: number) => EvalAssertionHandle;
  soft: (threshold?: number) => EvalAssertionHandle;
  atLeast: (threshold?: number) => EvalAssertionHandle;
}

export interface EvalContext {
  /** Send a message to the agent and return the reply. */
  send(input: string): Promise<string>;
  /** The last reply from send(). */
  reply: string;
  /** All replies from send() calls. */
  replies: string[];

  /** Assert the agent succeeded (no error). */
  succeeded(): EvalAssertionHandle;
  /** Assert the agent called a tool by name. */
  calledTool(name: string, opts?: { input?: Record<string, unknown> }): EvalAssertionHandle;
  /** Assert the agent did NOT call a tool by name. */
  notCalledTool(name: string): EvalAssertionHandle;
  /** Assert a max number of tool calls. */
  maxToolCalls(n: number): EvalAssertionHandle;
  /** Assert no tool calls were made. */
  usedNoTools(): EvalAssertionHandle;
  /** Assert the assistant message contains a substring or regex. */
  messageIncludes(token: string | RegExp): EvalAssertionHandle;
  /** Assert tool calls appeared in order (subsequence match). */
  toolOrder(names: string[]): EvalAssertionHandle;
  /** Assert no tool/subagent actions failed. */
  noFailedActions(): EvalAssertionHandle;
  /** Register a value assertion against a value. */
  check(value: unknown, assertion: EvalCheckFn): EvalAssertionHandle;
  /** Like check() but gates hard — stops the test body on failure. */
  require(value: unknown, assertion: EvalCheckFn): Promise<void>;
  /** Skip this eval with a reason. */
  skip(reason: string): void;
  /** Access judge graders. */
  judge: EvalJudgeContext;

  /** Access the full event stream. */
  events: StreamEvent[];
}

export interface EvalJudgeContext {
  autoevals: {
    factuality: (expected: string, opts?: { on?: string; model?: string }) => EvalAssertionHandle;
    summarizes: (expected: string, opts?: { on?: string; model?: string }) => EvalAssertionHandle;
    closedQA: (criteria: string, opts?: { on?: string; model?: string }) => EvalAssertionHandle;
  };
}

export type EvalCheckFn = (value: unknown) => { score: number; message?: string };

export type EvalReporter = {
  onRunStart(evals: EvalDefinition[], target: string): void | Promise<void>;
  onEvalComplete(result: EvalResult): void | Promise<void>;
  onRunComplete(summary: EvalRunSummary): void | Promise<void>;
};
