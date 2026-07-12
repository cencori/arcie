import { describe, it, expect } from "vitest";
import { defineEval, defineEvalConfig } from "../src/evals/define-eval";
import { AssertionCollector } from "../src/evals/assert";
import { createEvalContext, EvalSkipped, EvalRequirementFailed } from "../src/evals/context";
import { includes, equals, matches, satisfies, similarity } from "../src/evals/expect/index";
import type { StreamEvent } from "../src/protocol/events";

describe("defineEval", () => {
  it("accepts a valid eval", () => {
    const ev = defineEval({
      description: "test eval",
      test: (t) => { t.succeeded(); },
    });
    expect(ev.description).toBe("test eval");
    expect(typeof ev.test).toBe("function");
  });

  it("defaults description to untitled", () => {
    const ev = defineEval({ test: (t) => {} });
    expect(ev.description).toBe("untitled eval");
  });

  it("throws if test is missing", () => {
    expect(() => defineEval({} as any)).toThrow("Eval must have a test function");
  });

  it("throws for legacy format", () => {
    expect(() => defineEval({ test: (t) => {}, input: "foo" } as any)).toThrow("Invalid eval format");
  });

  it("accepts optional fields", () => {
    const ev = defineEval({
      description: "tagged",
      tags: ["critical"],
      metadata: { key: "val" },
      judge: { model: "gpt-4o" },
      timeoutMs: 5000,
      test: (t) => {},
    });
    expect(ev.tags).toEqual(["critical"]);
    expect(ev.metadata).toEqual({ key: "val" });
    expect(ev.judge?.model).toBe("gpt-4o");
    expect(ev.timeoutMs).toBe(5000);
  });
});

describe("defineEvalConfig", () => {
  it("accepts minimal config", () => {
    const cfg = defineEvalConfig({});
    expect(cfg.maxConcurrency).toBe(1);
    expect(cfg.timeoutMs).toBe(30_000);
    expect(cfg.reporters).toEqual(["console"]);
  });

  it("validates judge model", () => {
    expect(() => defineEvalConfig({ judge: { model: "" } })).toThrow("must specify a model");
  });

  it("validates maxConcurrency", () => {
    expect(() => defineEvalConfig({ maxConcurrency: 0 })).toThrow("positive integer");
    expect(() => defineEvalConfig({ maxConcurrency: 1.5 })).toThrow("positive integer");
  });

  it("validates timeoutMs", () => {
    expect(() => defineEvalConfig({ timeoutMs: -1 })).toThrow("non-negative");
  });
});

describe("AssertionCollector", () => {
  it("records and finalizes gate assertions", () => {
    const c = new AssertionCollector();
    c.record("test", "gate", () => ({ score: 1 }), 1);
    const results = c.finalize();
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("test");
    expect(results[0].passed).toBe(true);
    expect(results[0].severity).toBe("gate");
  });

  it("fails gate when score below threshold", () => {
    const c = new AssertionCollector();
    c.record("fail", "gate", () => ({ score: 0, message: "nope" }), 1);
    const results = c.finalize();
    expect(results[0].passed).toBe(false);
    expect(results[0].message).toBe("nope");
  });

  it("soft assertions pass when threshold is 0", () => {
    const c = new AssertionCollector();
    c.record("soft", "soft", () => ({ score: 0 }), 0);
    const results = c.finalize();
    expect(results[0].passed).toBe(true);
  });

  it("updateEntry modifies severity and threshold", () => {
    const c = new AssertionCollector();
    const idx = c.record("changeme", "gate", () => ({ score: 0.5 }), 1);
    c.updateEntry(idx, "soft", 0);
    const results = c.finalize();
    expect(results[0].severity).toBe("soft");
    expect(results[0].passed).toBe(true); // soft with threshold 0 always passes
  });

  it("handles assertion that throws", () => {
    const c = new AssertionCollector();
    c.record("throw", "gate", () => { throw new Error("boom"); }, 1);
    const results = c.finalize();
    expect(results[0].passed).toBe(false);
    expect(results[0].message).toContain("boom");
  });
});

