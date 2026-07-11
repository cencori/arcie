import { describe, it, expect } from "vitest";
import { z } from "zod";
import { defineAgent } from "../src/agent/index";
import { defineTool } from "../src/tools/index";
import { defineInstructions } from "../src/instructions/index";
import { defineSkill } from "../src/skills/index";
import { defineHook } from "../src/hooks/index";
import { defineChannel } from "../src/channels/index";
import { defineSchedule } from "../src/schedules/index";

describe("defineAgent", () => {
  it("returns the config when a model is present", () => {
    const cfg = defineAgent({ model: "claude-sonnet-4-5", name: "x" });
    expect(cfg).toEqual({ model: "claude-sonnet-4-5", name: "x" });
  });
  it("throws when model is missing", () => {
    expect(() => defineAgent({} as any)).toThrow(/must specify a model/);
  });
});

describe("defineTool", () => {
  it("returns the config and keeps a runnable execute()", async () => {
    const tool = defineTool({
      description: "Add",
      inputSchema: z.object({ a: z.number(), b: z.number() }),
      execute: ({ a, b }) => a + b,
    });
    expect(tool.description).toBe("Add");
    expect(await tool.execute({ a: 2, b: 3 })).toBe(5);
  });
  it("throws without a description", () => {
    expect(() => defineTool({ execute: () => 1 } as any)).toThrow(/must have a description/);
  });
  it("throws without an execute function", () => {
    expect(() => defineTool({ description: "x" } as any)).toThrow(/must have an execute/);
  });
  it("accepts needsApproval strategies", () => {
    const always = defineTool({ description: "A", needsApproval: "always", execute: () => 1 });
    expect(always.needsApproval).toBe("always");
    const never = defineTool({ description: "B", needsApproval: "never", execute: () => 2 });
    expect(never.needsApproval).toBe("never");
    const once = defineTool({ description: "C", needsApproval: "once", execute: () => 3 });
    expect(once.needsApproval).toBe("once");
  });
});

describe("toModelOutput", () => {
  it("strips internal fields and produces a clean model definition", async () => {
    const { toModelOutput } = await import("../src/tools/index");
    const tool = defineTool({
      description: "Add numbers",
      inputSchema: z.object({ a: z.number(), b: z.number() }),
      needsApproval: "always",
      execute: () => 0,
    });
    const out = toModelOutput("add", tool);
    expect(out.type).toBe("function");
    expect(out.function.name).toBe("add");
    expect(out.function.description).toBe("Add numbers");
    expect(out.function.parameters).toBeDefined();
    expect((out as any).execute).toBeUndefined();
    expect((out as any).needsApproval).toBeUndefined();
  });
});

describe("defineInstructions", () => {
  it("passes through an object source", () => {
    expect(defineInstructions({ content: "hello" })).toEqual({ content: "hello" });
  });
  it("loads a file when given a path", () => {
    const ins = defineInstructions("README.md");
    expect(ins.content.length).toBeGreaterThan(0);
    expect(ins.filePath?.endsWith("README.md")).toBe(true);
  });
  it("throws on a missing file path", () => {
    expect(() => defineInstructions("does-not-exist-xyz.md")).toThrow(/not found/);
  });
});

describe("the remaining validators reject incomplete configs", () => {
  it("defineSkill requires name + content", () => {
    expect(() => defineSkill({ name: "s" } as any)).toThrow(/name and content/);
    expect(defineSkill({ name: "s", description: "", content: "c" }).content).toBe("c");
  });
  it("defineHook requires name + event + handler", () => {
    expect(() => defineHook({ name: "h", event: "beforeTurn" } as any)).toThrow(/name, event, and handler/);
    const h = defineHook({ name: "h", event: "beforeTurn", handler: () => {} });
    expect(h.event).toBe("beforeTurn");
  });
  it("defineChannel requires name + handler", () => {
    expect(() => defineChannel({ name: "c" } as any)).toThrow(/name and handler/);
  });
  it("defineSchedule requires name + cron + handler", () => {
    expect(() => defineSchedule({ name: "s", cron: "* * * * *" } as any)).toThrow(/name, cron, and handler/);
    const s = defineSchedule({ name: "s", cron: "* * * * *", handler: () => {} });
    expect(s.cron).toBe("* * * * *");
  });
});
