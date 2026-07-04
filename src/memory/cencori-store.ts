import type { MemoryEntry, MemoryStore, Thread, DeleteMessagesOptions } from "./types";

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
    // no-op
  }

  async createThread(_thread: Thread): Promise<void> {
    throw new Error("Thread management not supported by CencoriMemoryStore");
  }

  async getThread(_threadId: string, _resourceId: string): Promise<Thread | null> {
    throw new Error("Thread management not supported by CencoriMemoryStore");
  }

  async listThreads(_resourceId: string): Promise<Thread[]> {
    throw new Error("Thread management not supported by CencoriMemoryStore");
  }

  async updateThread(_thread: Partial<Thread> & { id: string; resourceId: string }): Promise<void> {
    throw new Error("Thread management not supported by CencoriMemoryStore");
  }

  async deleteThread(_threadId: string, _resourceId: string): Promise<void> {
    throw new Error("Thread management not supported by CencoriMemoryStore");
  }

  async deleteMessages(opts: DeleteMessagesOptions): Promise<number> {
    if (!this.client.delete) throw new Error("CencoriMemoryClient does not support delete");

    const filter: Record<string, unknown> = { threadId: opts.threadId };
    if (opts.messageIds && opts.messageIds.length > 0) {
      filter.turnId = { $in: opts.messageIds };
    }
    if (opts.beforeTimestamp !== undefined) {
      filter.timestamp = { $gte: opts.beforeTimestamp };
    }
    if (opts.afterTimestamp !== undefined) {
      filter.timestamp = { ...(filter.timestamp as Record<string, unknown> || {}), $lte: opts.afterTimestamp };
    }

    await this.client.delete({ namespace: opts.resourceId, filter });
    return -1; // SDK doesn't return count
  }

  async cloneThread(
    source: { threadId: string; resourceId: string },
    dest: { threadId: string; resourceId: string },
  ): Promise<void> {
    const entries = await this.load(source.resourceId, source.threadId);
    for (const entry of entries) {
      await this.client.store({
        namespace: dest.resourceId,
        content: entry.content,
        metadata: {
          threadId: dest.threadId,
          role: entry.role,
          timestamp: entry.timestamp,
          turnId: entry.turnId,
        },
      });
    }
  }
}
