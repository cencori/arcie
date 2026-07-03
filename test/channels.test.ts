import { describe, it, expect } from "vitest";
import { defineChannel, POST, GET } from "../src/channels/index";

describe("defineChannel", () => {
  it("returns a valid channel config", () => {
    const c = defineChannel({
      name: "slack",
      type: "slack",
      handler: async () => ({ status: 200, body: "ok" }),
    });
    expect(c.name).toBe("slack");
  });

  it("throws when name or handler is missing", () => {
    expect(() =>
      defineChannel({ name: "", type: "http", handler: null as any }),
    ).toThrow(/name|handler/);
  });
});

describe("POST / GET helpers", () => {
  it("POST returns the handler unchanged", () => {
    const handler = async () => ({ status: 200, body: "ok" });
    expect(POST(handler)).toBe(handler);
  });

  it("GET returns the handler unchanged", () => {
    const handler = async () => ({ status: 200, body: "ok" });
    expect(GET(handler)).toBe(handler);
  });
});
