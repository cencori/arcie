import { describe, it, expect, afterAll } from "vitest";
import { defineSkill, getSkill } from "../src/skills/index";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

describe("defineSkill", () => {
  it("returns a valid skill config", () => {
    const s = defineSkill({ name: "python", description: "Python knowledge", content: "# Python" });
    expect(s.name).toBe("python");
  });

  it("throws when name or content is missing", () => {
    expect(() => defineSkill({ name: "", description: "", content: "" })).toThrow(/name|content/);
  });
});

describe("getSkill", () => {
  const dir = mkdtempSync(join(tmpdir(), "arcie-skills-test-"));

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("reads a .md knowledge file", () => {
    mkdirSync(join(dir, "knowledge"), { recursive: true });
    writeFileSync(join(dir, "knowledge", "python.md"), "# Python content", "utf-8");
    const skill = getSkill(dir, "python");
    expect(skill).not.toBeNull();
    expect(skill!.content).toContain("Python");
  });

  it("returns null for missing skill", () => {
    expect(getSkill(dir, "nonexistent")).toBeNull();
  });
});
