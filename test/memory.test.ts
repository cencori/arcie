import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { Memory, InMemoryStore, SqliteStore, FileStore, LastNStrategy, KeyFactsStrategy, SummaryStrategy, SemanticRecall, WorkingMemory, type MemoryStore } from "../src/memory/index";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const R = "test-resource";
const T = "test-thread";

describe("InMemoryStore", () => {
  const store = new InMemoryStore();

  afterEach(async () => await store.clear(R, T));

  it("stores and retrieves entries", async () => {
    await store.save(R, T, [{ role: "user", content: "hi", timestamp: 1 }]);
    const entries = await store.load(R, T);
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toBe("hi");
  });

  it("scopes by resource+thread", async () => {
    await store.save("r1", "t1", [{ role: "user", content: "a", timestamp: 1 }]);
    await store.save("r1", "t2", [{ role: "user", content: "b", timestamp: 1 }]);
    expect(await store.load("r1", "t1")).toHaveLength(1);
    expect(await store.load("r1", "t2")).toHaveLength(1);
  });

  it("respects load limit", async () => {
    await store.save(R, T, [{ role: "user", content: "a", timestamp: 1 }, { role: "user", content: "b", timestamp: 2 }]);
    const entries = await store.load(R, T, 1);
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toBe("b");
  });

  it("clear removes all entries", async () => {
    await store.save(R, T, [{ role: "user", content: "hi", timestamp: 1 }]);
    await store.clear(R, T);
    expect(await store.load(R, T)).toHaveLength(0);
  });
});

describe("FileStore", () => {
  const dir = mkdtempSync(join(tmpdir(), "arcie-memory-test-"));
  const store = new FileStore(dir);

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  afterEach(async () => {
    await store.clear(R, T);
  });

  it("persists entries to disk", async () => {
    await store.save(R, T, [{ role: "user", content: "hello", timestamp: 1 }]);
    const entries = await store.load(R, T);
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toBe("hello");
  });

  it("survives between store instances", async () => {
    await store.save(R, T, [{ role: "user", content: "disk-test", timestamp: 1 }]);
    const store2 = new FileStore(dir);
    const entries = await store2.load(R, T);
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toBe("disk-test");
  });

  it("scopes by resource+thread", async () => {
    await store.save("ra", "ta", [{ role: "user", content: "x", timestamp: 1 }]);
    await store.save("rb", "tb", [{ role: "user", content: "y", timestamp: 1 }]);
    expect(await store.load("ra", "ta")).toHaveLength(1);
    expect(await store.load("rb", "tb")).toHaveLength(1);
  });
});

describe("SqliteStore", () => {
  const dbPath = join(tmpdir(), "arcie-memory-sqlite-test.db");
  let store: SqliteStore;

  beforeEach(() => {
    store = new SqliteStore(dbPath);
  });

  afterEach(async () => {
    await store.clear(R, T);
    await store.clear("ra", "ta");
    await store.clear("rb", "tb");
    await store.close();
  });

  afterAll(() => {
    try { rmSync(dbPath); } catch {}
    try { rmSync(dbPath + "-wal"); } catch {}
    try { rmSync(dbPath + "-shm"); } catch {}
  });

  it("stores and retrieves entries", async () => {
    await store.save(R, T, [{ role: "user", content: "hello", timestamp: 1 }]);
    const entries = await store.load(R, T);
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toBe("hello");
  });

  it("scopes by resource+thread", async () => {
    await store.save("ra", "ta", [{ role: "user", content: "x", timestamp: 1 }]);
    await store.save("rb", "tb", [{ role: "user", content: "y", timestamp: 1 }]);
    expect(await store.load("ra", "ta")).toHaveLength(1);
    expect(await store.load("rb", "tb")).toHaveLength(1);
  });

  it("preserves entry order", async () => {
    await store.save(R, T, [{ role: "user", content: "first", timestamp: 1 }]);
    await store.save(R, T, [{ role: "assistant", content: "second", timestamp: 2 }]);
    const entries = await store.load(R, T);
    expect(entries).toHaveLength(2);
    expect(entries[0].content).toBe("first");
    expect(entries[1].content).toBe("second");
  });

  it("respects load limit", async () => {
    await store.save(R, T, [
      { role: "user", content: "a", timestamp: 1 },
      { role: "user", content: "b", timestamp: 2 },
    ]);
    const entries = await store.load(R, T, 1);
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toBe("b");
  });

  it("search finds matching content", async () => {
    await store.save(R, T, [
      { role: "user", content: "I like pizza", timestamp: 1 },
      { role: "user", content: "The weather is nice", timestamp: 2 },
    ]);
    const results = await store.search(R, T, "pizza");
    expect(results).toHaveLength(1);
    expect(results[0].content).toContain("pizza");
  });

  it("clear removes all entries for a scope", async () => {
    await store.save(R, T, [{ role: "user", content: "temp", timestamp: 1 }]);
    await store.clear(R, T);
    expect(await store.load(R, T)).toHaveLength(0);
  });
});

