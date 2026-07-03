import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";
import type { MemoryEntry, MemoryStore } from "./types";

export class FileStore implements MemoryStore {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? resolve(homedir(), ".arcie", "memory");
  }

  private filePath(resourceId: string, threadId: string): string {
    const dir = resolve(this.baseDir, resourceId);
    return resolve(dir, `${threadId}.json`);
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
    // no-op for file store
  }
}
