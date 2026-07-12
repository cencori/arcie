import type { EvalAssertionHandle, EvalJudgeContext } from "./types";
import type { AssertionCollector } from "./assert";

const NOOP_HANDLE: EvalAssertionHandle = {
  gate: () => NOOP_HANDLE,
  soft: () => NOOP_HANDLE,
  atLeast: () => NOOP_HANDLE,
};

export function buildJudgeContext(
  collector: AssertionCollector,
  _getReply: () => string,
  judgeModel?: string,
): EvalJudgeContext {
  function grader(
    name: string,
    scoreFn: (expected: string, value: string) => { score: number; message?: string },
  ) {
    return (expected: string, opts?: { on?: string; model?: string }) => {
      const model = opts?.model ?? judgeModel;
      collector.record(`judge:${name}`, "soft", () => {
        if (!model) return { score: 0, message: `No judge model configured for ${name}` };
        const value = opts?.on ?? _getReply();
        return scoreFn(expected, value);
      }, 0);
      return NOOP_HANDLE;
    };
  }

  return {
    autoevals: {
      factuality: grader("factuality", (expected, value) => {
        const score = value.includes(expected) ? 1 : 0;
        return { score, message: score === 0 ? `Expected factuality match for "${expected}"` : undefined };
      }),
      summarizes: grader("summarizes", (expected, value) => {
        const score = value.length > 0 ? 1 : 0;
        return { score, message: score === 0 ? "Expected non-empty summary" : undefined };
      }),
      closedQA: grader("closedQA", (expected, value) => {
        const score = value.length > 0 ? 1 : 0;
        return { score, message: score === 0 ? `Expected answer for: "${expected}"` : undefined };
      }),
    },
  };
}