describe("EvalContext", () => {
  function makeCtx(sendReturns: string = "hello", events: StreamEvent[] = []) {
    const collector = new AssertionCollector();
    const ctx = createEvalContext({
      collector,
      definition: { description: "test", test: (t) => {} },
      sendFn: async (input: string) => sendReturns,
      getEvents: () => events,
    });
    return { ctx, collector };
  }

  it("send returns the output", async () => {
    const { ctx } = makeCtx("world");
    const result = await ctx.send("hi");
    expect(result).toBe("world");
    expect(ctx.reply).toBe("world");
    expect(ctx.replies).toEqual(["world"]);
  });

  it("calledTool passes when tool is in events", () => {
    const events: StreamEvent[] = [
      { type: "tool.started", data: { name: "get_weather", input: { city: "NYC" }, callId: "c1", sequence: 1, stepIndex: 0, turnId: "t1" } },
      { type: "tool.completed", data: { name: "get_weather", output: "sunny", callId: "c1", status: "completed", sequence: 1, stepIndex: 0, turnId: "t1" } },
    ];
    const { ctx, collector } = makeCtx("done", events);
    ctx.calledTool("get_weather");
    const results = collector.finalize();
    expect(results[0].passed).toBe(true);
  });

  it("calledTool fails when tool is missing", () => {
    const { ctx, collector } = makeCtx("done", []);
    ctx.calledTool("missing_tool");
    const results = collector.finalize();
    expect(results[0].passed).toBe(false);
    expect(results[0].message).toContain("missing_tool");
  });

  it("calledTool matches input", () => {
    const events: StreamEvent[] = [
      { type: "tool.started", data: { name: "search", input: { query: "weather" }, callId: "c1", sequence: 1, stepIndex: 0, turnId: "t1" } },
    ];
    const { ctx, collector } = makeCtx("done", events);
    ctx.calledTool("search", { input: { query: "weather" } });
    const results = collector.finalize();
    expect(results[0].passed).toBe(true);

    ctx.calledTool("search", { input: { query: "other" } });
    expect(collector.finalize()[1].passed).toBe(false);
  });

  it("notCalledTool passes when tool not called", () => {
    const { ctx, collector } = makeCtx("done", []);
    ctx.notCalledTool("danger");
    const results = collector.finalize();
    expect(results[0].passed).toBe(true);
  });

  it("messageIncludes checks reply text", async () => {
    const { ctx, collector } = makeCtx("The weather is sunny today");
    await ctx.send("what's the weather?");
    ctx.messageIncludes("sunny");
    ctx.messageIncludes(/sunny/);
    ctx.messageIncludes("rain");
    const results = collector.finalize();
    expect(results[0].passed).toBe(true);
    expect(results[1].passed).toBe(true);
    expect(results[2].passed).toBe(false);
  });

  it("maxToolCalls counts tool.started events", () => {
    const events: StreamEvent[] = [
      { type: "tool.started", data: { name: "a", input: {}, callId: "c1", sequence: 1, stepIndex: 0, turnId: "t1" } },
      { type: "tool.started", data: { name: "b", input: {}, callId: "c2", sequence: 2, stepIndex: 0, turnId: "t1" } },
      { type: "tool.started", data: { name: "c", input: {}, callId: "c3", sequence: 3, stepIndex: 0, turnId: "t1" } },
    ];
    const { ctx, collector } = makeCtx("done", events);
    ctx.maxToolCalls(3);
    ctx.maxToolCalls(2);
    const results = collector.finalize();
    expect(results[0].passed).toBe(true);
    expect(results[1].passed).toBe(false);
  });

  it("toolOrder checks subsequence", () => {
    const events: StreamEvent[] = [
      { type: "tool.started", data: { name: "search", input: {}, callId: "c1", sequence: 1, stepIndex: 0, turnId: "t1" } },
      { type: "tool.started", data: { name: "read", input: {}, callId: "c2", sequence: 2, stepIndex: 0, turnId: "t1" } },
      { type: "tool.started", data: { name: "write", input: {}, callId: "c3", sequence: 3, stepIndex: 0, turnId: "t1" } },
    ];
    const { ctx, collector } = makeCtx("done", events);
    ctx.toolOrder(["search", "write"]);
    ctx.toolOrder(["write", "search"]);
    const results = collector.finalize();
    expect(results[0].passed).toBe(true);
    expect(results[1].passed).toBe(false);
  });

  it("check records gate assertion against a value", () => {
    const { ctx, collector } = makeCtx("hello world");
    ctx.check("hello world", includes("world"));
    ctx.check("hello world", includes("mars"));
    const results = collector.finalize();
    expect(results[0].passed).toBe(true);
    expect(results[1].passed).toBe(false);
  });

  it("require throws on failure", async () => {
    const { ctx } = makeCtx("hi");
    await ctx.require("hi", includes("hi")); // should not throw
    await expect(ctx.require("hi", includes("bye"))).rejects.toThrow(EvalRequirementFailed);
  });

  it("skip throws EvalSkipped", () => {
    const { ctx } = makeCtx("hi");
    expect(() => ctx.skip("not needed")).toThrow(EvalSkipped);
  });

  it("usedNoTools passes when no tool events", () => {
    const { ctx, collector } = makeCtx("hi", []);
    ctx.usedNoTools();
    expect(collector.finalize()[0].passed).toBe(true);
  });

  it("noFailedActions detects failures", () => {
    const events: StreamEvent[] = [
      { type: "tool.completed", data: { name: "x", output: "err", callId: "c1", status: "failed", error: { code: "err", message: "fail" }, sequence: 1, stepIndex: 0, turnId: "t1" } },
    ];
    const { ctx, collector } = makeCtx("hi", events);
    ctx.noFailedActions();
    expect(collector.finalize()[0].passed).toBe(false);
  });
});