describe("LastNStrategy", () => {
  const store = new InMemoryStore();

  afterEach(async () => await store.clear(R, T));

  it("produces formatted context from stored entries", async () => {
    const strategy = new LastNStrategy(3);
    await strategy.recordTurn(store, R, T, "hello", "hi there");
    const ctx = await strategy.getInputContext(store, R, T);
    expect(ctx).toContain("Recent conversation history");
    expect(ctx).toContain("User: hello");
    expect(ctx).toContain("Assistant: hi there");
  });

  it("respects the limit", async () => {
    const strategy = new LastNStrategy(1);
    await strategy.recordTurn(store, R, T, "a", "A");
    await strategy.recordTurn(store, R, T, "b", "B");
    const ctx = await strategy.getInputContext(store, R, T);
    expect(ctx).toContain("User: b");
    expect(ctx).not.toContain("User: a");
  });

  it("returns empty string when no entries", async () => {
    const strategy = new LastNStrategy(10);
    expect(await strategy.getInputContext(store, R, T)).toBe("");
  });
});

describe("KeyFactsStrategy", () => {
  const store = new InMemoryStore();

  afterEach(async () => await store.clear(R, T));

  it("extracts user facts from input and output", async () => {
    const strategy = new KeyFactsStrategy();
    await strategy.recordTurn(store, R, T, "My name is Alice and I live in New York", "Nice to meet you Alice!");
    const ctx = await strategy.getInputContext(store, R, T);
    expect(ctx).toContain("Known facts about the user");
    expect(ctx).toContain("Alice");
    expect(ctx).toContain("New York");
  });

  it("returns empty string when no facts extracted", async () => {
    const strategy = new KeyFactsStrategy();
    await strategy.recordTurn(store, R, T, "What is the weather?", "It is sunny.");
    const ctx = await strategy.getInputContext(store, R, T);
    expect(ctx).toBe("");
  });

  it("persists facts across strategy instances", async () => {
    const s1 = new KeyFactsStrategy();
    await s1.recordTurn(store, R, T, "I am Bob and I work at Acme", "Welcome Bob!");
    const s2 = new KeyFactsStrategy();
    const ctx = await s2.getInputContext(store, R, T);
    expect(ctx).toContain("Bob");
    expect(ctx).toContain("Acme");
  });
});

describe("SummaryStrategy", () => {
  const store = new InMemoryStore();

  afterEach(async () => await store.clear(R, T));

  it("produces formatted conversation from stored entries", async () => {
    const strategy = new SummaryStrategy(10);
    await strategy.recordTurn(store, R, T, "hello", "hi there");
    const ctx = await strategy.getInputContext(store, R, T);
    expect(ctx).toContain("Conversation history");
    expect(ctx).toContain("User: hello");
    expect(ctx).toContain("Assistant: hi there");
  });

  it("triggers summarization when entries exceed limit*2", async () => {
    let summarized = false;
    const summarize = async (_text: string) => { summarized = true; return "summary text"; };
    const strategy = new SummaryStrategy(2, summarize);
    for (let i = 0; i < 6; i++) {
      await strategy.recordTurn(store, R, T, `input ${i}`, `output ${i}`);
    }
    expect(summarized).toBe(true);
    const ctx = await strategy.getInputContext(store, R, T);
    expect(ctx).toContain("summary text");
  });

  it("shows recent entries after summarization", async () => {
    const summarize = async (_text: string) => "summary here";
    const strategy = new SummaryStrategy(2, summarize);
    for (let i = 0; i < 6; i++) {
      await strategy.recordTurn(store, R, T, `input ${i}`, `output ${i}`);
    }
    const ctx = await strategy.getInputContext(store, R, T);
    expect(ctx).toContain("summary here");
    expect(ctx).toContain("input 5");
    expect(ctx).toContain("output 5");
    // Old entries beyond limit should be summarized
    expect(ctx).not.toContain("input 0");
    expect(ctx).not.toContain("output 0");
  });

  it("returns empty string when nothing recorded", async () => {
    const strategy = new SummaryStrategy(10);
    expect(await strategy.getInputContext(store, R, T)).toBe("");
  });
});

