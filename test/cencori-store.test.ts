import { describe, it, expect } from "vitest";
import { CencoriMemoryStore, type CencoriMemoryClient } from "../src/memory/index";

describe("CencoriMemoryStore", () => {
  const storeCalls: unknown[] = [];
  const deleteCalls: unknown[] = [];

  const mockClient: CencoriMemoryClient = {
    store: async (opts) => { storeCalls.push(opts); },
    search: async (opts) => ({ results: [] }),
    delete: async (opts) => { deleteCalls.push(opts); },
  };

  const store = new CencoriMemoryStore(mockClient);

  it("save delegates to client.store with metadata", async () => {
    storeCalls.length = 0;
    await store.save("res-1", "thread-1", [
      { role: "user", content: "hello", timestamp: 100 },
    ]);
    expect(storeCalls).toHaveLength(1);
    const call = storeCalls[0] as any;
    expect(call.namespace).toBe("res-1");
    expect(call.content).toBe("hello");
    expect(call.metadata.threadId).toBe("thread-1");
    expect(call.metadata.role).toBe("user");
  });

  it("clear calls client.delete when available", async () => {
    deleteCalls.length = 0;
    await store.clear("res-1", "thread-1");
    expect(deleteCalls).toHaveLength(1);
    const call = deleteCalls[0] as any;
    expect(call.namespace).toBe("res-1");
    expect(call.filter).toEqual({ threadId: "thread-1" });
  });

  it("clear is a no-op when client has no delete method", async () => {
    const noop: CencoriMemoryClient = {
      store: async () => {},
      search: async () => ({ results: [] }),
    };
    const s = new CencoriMemoryStore(noop);
    await expect(s.clear("x", "y")).resolves.toBeUndefined();
  });

  it("load maps similarity to score", async () => {
    const client: CencoriMemoryClient = {
      store: async () => {},
      search: async () => ({
        results: [
          { content: "test", metadata: { role: "user", timestamp: 1 }, similarity: 0.95 },
        ],
      }),
    };
    const s = new CencoriMemoryStore(client);
    const entries = await s.load("r", "t");
    expect(entries[0].content).toBe("test");
    expect(entries[0].score).toBe(0.95);
  });
});
