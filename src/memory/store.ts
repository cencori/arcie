import type { MemoryEntry, MemoryStore } from "./types";

export class InMemoryStore implements MemoryStore {
  private entries = new Map<string, MemoryEntry[]>();

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
    // no-op for in-memory
  }
}
