export interface MemoryEntry {
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: number;
  turnId?: string;
  /** Relevance score from vector/semantic search (0-1 range). Higher = more relevant. */
  score?: number;
}

export interface MemoryQuery {
  resourceId: string;
  threadId: string;
  query?: string;
  limit?: number;
}

export interface MemoryStore {
  save(resourceId: string, threadId: string, entries: MemoryEntry[]): Promise<void>;
  load(resourceId: string, threadId: string, limit?: number): Promise<MemoryEntry[]>;
  clear(resourceId: string, threadId: string): Promise<void>;
  search?(resourceId: string, threadId: string, query: string, limit?: number): Promise<MemoryEntry[]>;
  close?(): Promise<void>;
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
