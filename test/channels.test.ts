import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { defineChannel, POST, GET, createChannelMiddleware } from "../src/channels/index";

describe("defineChannel", () => {
  it("accepts a valid channel", () => {
    const ch = defineChannel({
      name: "test",
      type: "http",
      handler: async () => ({ status: 200, body: { ok: true } }),
    });
    expect(ch.name).toBe("test");
    expect(ch.type).toBe("http");
  });

  it("throws if name is missing", () => {
    expect(() => defineChannel({ name: "", type: "http", handler: async () => ({ status: 200, body: {} }) })).toThrow();
  });

  it("throws if handler is missing", () => {
    expect(() => defineChannel({ name: "x", type: "http", handler: null as any })).toThrow();
  });

  it("POST wraps handler", () => {
    const handler = POST(async () => ({ status: 200, body: { ok: true } }));
    expect(typeof handler).toBe("function");
  });

  it("GET wraps handler", () => {
    const handler = GET(async () => ({ status: 200, body: { ok: true } }));
    expect(typeof handler).toBe("function");
  });
});

describe("scaffold slack channel", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "arcie-test-slack-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates slack.ts in channels dir", async () => {
    const { scaffoldSlackChannel } = await import("../src/cli/scaffold-slack");
    const result = scaffoldSlackChannel(tmpDir);
    expect(result.alreadyExisted).toBe(false);
    expect(result.targetPath).toBe(join(tmpDir, "channels", "slack.ts"));
    expect(existsSync(result.targetPath)).toBe(true);

    const content = readFileSync(result.targetPath, "utf-8");
    expect(content).toContain("defineChannel");
    expect(content).toContain("slack");
    expect(content).toContain("url_verification");
    expect(content).toContain("event_callback");
  });

  it("reports alreadyExisted", async () => {
    const { scaffoldSlackChannel } = await import("../src/cli/scaffold-slack");
    scaffoldSlackChannel(tmpDir);
    const result = scaffoldSlackChannel(tmpDir);
    expect(result.alreadyExisted).toBe(true);
  });
});

describe("scaffold discord channel", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "arcie-test-discord-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates discord.ts in channels dir", async () => {
    const { scaffoldDiscordChannel } = await import("../src/cli/scaffold-discord");
    const result = scaffoldDiscordChannel(tmpDir);
    expect(result.alreadyExisted).toBe(false);
    expect(result.targetPath).toBe(join(tmpDir, "channels", "discord.ts"));
    expect(existsSync(result.targetPath)).toBe(true);

    const content = readFileSync(result.targetPath, "utf-8");
    expect(content).toContain("defineChannel");
    expect(content).toContain("discord");
    expect(content).toContain("type === 1");
    expect(content).toContain("type === 2");
  });

  it("reports alreadyExisted", async () => {
    const { scaffoldDiscordChannel } = await import("../src/cli/scaffold-discord");
    scaffoldDiscordChannel(tmpDir);
    const result = scaffoldDiscordChannel(tmpDir);
    expect(result.alreadyExisted).toBe(true);
  });
});

describe("createChannelMiddleware", () => {
  const { EventEmitter } = require("node:events");

  function mockReq(method: string, url: string, body: unknown = {}): import("node:http").IncomingMessage {
    const ee = new EventEmitter();
    const bodyStr = JSON.stringify(body);
    const req = Object.assign(ee, {
      method,
      url,
      headers: { "content-type": "application/json", host: "localhost" },
    }) as unknown as import("node:http").IncomingMessage;
    process.nextTick(() => {
      req.emit("data", Buffer.from(bodyStr));
      req.emit("end");
    });
    return req;
  }

  function mockRes(): import("node:http").ServerResponse {
    return {
      writeHead: () => undefined as unknown as import("node:http").ServerResponse,
      end: () => {},
      emit: () => false,
      on: () => undefined as unknown as import("node:http").ServerResponse,
    } as unknown as import("node:http").ServerResponse;
  }

  it("routes HTTP channel by name", async () => {
    let handled = false;
    const channels = {
      webhook: defineChannel({
        name: "webhook",
        type: "http",
        handler: async () => {
          handled = true;
          return { status: 200, body: { ok: true } };
        },
      }),
    };

    const middleware = createChannelMiddleware(channels);
    const req = mockReq("GET", "/api/channels/webhook/");
    const res = mockRes();
    const result = await middleware(req, res);
    expect(result).toBe(true);
    expect(handled).toBe(true);
  });

  it("returns false for unmatched routes", async () => {
    const middleware = createChannelMiddleware({});
    const req = mockReq("GET", "/not-a-channel");
    const res = mockRes();
    const result = await middleware(req, res);
    expect(result).toBe(false);
  });

  it("routes slack channel to /api/channels/slack/events", async () => {
    let handled = false;
    const channels = {
      slack: defineChannel({
        name: "slack",
        type: "slack",
        handler: async () => {
          handled = true;
          return { status: 200, body: { ok: true } };
        },
      }),
    };

    const middleware = createChannelMiddleware(channels);
    const req = mockReq("POST", "/api/channels/slack/events");
    const res = mockRes();
    const result = await middleware(req, res);
    expect(result).toBe(true);
    expect(handled).toBe(true);
  });

  it("routes discord channel to /api/channels/discord/interactions", async () => {
    let handled = false;
    const channels = {
      discord: defineChannel({
        name: "discord",
        type: "discord",
        handler: async () => {
          handled = true;
          return { status: 200, body: { type: 1 } };
        },
      }),
    };

    const middleware = createChannelMiddleware(channels);
    const req = mockReq("POST", "/api/channels/discord/interactions");
    const res = mockRes();
    const result = await middleware(req, res);
    expect(result).toBe(true);
    expect(handled).toBe(true);
  });

  it("passes body and headers to handler", async () => {
    let capturedBody: unknown;
    let capturedHeaders: Record<string, string> | undefined;
    const channels = {
      test: defineChannel({
        name: "test",
        type: "http",
        handler: async (req) => {
          capturedBody = req.body;
          capturedHeaders = req.headers;
          return { status: 200, body: { ok: true } };
        },
      }),
    };

    const middleware = createChannelMiddleware(channels);
    const req = mockReq("POST", "/api/channels/test/", { hello: "world" });
    const res = mockRes();
    await middleware(req, res);
    expect(capturedBody).toEqual({ hello: "world" });
    expect(capturedHeaders).toBeDefined();
  });
});
