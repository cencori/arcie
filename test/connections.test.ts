import { describe, it, expect } from "vitest";
import { defineConnection } from "../src/connections/index";

describe("defineConnection", () => {
  it("returns a valid connection config", () => {
    const conn = defineConnection({
      name: "github",
      description: "GitHub API",
      auth: { type: "oauth2", authorizeUrl: "https://github.com/login/oauth/authorize" },
    });
    expect(conn.name).toBe("github");
    expect(conn.auth.type).toBe("oauth2");
  });

  it("throws when name is missing", () => {
    expect(() =>
      defineConnection({ name: "", description: "x", auth: { type: "apiKey" } }),
    ).toThrow(/name/);
  });

  it("throws when auth type is missing", () => {
    expect(() =>
      defineConnection({ name: "x", description: "x", auth: {} as any }),
    ).toThrow(/auth/);
  });
});
