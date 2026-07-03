import type { MemoryEntry, MemoryStore } from "./types";

export interface CencoriMemoryClient {
  store(options: {
    namespace: string;
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<unknown>;
  search(options: {
    namespace: string;
    query: string;
    limit?: number;
    threshold?: number;
    filter?: Record<string, unknown>;
  }): Promise<{ results: Array<{ content: string; metadata: Record<string, unknown>; similarity?: number }> }>;
  delete?(options: {
    namespace: string;
    ids?: string[];
    filter?: Record<string, unknown>;
  }): Promise<unknown>;
}

export class CencoriMemoryStore implements MemoryStore {
  private client: CencoriMemoryClient;

  constructor(client: CencoriMemoryClient) {
    this.client = client;
  }

  async save(resourceId: string, threadId: string, entries: MemoryEntry[]): Promise<void> {
    for (const entry of entries) {
      await this.client.store({
        namespace: resourceId,
        content: entry.content,
        metadata: {
          threadId,
          role: entry.role,
          timestamp: entry.timestamp,
          turnId: entry.turnId,
        },
      });
    }
  }

  async load(resourceId: string, threadId: string, limit?: number): Promise<MemoryEntry[]> {
    const result = await this.client.search({
      namespace: resourceId,
      query: "*",
      limit: limit ?? 100,
      threshold: 0,
      filter: { threadId },
    });

    return result.results.map((r) => ({
      role: (r.metadata.role ?? "user") as MemoryEntry["role"],
      content: r.content,
      timestamp: (r.metadata.timestamp as number) ?? Date.now(),
      turnId: r.metadata.turnId as string | undefined,
      score: r.similarity,
    }));
  }

  async clear(resourceId: string, threadId: string): Promise<void> {
    if (this.client.delete) {
      await this.client.delete({
        namespace: resourceId,
        filter: { threadId },
      });
    }
  }

  async search(resourceId: string, threadId: string, query: string, limit?: number): Promise<MemoryEntry[]> {
    const result = await this.client.search({
      namespace: resourceId,
      query,
      limit: limit ?? 5,
      threshold: 0.5,
      filter: { threadId },
    });

    return result.results.map((r) => ({
      role: (r.metadata.role ?? "user") as MemoryEntry["role"],
      content: r.content,
      timestamp: (r.metadata.timestamp as number) ?? Date.now(),
      turnId: r.metadata.turnId as string | undefined,
      score: r.similarity,
    }));
  }

  async close(): Promise<void> {
    // no-op for SDK-backed store
  }
}
