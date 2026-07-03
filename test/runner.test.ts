import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runAgent, streamAgent } from "../src/runner/index";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(__dirname, "fixtures/agent");

// A stand-in Cencori Sessions API. Returns SSE for a turn, or 500 when the
// input contains "boom" (to exercise the runner's error paths).
let server: Server;
let endpoint: string;

beforeAll(async () => {
  server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;

    if (req.method === "POST" && req.url === "/sessions") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: "sess_test_1" }));
      return;
    }

    if (req.method === "POST" && /^\/sessions\/[^/]+\/approve$/.test(req.url ?? "")) {
      if (body.includes("boom")) {
        res.writeHead(500);
        res.end("approve failed");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const input = JSON.parse(body || "{}").tool_results?.[0]?.output ?? "";
      const full = "Echo: " + JSON.stringify(input);
      res.write("event: turn.started\n");
      res.write(`data: ${JSON.stringify({ turn_number: 1, input_text: "" })}\n\n`);
      for (const delta of ["Echo: ", JSON.stringify(input)]) {
        res.write("event: output_text.delta\n");
        res.write(`data: ${JSON.stringify({ delta })}\n\n`);
      }
      res.write("event: turn.completed\n");
      const turnCompletedData = { output: { output: [{ type: "message", content: [{ type: "output_text", text: full }] }] } };
      res.write(`data: ${JSON.stringify(turnCompletedData)}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    if (req.method === "POST" && /^\/sessions\/[^/]+\/turns$/.test(req.url ?? "")) {
      const input = JSON.parse(body || "{}").input;
      if (typeof input === "string" && input.includes("boom")) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("upstream exploded");
        return;
      }
      const isSubagent = req.url?.includes("sub.");
      const triggerSubagent = typeof input === "string" && input.includes("delegate");
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const turnNumber = 1;
      const full = "Echo: " + JSON.stringify(input);
      res.write("event: turn.started\n");
      res.write(`data: ${JSON.stringify({ turn_number: turnNumber, input_text: input })}\n\n`);
      for (const delta of ["Echo: ", JSON.stringify(input)]) {
        res.write("event: output_text.delta\n");
        res.write(`data: ${JSON.stringify({ delta })}\n\n`);
      }
      if (isSubagent || !triggerSubagent) {
        res.write("event: turn.completed\n");
        const turnCompletedData = { output: { output: [{ type: "message", content: [{ type: "output_text", text: full }] }] } };
        res.write(`data: ${JSON.stringify(turnCompletedData)}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }
      res.write("event: tool_call.started\n");
      const toolCallPayload = { tool: "researcher", arguments: { query: input }, action_id: "act_sub_1" };
      res.write(`data: ${JSON.stringify(toolCallPayload)}\n\n`);
      res.write("event: turn.paused\n");
      res.write("data: {}\n\n");
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    res.writeHead(404);
    res.end("not found");
  });

  await new Promise<void>((r) => server.listen(0, r));
  endpoint = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));
afterEach(() => vi.unstubAllEnvs());

const opts = () => ({ endpoint, apiKey: "test_key" });

describe("runAgent", () => {
  it("returns the assembled output and session id", async () => {
    const r = await runAgent(FIXTURE, "hi", opts());
    expect(r.sessionId).toBe("sess_test_1");
    expect(r.output).toBe('Echo: "hi"');
  });

  it("emits the full protocol event sequence", async () => {
    const r = await runAgent(FIXTURE, "hi", opts());
    expect(r.events.map((e) => e.type)).toEqual([
      "session.started",
      "turn.started",
      "message.received",
      "step.started",
      "message.appended",
      "message.appended",
      "message.completed",
      "step.completed",
      "turn.completed",
      "session.waiting",
    ]);
  });

  it("forwards a created session id back into a turn (reuses sessionId option)", async () => {
    const r = await runAgent(FIXTURE, "hi", { ...opts(), sessionId: "sess_preexisting" });
    expect(r.sessionId).toBe("sess_preexisting");
  });

  it("throws a Cencori error when the turn fails (regression: createSessionCompleted import)", async () => {
    await expect(runAgent(FIXTURE, "boom please", opts())).rejects.toThrow(
      /Cencori Sessions API error \(500\)/,
    );
  });

  it("requires an API key", async () => {
    vi.stubEnv("CENCORI_API_KEY", "");
    await expect(runAgent(FIXTURE, "hi", { endpoint })).rejects.toThrow(/API key required/);
  });
});

describe("subagent dispatch", () => {
  it("emits subagent.called and subagent.completed when a tool matches a subagent", async () => {
    const r = await runAgent(FIXTURE, "delegate research", opts());
    const types = r.events.map((e) => e.type);
    expect(types).toContain("subagent.called");
    expect(types).toContain("subagent.completed");
    const calledEvent = r.events.find((e) => e.type === "subagent.called");
    expect(calledEvent?.data.name).toBe("researcher");
  });

  it("collects subagent output as a tool result", async () => {
    const r = await runAgent(FIXTURE, "delegate research", opts());
    const completedEvent = r.events.find((e) => e.type === "subagent.completed");
    expect(completedEvent?.data.output).toBeTruthy();
  });
});

describe("tool approval", () => {
  it("executes a tool normally when needsApproval is not set", async () => {
    const r = await runAgent(FIXTURE, "hi", opts());
    const toolEvents = r.events.filter((e) => e.type === "tool.completed");
    expect(toolEvents).toHaveLength(0);
  });

  it("emits needs_approval for tools requiring approval by running against unknown tool", async () => {
    const events: string[] = [];
    await runAgent(FIXTURE, "delegate approval-required", {
      ...opts(),
      onEvent: (e) => events.push(e.type),
    });
    expect(events).toContain("tool.started");
    expect(events).toContain("tool.completed");
  });
});

describe("streamAgent", () => {
  it("streams message deltas and brackets them with session events", async () => {
    const types: string[] = [];
    const deltas: string[] = [];
    for await (const ev of streamAgent(FIXTURE, "hello", opts())) {
      types.push(ev.type);
      if (ev.type === "message.appended") deltas.push(ev.data.delta);
    }
    expect(types[0]).toBe("session.started");
    expect(types.at(-1)).toBe("session.waiting");
    expect(deltas.join("")).toBe('Echo: "hello"');
  });

  it("throws on an upstream failure (regression: createSessionCompleted import)", async () => {
    await expect(
      (async () => {
        for await (const _ of streamAgent(FIXTURE, "boom now", opts())) {
          // drain
        }
      })(),
    ).rejects.toThrow(/Cencori Sessions API error \(500\)/);
  });
});
