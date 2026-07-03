import type { MemoryEntry, MemoryStore, MemoryStrategy } from "./types";

export class SemanticRecall implements MemoryStrategy {
  private topK: number;

  constructor(topK: number = 5) {
    this.topK = topK;
  }

  async getInputContext(store: MemoryStore, resourceId: string, threadId: string): Promise<string> {
    if (!store.search) return "";

    try {
      const entries = await store.search(resourceId, threadId, "*", this.topK);
      if (entries.length === 0) return "";

      const sorted = [...entries].sort((a, b) => {
        const sa = a.score ?? -Infinity;
        const sb = b.score ?? -Infinity;
        if (sa !== sb) return sb - sa;
        return b.timestamp - a.timestamp;
      });

      const lines = sorted.map((e) => {
        const prefix = e.role === "user" ? "User" : e.role === "assistant" ? "Assistant" : "Tool";
        const scoreStr = e.score !== undefined ? ` [relevance: ${(e.score * 100).toFixed(0)}%]` : "";
        return `${prefix}${scoreStr}: ${e.content}`;
      });

      return `## Relevant memories\n\n${lines.join("\n")}`;
    } catch {
      return "";
    }
  }

  async recordTurn(
    store: MemoryStore,
    resourceId: string,
    threadId: string,
    input: string,
    output: string,
    toolCalls?: { tool: string; input: unknown; output: unknown }[],
  ): Promise<void> {
    const entries: MemoryEntry[] = [
      { role: "user", content: input, timestamp: Date.now() },
      { role: "assistant", content: output, timestamp: Date.now() },
    ];

    if (toolCalls && toolCalls.length > 0) {
      for (const tc of toolCalls) {
        entries.push({
          role: "tool",
          content: JSON.stringify({ tool: tc.tool, result: tc.output }),
          timestamp: Date.now(),
        });
      }
    }

    await store.save(resourceId, threadId, entries);
  }
}
