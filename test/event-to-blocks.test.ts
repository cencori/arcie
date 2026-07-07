import { describe, it, expect } from "vitest";
import { EventTranslator, createBlockStore } from "../src/cli/tui/renderer/event-to-blocks";
import type { StreamEvent } from "../src/protocol/events";

function feed(t: EventTranslator, store: ReturnType<typeof createBlockStore>, event: StreamEvent) {
  for (const op of t.feed(event)) store.apply(op);
}

describe("EventTranslator", () => {
  it("commits a user block for message.received", () => {
    const t = new EventTranslator();
    const store = createBlockStore();
    feed(t, store, {
      type: "message.received",
      data: { message: "hello", sequence: 0, turnId: "t1" },
    });
    const committed = store.drainCommitted();
    expect(committed.length).toBe(1);
    expect(committed[0].kind).toBe("user");
    expect(committed[0].body).toBe("hello");
  });

  it("appends deltas into a live assistant block, then commits on completion", () => {
    const t = new EventTranslator();
    const store = createBlockStore();
    feed(t, store, {
      type: "message.appended",
      data: { delta: "Hel", textSoFar: "Hel", sequence: 0, stepIndex: 0, turnId: "t1" },
    });
    expect(store.live.size).toBe(1);
    const [firstLive] = store.live.values();
    expect(firstLive.body).toBe("Hel");

    feed(t, store, {
      type: "message.appended",
      data: { delta: "lo", textSoFar: "Hello", sequence: 1, stepIndex: 0, turnId: "t1" },
    });
    const [afterSecond] = store.live.values();
    expect(afterSecond.body).toBe("Hello");

    feed(t, store, {
      type: "message.completed",
      data: {
        text: "Hello world",
        finishReason: "stop" as never,
        sequence: 2,
        stepIndex: 0,
        turnId: "t1",
      },
    });
    expect(store.live.size).toBe(0);
    const committed = store.drainCommitted();
    expect(committed.at(-1)?.body).toBe("Hello world");
    expect(committed.at(-1)?.live).toBe(false);
  });

  it("auto-collapses live reasoning when the assistant starts speaking", () => {
    const t = new EventTranslator();
    const store = createBlockStore();
    feed(t, store, {
      type: "reasoning.appended",
      data: { delta: "let me think", soFar: "let me think", sequence: 0, stepIndex: 0, turnId: "t1" },
    });
    feed(t, store, {
      type: "message.appended",
      data: { delta: "answer", textSoFar: "answer", sequence: 1, stepIndex: 0, turnId: "t1" },
    });
    const committed = store.drainCommitted();
    const reasoning = committed.find((b) => b.kind === "reasoning");
    expect(reasoning?.collapsed).toBe(true);
    expect(store.live.size).toBe(1);
  });

  it("keeps reasoning uncollapsed when the option is disabled", () => {
    const t = new EventTranslator({ autoCollapseReasoning: false });
    const store = createBlockStore();
    feed(t, store, {
      type: "reasoning.appended",
      data: { delta: "think", soFar: "think", sequence: 0, stepIndex: 0, turnId: "t1" },
    });
    feed(t, store, {
      type: "message.appended",
      data: { delta: "answer", textSoFar: "answer", sequence: 1, stepIndex: 0, turnId: "t1" },
    });
    expect(store.live.size).toBe(2);
    const kinds = [...store.live.values()].map((b) => b.kind);
    expect(kinds).toEqual(expect.arrayContaining(["reasoning", "assistant"]));
  });

  it("tracks tools by callId and moves them to committed on completion", () => {
    const t = new EventTranslator();
    const store = createBlockStore();
    feed(t, store, {
      type: "tool.started",
      data: {
        name: "get_weather",
        input: { city: "SF" },
        callId: "c1",
        sequence: 0,
        stepIndex: 0,
        turnId: "t1",
      },
    });
    expect(store.live.size).toBe(1);
    const [live] = store.live.values();
    expect(live.kind).toBe("tool");
    expect(live.title).toBe("get_weather");
    expect(live.subtitle).toContain("city");
    expect(live.status).toBe("running");

    feed(t, store, {
      type: "tool.completed",
      data: {
        name: "get_weather",
        output: { condition: "sunny" },
        callId: "c1",
        status: "completed" as never,
        sequence: 1,
        stepIndex: 0,
        turnId: "t1",
      },
    });
    expect(store.live.size).toBe(0);
    const committed = store.drainCommitted();
    const tool = committed.find((b) => b.kind === "tool");
    expect(tool?.status).toBe("done");
    expect(tool?.result).toContain("sunny");
  });

  it("nests subagent output at deeper depth", () => {
    const t = new EventTranslator();
    const store = createBlockStore();
    feed(t, store, {
      type: "subagent.called",
      data: { name: "researcher", callId: "s1", childSessionId: "cs", turnId: "t1" },
    });
    expect(t.depth).toBe(1);
    feed(t, store, {
      type: "tool.started",
      data: {
        name: "search",
        input: {},
        callId: "c2",
        sequence: 0,
        stepIndex: 0,
        turnId: "t1",
      },
    });
    const [live] = store.live.values();
    expect(live.kind).toBe("subagent-tool");
    expect(live.depth).toBe(1);

    feed(t, store, {
      type: "subagent.completed",
      data: { name: "researcher", callId: "s1", output: "found it" },
    });
    expect(t.depth).toBe(0);
    const committed = store.drainCommitted();
    const step = committed.find((b) => b.kind === "subagent-step");
    expect(step?.body).toBe("found it");
  });

  it("emits an error block on session.failed", () => {
    const t = new EventTranslator();
    const store = createBlockStore();
    feed(t, store, {
      type: "session.failed",
      data: { code: "boom", message: "provider down", sessionId: "s" },
    });
    const committed = store.drainCommitted();
    expect(committed.length).toBe(1);
    expect(committed[0].kind).toBe("error");
    expect(committed[0].title).toBe("boom");
    expect(committed[0].body).toBe("provider down");
  });

  it("keeps a pending tool call live in an approval state", () => {
    const t = new EventTranslator();
    const store = createBlockStore();
    feed(t, store, {
      type: "tool.started",
      data: {
        name: "delete_file",
        input: { path: "/tmp/x" },
        callId: "c1",
        sequence: 0,
        stepIndex: 0,
        turnId: "t1",
      },
    });
    feed(t, store, {
      type: "tool.completed",
      data: {
        name: "delete_file",
        output: null,
        callId: "c1",
        status: "pending" as never,
        error: { code: "needs_approval", message: 'Tool "delete_file" requires approval' },
        sequence: 1,
        stepIndex: 0,
        turnId: "t1",
      },
    });
    expect(store.live.size).toBe(1);
    const [live] = store.live.values();
    expect(live.status).toBe("approval");
    expect(live.result).toContain("approval");
  });

  it("reset clears live state", () => {
    const t = new EventTranslator();
    const store = createBlockStore();
    feed(t, store, {
      type: "message.appended",
      data: { delta: "streaming...", textSoFar: "streaming...", sequence: 0, stepIndex: 0, turnId: "t1" },
    });
    expect(store.live.size).toBe(1);
    for (const op of t.reset()) store.apply(op);
    expect(store.live.size).toBe(0);
  });
});
