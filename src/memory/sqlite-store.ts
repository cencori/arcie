import { createClient, type Client } from "@libsql/client";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";
import type { MemoryEntry, MemoryStore } from "./types";

export class SqliteStore implements MemoryStore {
  private client: Client;

  constructor(dbPath?: string) {
    const path = dbPath ?? resolve(homedir(), ".arcie", "memory.db");
    mkdirSync(dirname(path), { recursive: true });
    this.client = createClient({ url: `file:${path}` });
    this.init();
  }

  private init(): void {
    this.client.execute(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resource_id TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        turn_id TEXT
      )
    `);
    this.client.execute(`
      CREATE INDEX IF NOT EXISTS idx_memories_lookup
      ON memories(resource_id, thread_id, timestamp)
    `);
  }

  async save(resourceId: string, threadId: string, entries: MemoryEntry[]): Promise<void> {
    const stmt = `INSERT INTO memories (resource_id, thread_id, role, content, timestamp, turn_id) VALUES (?, ?, ?, ?, ?, ?)`;
    for (const entry of entries) {
      await this.client.execute({
        sql: stmt,
        args: [resourceId, threadId, entry.role, entry.content, entry.timestamp, entry.turnId ?? null],
      });
    }
  }

  async load(resourceId: string, threadId: string, limit?: number): Promise<MemoryEntry[]> {
    const rows = await this.client.execute({
      sql: `SELECT role, content, timestamp, turn_id FROM memories WHERE resource_id = ? AND thread_id = ? ORDER BY timestamp ASC, id ASC`,
      args: [resourceId, threadId],
    });

    let entries = rows.rows.map((r) => ({
      role: r.role as MemoryEntry["role"],
      content: r.content as string,
      timestamp: r.timestamp as number,
      turnId: r.turn_id as string | undefined,
    }));

    if (limit !== undefined && entries.length > limit) {
      entries = entries.slice(entries.length - limit);
    }

    return entries;
  }

  async clear(resourceId: string, threadId: string): Promise<void> {
    await this.client.execute({
      sql: `DELETE FROM memories WHERE resource_id = ? AND thread_id = ?`,
      args: [resourceId, threadId],
    });
  }

  async search(resourceId: string, threadId: string, query: string, limit?: number): Promise<MemoryEntry[]> {
    const rows = await this.client.execute({
      sql: `SELECT role, content, timestamp, turn_id FROM memories WHERE resource_id = ? AND thread_id = ? AND content LIKE ? ORDER BY timestamp DESC`,
      args: [resourceId, threadId, `%${query}%`],
    });

    let entries = rows.rows.map((r) => ({
      role: r.role as MemoryEntry["role"],
      content: r.content as string,
      timestamp: r.timestamp as number,
      turnId: r.turn_id as string | undefined,
    }));

    if (limit !== undefined && entries.length > limit) {
      entries = entries.slice(0, limit);
    }

    return entries;
  }

  async close(): Promise<void> {
    this.client.close();
  }
}