describe("SemanticRecall", () => {
  const store = new InMemoryStore();

  it("returns empty string when store has no search method", async () => {
    const strategy = new SemanticRecall(5);
    const ctx = await strategy.getInputContext(store, R, T);
    expect(ctx).toBe("");
  });

  it("sorts entries by score descending and formats relevance", async () => {
    const mockSearch = async () => [
      { role: "assistant" as const, content: "User likes hiking", timestamp: 2, score: 0.65 },
      { role: "user" as const, content: "I love coding", timestamp: 1, score: 0.92 },
      { role: "assistant" as const, content: "Old memory", timestamp: 0, score: 0.1 },
    ];
    const customStore: MemoryStore = {
      save: async () => {},
      load: async () => [],
      clear: async () => {},
      search: mockSearch as MemoryStore["search"],
    };

    const strategy = new SemanticRecall(10);
    const ctx = await strategy.getInputContext(customStore, R, T);
    expect(ctx).toContain("Relevant memories");
    const lines = ctx.split("\n").filter((l) => l.startsWith("User") || l.startsWith("Assistant"));

    // Most relevant first
    expect(lines[0]).toContain("I love coding");
    expect(lines[0]).toContain("92%");
    expect(lines[1]).toContain("likes hiking");
    expect(lines[1]).toContain("65%");
    expect(lines[2]).toContain("Old memory");
    expect(lines[2]).toContain("10%");
  });
});

describe("WorkingMemory", () => {
  it("injects system instruction", () => {
    const wm = new WorkingMemory();
    const instruction = wm.getSystemInstruction();
    expect(instruction).toContain("updateWorkingMemory");
  });

  it("updates a section and reflects it in context", async () => {
    const wm = new WorkingMemory(undefined, "/tmp/arcie-wm-test");
    const store = new InMemoryStore();
    wm.updateSection("default", "Interests", "- **Interests**:\n- Coding\n- Hiking");
    const ctx = await wm.getInputContext(store, "default", "thread-1");
    expect(ctx).toContain("Coding");
    expect(ctx).toContain("Hiking");
  });

  it("provides tool definitions with executable updateWorkingMemory", async () => {
    const wm = new WorkingMemory(undefined, "/tmp/arcie-wm-test2");
    const tools = wm.getToolDefinitions();
    expect(tools.updateWorkingMemory).toBeDefined();
    expect(tools.updateWorkingMemory.description).toContain("Update");
    const result = await tools.updateWorkingMemory.execute({ section: "Name", content: "- **Name**: Alice" });
    expect(result.updated).toBe(true);
  });

  it("creates new sections when they don't exist", async () => {
    const wm = new WorkingMemory(undefined, "/tmp/arcie-wm-test3");
    wm.updateSection("default", "Pets", "- Dogs\n- Cats");
    const store = new InMemoryStore();
    const ctx = await wm.getInputContext(store, "default", "thread-1");
    expect(ctx).toContain("Pets");
  });
});

describe("Memory", () => {
  it("defaults to lastN when no config", async () => {
    const memory = new Memory(undefined, { resourceId: R, threadId: T });
    expect(await memory.getInputContext()).toBe("");
    await memory.recordTurn("hi", "hello");
    const ctx = await memory.getInputContext();
    expect(ctx).toContain("User: hi");
    expect(ctx).toContain("Assistant: hello");
  });

  it("uses lastN strategy from config", async () => {
    const memory = new Memory({ strategy: "lastN", limit: 2 }, { resourceId: R, threadId: T });
    await memory.recordTurn("a", "A");
    await memory.recordTurn("b", "B");
    await memory.recordTurn("c", "C");
    const ctx = await memory.getInputContext();
    expect(ctx).toContain("User: b");
    expect(ctx).toContain("User: c");
    expect(ctx).not.toContain("User: a");
  });

  it("uses keyFacts strategy from config", async () => {
    const memory = new Memory({ strategy: "keyFacts" }, { resourceId: R, threadId: T });
    await memory.recordTurn("I am Bob and I like pizza", "Great!");
    const ctx = await memory.getInputContext();
    expect(ctx).toContain("Bob");
    expect(ctx).toContain("pizza");
  });

  it("accepts a custom store", async () => {
    const customStore = new InMemoryStore();
    const memory = new Memory({ strategy: "lastN", limit: 10 }, { store: customStore, resourceId: R, threadId: T });
    await memory.recordTurn("custom", "store");
    const entries = await customStore.load(R, T);
    expect(entries).toHaveLength(2);
  });

  it("clear resets memory", async () => {
    const memory = new Memory({ strategy: "lastN" }, { resourceId: R, threadId: T });
    await memory.recordTurn("hi", "hello");
    await memory.clear();
    expect(await memory.getInputContext()).toBe("");
  });

  it("scopes memory by resource and thread", async () => {
    const m1 = new Memory({ strategy: "lastN" }, { resourceId: "user-a", threadId: "convo-1" });
    const m2 = new Memory({ strategy: "lastN" }, { resourceId: "user-b", threadId: "convo-1" });
    await m1.recordTurn("hello from A", "hi A");
    await m2.recordTurn("hello from B", "hi B");
    const ctx1 = await m1.getInputContext();
    const ctx2 = await m2.getInputContext();
    expect(ctx1).toContain("hello from A");
    expect(ctx1).not.toContain("hello from B");
    expect(ctx2).toContain("hello from B");
  });
});
