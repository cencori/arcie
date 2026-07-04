import type { z } from "zod";

export interface MemoryEntry {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  timestamp: number;
  turnId?: string;
  score?: number;
}

export interface Thread {
  id: string;
  resourceId: string;
  title?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface DeleteMessagesOptions {
  threadId: string;
  resourceId: string;
  messageIds?: string[];
  beforeTimestamp?: number;
  afterTimestamp?: number;
}

export interface ThreadMessage {
  id: string;
  role: MemoryEntry["role"];
  content: string;
  timestamp: number;
}

export interface MemoryQuery {
  resourceId: string;
  threadId: string;
  query?: string;
  limit?: number;
}

export interface RecallOptions {
  threadId: string;
  resourceId: string;
  page?: number;
  perPage?: number;
  dateRange?: { start?: Date; end?: Date };
  include?: Array<{ id: string; withPreviousMessages?: number; withNextMessages?: number }>;
  vectorSearchString?: string;
}

export interface RecallResult {
  messages: MemoryEntry[];
  total: number;
  hasMore: boolean;
}

export interface MemoryStore {
  save(resourceId: string, threadId: string, entries: MemoryEntry[]): Promise<void>;
  load(resourceId: string, threadId: string, limit?: number): Promise<MemoryEntry[]>;
  clear(resourceId: string, threadId: string): Promise<void>;
  search?(resourceId: string, threadId: string, query: string, limit?: number): Promise<MemoryEntry[]>;
  close?(): Promise<void>;

  createThread?(thread: Thread): Promise<void>;
  getThread?(threadId: string, resourceId: string): Promise<Thread | null>;
  listThreads?(resourceId: string): Promise<Thread[]>;
  updateThread?(thread: Partial<Thread> & { id: string; resourceId: string }): Promise<void>;
  deleteThread?(threadId: string, resourceId: string): Promise<void>;

  deleteMessages?(opts: DeleteMessagesOptions): Promise<number>;
  cloneThread?(source: { threadId: string; resourceId: string }, dest: { threadId: string; resourceId: string }): Promise<void>;
}

export interface MemoryStrategy {
  getInputContext(store: MemoryStore, resourceId: string, threadId: string): Promise<string>;
  recordTurn(
    store: MemoryStore,
    resourceId: string,
    threadId: string,
    input: string,
    output: string,
    toolCalls?: { tool: string; input: unknown; output: unknown }[],
  ): Promise<void>;
}

export interface InputProcessor {
  name: string;
  processInput(store: MemoryStore, resourceId: string, threadId: string): Promise<string>;
}

export interface OutputProcessor {
  name: string;
  processOutput(
    store: MemoryStore,
    resourceId: string,
    threadId: string,
    input: string,
    output: string,
    toolCalls?: { tool: string; input: unknown; output: unknown }[],
  ): Promise<void>;
}

export interface MemoryProcessor extends InputProcessor {
  processOutput?(
    store: MemoryStore,
    resourceId: string,
    threadId: string,
    input: string,
    output: string,
    toolCalls?: { tool: string; input: unknown; output: unknown }[],
  ): Promise<void>;
}

export interface Embedder {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  readonly dimensions: number;
}

export interface VectorStore {
  upsert(namespace: string, vectors: Array<{ id: string; values: number[]; metadata?: Record<string, unknown> }>): Promise<void>;
  query(namespace: string, vector: number[], options?: { topK?: number; filter?: Record<string, unknown> }): Promise<Array<{ id: string; score: number; metadata?: Record<string, unknown> }>>;
  delete(namespace: string, ids: string[]): Promise<void>;
}
