import type { EvalContext, EvalAssertionHandle, EvalCheckFn, EvalDefinition } from "./types";
import type { AssertionCollector } from "./assert";
import type { StreamEvent } from "../protocol/events";

export interface EvalContextDeps {
  collector: AssertionCollector;
  definition: EvalDefinition;
  sendFn: (input: string) => Promise<string>;
  getEvents: () => StreamEvent[];
}

export function createEvalContext(deps: EvalContextDeps): EvalContext {
  const replies: string[] = [];
  let _reply = "";

  function scoped(name: string, fn: () => { score: number; message?: string }): EvalAssertionHandle {
    const idx = deps.collector.record(name, "gate", fn, 1);
    return makeHandle(deps.collector, idx);
  }

  const ctx: EvalContext = {
    get reply() { return _reply; },
    get replies() { return [...replies]; },
    get events() { return deps.getEvents(); },

    async send(input: string): Promise<string> {
      const output = await deps.sendFn(input);
      replies.push(output);
      _reply = output;
      return output;
    },

    succeeded() {
      return scoped("succeeded", () => ({ score: 1 }));
    },

    calledTool(name: string, opts?: { input?: Record<string, unknown> }) {
      return scoped(`calledTool:${name}`, () => {
        const events = deps.getEvents();
        for (const e of events) {
          if (e.type === "tool.started" && e.data.name === name) {
            if (opts?.input) {
              const matches = Object.entries(opts.input).every(
                ([k, v]) => JSON.stringify((e.data.input as Record<string, unknown>)?.[k]) === JSON.stringify(v),
              );
              if (matches) return { score: 1 };
            } else {
              return { score: 1 };
            }
          }
        }
        return { score: 0, message: `Expected tool "${name}" to be called` };
      });
    },

    notCalledTool(name: string) {
      return scoped(`notCalledTool:${name}`, () => {
        const called = deps.getEvents().some((e) => e.type === "tool.started" && e.data.name === name);
        return called ? { score: 0, message: `Expected tool "${name}" NOT to be called` } : { score: 1 };
      });
    },

    maxToolCalls(n: number) {
      return scoped(`maxToolCalls:${n}`, () => {
        const count = deps.getEvents().filter((e) => e.type === "tool.started").length;
        return count <= n
          ? { score: 1 }
          : { score: 0, message: `Expected ≤${n} tool calls, got ${count}` };
      });
    },

    usedNoTools() {
      return scoped("usedNoTools", () => {
        const count = deps.getEvents().filter((e) => e.type === "tool.started").length;
        return count === 0 ? { score: 1 } : { score: 0, message: `Expected no tool calls, got ${count}` };
      });
    },

    messageIncludes(token: string | RegExp) {
      return scoped("messageIncludes", () => {
        const text = _reply;
        if (token instanceof RegExp) {
          return token.test(text) ? { score: 1 } : { score: 0, message: `Expected reply to match ${token}` };
        }
        return text.includes(token) ? { score: 1 } : { score: 0, message: `Expected reply to include "${token}"` };
      });
    },

    toolOrder(names: string[]) {
      return scoped(`toolOrder:[${names.join(",")}]`, () => {
        const called = deps.getEvents()
          .filter((e): e is StreamEvent & { type: "tool.started" } => e.type === "tool.started")
          .map((e) => e.data.name);
        let ci = 0;
        for (const name of called) if (name === names[ci]) ci++;
        return ci === names.length
          ? { score: 1 }
          : { score: 0, message: `Expected tool order ${names.join(" → ")}, got ${called.join(" → ")}` };
      });
    },

    noFailedActions() {
      return scoped("noFailedActions", () => {
        const failed = deps.getEvents().filter(
          (e) => (e.type === "tool.completed" && e.data.status === "failed") ||
                 (e.type === "subagent.completed" && e.data.output.startsWith("Error:")),
        );
        return failed.length === 0 ? { score: 1 } : { score: 0, message: `${failed.length} actions failed` };
      });
    },

    check(value: unknown, assertion: EvalCheckFn) {
      const name = `check:${typeof value}`;
      const { score, message } = assertion(value);
      const idx = deps.collector.record(name, "gate", () => ({ score, message }), 1);
      return makeHandle(deps.collector, idx);
    },

    async require(value: unknown, assertion: EvalCheckFn) {
      const { score, message } = assertion(value);
      deps.collector.record(`require:${typeof value}`, "gate", () => ({ score, message }), 1);
      if (score < 1) throw new EvalRequirementFailed(message ?? "Requirement failed");
    },

    skip(reason: string) { throw new EvalSkipped(reason); },

    judge: null as unknown as EvalContext["judge"],
  };

  return ctx;
}

function makeHandle(collector: AssertionCollector, idx: number): EvalAssertionHandle {
  return {
    gate: (threshold?: number) => { collector.updateEntry(idx, "gate", threshold ?? 1); return makeHandle(collector, idx); },
    soft: (threshold?: number) => { collector.updateEntry(idx, "soft", threshold ?? 0); return makeHandle(collector, idx); },
    atLeast: (threshold?: number) => { collector.updateEntry(idx, "soft", threshold ?? 0); return makeHandle(collector, idx); },
  };
}

export class EvalSkipped extends Error {
  constructor(reason: string) { super(reason); this.name = "EvalSkipped"; }
}

export class EvalRequirementFailed extends Error {
  constructor(message: string) { super(message); this.name = "EvalRequirementFailed"; }
}
