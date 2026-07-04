import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";
import type { MemoryEntry, MemoryStore, Thread, DeleteMessagesOptions } from "./types";

export class FileStore implements MemoryStore {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? resolve(homedir(), ".arcie", "memory");
  }

  private filePath(resourceId: string, threadId: string): string {
    const dir = resolve(this.baseDir, resourceId);
    return resolve(dir, `${threadId}.json`);
  }

  private threadsPath(resourceId: string): string {
    return resolve(this.baseDir, resourceId, "__threads.json");
  }

  private read(resourceId: string, threadId: string): MemoryEntry[] {
    const path = this.filePath(resourceId, threadId);
    if (!existsSync(path)) return [];
    try {
      const raw = readFileSync(path, "utf-8");
      return JSON.parse(raw) as MemoryEntry[];
    } catch {
      return [];
    }
  }

  private write(resourceId: string, threadId: string, entries: MemoryEntry[]): void {
    const path = this.filePath(resourceId, threadId);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(entries, null, 2), "utf-8");
  }

  private readThreads(resourceId: string): Thread[] {
    const path = this.threadsPath(resourceId);
    if (!existsSync(path)) return [];
    try {
      const raw = readFileSync(path, "utf-8");
      return JSON.parse(raw) as Thread[];
    } catch {
      return [];
    }
  }

  private writeThreads(resourceId: string, threads: Thread[]): void {
    const path = this.threadsPath(resourceId);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(threads, null, 2), "utf-8");
  }

  async save(resourceId: string, threadId: string, entries: MemoryEntry[]): Promise<void> {
    const existing = this.read(resourceId, threadId);
    existing.push(...entries);
    this.write(resourceId, threadId, existing);
  }

  async load(resourceId: string, threadId: string, limit?: number): Promise<MemoryEntry[]> {
    const entries = this.read(resourceId, threadId);
    if (limit === undefined || limit >= entries.length) return entries;
    return entries.slice(entries.length - limit);
  }

  async clear(resourceId: string, threadId: string): Promise<void> {
    this.write(resourceId, threadId, []);
  }

  async close(): Promise<void> {
    // no-op
  }

  async createThread(thread: Thread): Promise<void> {
    const threads = this.readThreads(thread.resourceId);
    threads.push(thread);
    this.writeThreads(thread.resourceId, threads);
  }

  async getThread(threadId: string, resourceId: string): Promise<Thread | null> {
    const threads = this.readThreads(resourceId);
    return threads.find((t) => t.id === threadId) ?? null;
  }

  async listThreads(resourceId: string): Promise<Thread[]> {
    return this.readThreads(resourceId);
  }

  async updateThread(thread: Partial<Thread> & { id: string; resourceId: string }): Promise<void> {
    const threads = this.readThreads(thread.resourceId);
    const idx = threads.findIndex((t) => t.id === thread.id);
    if (idx === -1) throw new Error(`Thread not found: ${thread.id}`);
    threads[idx] = { ...threads[idx], ...thread, updatedAt: Date.now() };
    this.writeThreads(thread.resourceId, threads);
  }

  async deleteThread(threadId: string, resourceId: string): Promise<void> {
    const threads = this.readThreads(resourceId);
    this.writeThreads(resourceId, threads.filter((t) => t.id !== threadId));
    const path = this.filePath(resourceId, threadId);
    if (existsSync(path)) writeFileSync(path, "[]", "utf-8");
  }

  async deleteMessages(opts: DeleteMessagesOptions): Promise<number> {
    let entries = this.read(opts.resourceId, opts.threadId);
    const before = entries.length;
    const { messageIds, beforeTimestamp, afterTimestamp } = opts;

    if (messageIds && messageIds.length > 0) {
      const ids = new Set(messageIds);
      entries = entries.filter((e) => !(e.turnId && ids.has(e.turnId)));
    }
    if (beforeTimestamp !== undefined) {
      entries = entries.filter((e) => e.timestamp >= beforeTimestamp);
    }
    if (afterTimestamp !== undefined) {
      entries = entries.filter((e) => e.timestamp <= afterTimestamp);
    }

    this.write(opts.resourceId, opts.threadId, entries);
    return before - entries.length;
  }

  async cloneThread(
    source: { threadId: string; resourceId: string },
    dest: { threadId: string; resourceId: string },
  ): Promise<void> {
    const entries = this.read(source.resourceId, source.threadId);
    this.write(dest.resourceId, dest.threadId, entries.map((e) => ({ ...e })));
  }
}
