import type { MemoryEntry, MemoryStore, Thread, DeleteMessagesOptions } from "./types";

export class InMemoryStore implements MemoryStore {
  private entries = new Map<string, MemoryEntry[]>();
  private threads = new Map<string, Thread>();

  private key(resourceId: string, threadId: string): string {
    return `${resourceId}:${threadId}`;
  }

  async save(resourceId: string, threadId: string, entries: MemoryEntry[]): Promise<void> {
    const k = this.key(resourceId, threadId);
    const existing = this.entries.get(k) ?? [];
    existing.push(...entries);
    this.entries.set(k, existing);
  }

  async load(resourceId: string, threadId: string, limit?: number): Promise<MemoryEntry[]> {
    const entries = this.entries.get(this.key(resourceId, threadId)) ?? [];
    if (limit === undefined || limit >= entries.length) return [...entries];
    return entries.slice(entries.length - limit);
  }

  async search(resourceId: string, threadId: string, query: string, limit?: number): Promise<MemoryEntry[]> {
    const entries = this.entries.get(this.key(resourceId, threadId)) ?? [];
    const lower = query.toLowerCase();
    const matched = entries.filter((e) => e.content.toLowerCase().includes(lower));
    if (limit !== undefined && matched.length > limit) return matched.slice(0, limit);
    return matched;
  }

  async clear(resourceId: string, threadId: string): Promise<void> {
    this.entries.delete(this.key(resourceId, threadId));
  }

  async close(): Promise<void> {
    // no-op
  }

  async createThread(thread: Thread): Promise<void> {
    this.threads.set(thread.id, thread);
  }

  async getThread(threadId: string, _resourceId: string): Promise<Thread | null> {
    return this.threads.get(threadId) ?? null;
  }

  async listThreads(resourceId: string): Promise<Thread[]> {
    return [...this.threads.values()].filter((t) => t.resourceId === resourceId);
  }

  async updateThread(thread: Partial<Thread> & { id: string; resourceId: string }): Promise<void> {
    const existing = this.threads.get(thread.id);
    if (!existing) throw new Error(`Thread not found: ${thread.id}`);
    this.threads.set(thread.id, { ...existing, ...thread, updatedAt: Date.now() });
  }

  async deleteThread(threadId: string, _resourceId: string): Promise<void> {
    this.threads.delete(threadId);
    this.entries.delete(this.key(_resourceId, threadId));
  }

  async deleteMessages(opts: DeleteMessagesOptions): Promise<number> {
    const k = this.key(opts.resourceId, opts.threadId);
    const existing = this.entries.get(k) ?? [];
    let keep = [...existing];

    if (opts.messageIds && opts.messageIds.length > 0) {
      const ids = new Set(opts.messageIds);
      keep = keep.filter((e) => !(e.turnId && ids.has(e.turnId)));
    }
    if (opts.beforeTimestamp !== undefined) {
      keep = keep.filter((e) => e.timestamp >= opts.beforeTimestamp!);
    }
    if (opts.afterTimestamp !== undefined) {
      keep = keep.filter((e) => e.timestamp <= opts.afterTimestamp!);
    }

    const deleted = existing.length - keep.length;
    this.entries.set(k, keep);
    return deleted;
  }

  async cloneThread(
    source: { threadId: string; resourceId: string },
    dest: { threadId: string; resourceId: string },
  ): Promise<void> {
    const src = this.entries.get(this.key(source.resourceId, source.threadId));
    if (src) {
      this.entries.set(this.key(dest.resourceId, dest.threadId), src.map((e) => ({ ...e })));
    }
  }
}