describe("expect builders", () => {
  it("includes: substring", () => {
    const r = includes("world")("hello world");
    expect(r.score).toBe(1);
    const r2 = includes("mars")("hello world");
    expect(r2.score).toBe(0);
  });

  it("includes: regex", () => {
    const r = includes(/world/)("hello world");
    expect(r.score).toBe(1);
    const r2 = includes(/^\d+$/)("abc");
    expect(r2.score).toBe(0);
  });

  it("equals: deep equality", () => {
    expect(equals({ a: 1 })({ a: 1 }).score).toBe(1);
    expect(equals({ a: 1 })({ a: 2 }).score).toBe(0);
    expect(equals([1, 2])([1, 2]).score).toBe(1);
    expect(equals([1, 2])([1, 3]).score).toBe(0);
    expect(equals("hello")("hello").score).toBe(1);
    expect(equals("hello")("world").score).toBe(0);
  });

  it("matches: zod schema", () => {
    const { z } = require("zod");
    const schema = z.object({ name: z.string() });
    expect(matches(schema)({ name: "alice" }).score).toBe(1);
    expect(matches(schema)({ name: 123 }).score).toBe(0);
  });

  it("satisfies: custom predicate", () => {
    const r = satisfies((v) => typeof v === "number", "is number")(42);
    expect(r.score).toBe(1);
    expect(r.message).toBeUndefined();
    const r2 = satisfies((v) => typeof v === "number", "is number")("str");
    expect(r2.score).toBe(0);
    expect(r2.message).toContain("is number");
  });

  it("similarity: levenshtein", () => {
    const r = similarity("hello")("hello");
    expect(r.score).toBe(1);
    const r2 = similarity("hello")("xyz");
    expect(r2.score).toBeLessThan(0.5);
  });
});
