import { createClient, type Client, type InValue } from "@libsql/client";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";
import type { MemoryEntry, MemoryStore, Thread, DeleteMessagesOptions } from "./types";

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
    this.client.execute(`
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        resource_id TEXT NOT NULL,
        title TEXT,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    this.client.execute(`
      CREATE INDEX IF NOT EXISTS idx_threads_resource
      ON threads(resource_id)
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

  async createThread(thread: Thread): Promise<void> {
    await this.client.execute({
      sql: `INSERT INTO threads (id, resource_id, title, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        thread.id,
        thread.resourceId,
        thread.title ?? null,
        thread.metadata ? JSON.stringify(thread.metadata) : null,
        thread.createdAt,
        thread.updatedAt,
      ],
    });
  }

  async getThread(threadId: string, _resourceId: string): Promise<Thread | null> {
    const rows = await this.client.execute({
      sql: `SELECT id, resource_id, title, metadata, created_at, updated_at FROM threads WHERE id = ?`,
      args: [threadId],
    });
    if (rows.rows.length === 0) return null;
    const r = rows.rows[0];
    return {
      id: r.id as string,
      resourceId: r.resource_id as string,
      title: r.title as string | undefined,
      metadata: r.metadata ? JSON.parse(r.metadata as string) : undefined,
      createdAt: r.created_at as number,
      updatedAt: r.updated_at as number,
    };
  }

  async listThreads(resourceId: string): Promise<Thread[]> {
    const rows = await this.client.execute({
      sql: `SELECT id, resource_id, title, metadata, created_at, updated_at FROM threads WHERE resource_id = ? ORDER BY updated_at DESC`,
      args: [resourceId],
    });
    return rows.rows.map((r) => ({
      id: r.id as string,
      resourceId: r.resource_id as string,
      title: r.title as string | undefined,
      metadata: r.metadata ? JSON.parse(r.metadata as string) : undefined,
      createdAt: r.created_at as number,
      updatedAt: r.updated_at as number,
    }));
  }

  async updateThread(thread: Partial<Thread> & { id: string; resourceId: string }): Promise<void> {
    const fields: string[] = [];
    const args: InValue[] = [];

    if (thread.title !== undefined) { fields.push("title = ?"); args.push(thread.title); }
    if (thread.metadata !== undefined) { fields.push("metadata = ?"); args.push(JSON.stringify(thread.metadata)); }
    fields.push("updated_at = ?");
    args.push(Date.now());
    args.push(thread.id);

    await this.client.execute({
      sql: `UPDATE threads SET ${fields.join(", ")} WHERE id = ?`,
      args,
    });
  }

  async deleteThread(threadId: string, _resourceId: string): Promise<void> {
    await this.client.execute({
      sql: `DELETE FROM memories WHERE thread_id = ?`,
      args: [threadId],
    });
    await this.client.execute({
      sql: `DELETE FROM threads WHERE id = ?`,
      args: [threadId],
    });
  }

  async deleteMessages(opts: DeleteMessagesOptions): Promise<number> {
    const conditions: string[] = ["resource_id = ?", "thread_id = ?"];
    const args: InValue[] = [opts.resourceId, opts.threadId];

    if (opts.messageIds && opts.messageIds.length > 0) {
      const placeholders = opts.messageIds.map(() => "?").join(",");
      conditions.push(`turn_id IN (${placeholders})`);
      args.push(...opts.messageIds);
    }
    if (opts.beforeTimestamp !== undefined) {
      conditions.push("timestamp >= ?");
      args.push(opts.beforeTimestamp);
    }
    if (opts.afterTimestamp !== undefined) {
      conditions.push("timestamp <= ?");
      args.push(opts.afterTimestamp);
    }

    const result = await this.client.execute({
      sql: `DELETE FROM memories WHERE ${conditions.join(" AND ")}`,
      args,
    });
    return Number(result.rowsAffected);
  }

  async cloneThread(
    source: { threadId: string; resourceId: string },
    dest: { threadId: string; resourceId: string },
  ): Promise<void> {
    const rows = await this.client.execute({
      sql: `SELECT role, content, timestamp, turn_id FROM memories WHERE resource_id = ? AND thread_id = ? ORDER BY id ASC`,
      args: [source.resourceId, source.threadId],
    });

    const stmt = `INSERT INTO memories (resource_id, thread_id, role, content, timestamp, turn_id) VALUES (?, ?, ?, ?, ?, ?)`;
    for (const r of rows.rows) {
      await this.client.execute({
        sql: stmt,
        args: [
          dest.resourceId,
          dest.threadId,
          r.role as string,
          r.content as string,
          r.timestamp as number,
          r.turn_id as string | null,
        ],
      });
    }
  }
}
