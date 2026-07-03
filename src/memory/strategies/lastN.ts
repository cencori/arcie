import type { MemoryStore, MemoryStrategy } from "../types";

export class LastNStrategy implements MemoryStrategy {
  private limit: number;

  constructor(limit: number = 10) {
    this.limit = limit;
  }

  async getInputContext(store: MemoryStore, resourceId: string, threadId: string): Promise<string> {
    const entries = await store.load(resourceId, threadId, this.limit * 2);
    if (entries.length === 0) return "";

    const lines = entries.map((e) => {
      const prefix = e.role === "user" ? "User" : e.role === "assistant" ? "Assistant" : "Tool";
      return `${prefix}: ${e.content}`;
    });

    return `## Recent conversation history\n\n${lines.join("\n")}`;
  }

  async recordTurn(
    store: MemoryStore,
    resourceId: string,
    threadId: string,
    input: string,
    output: string,
    toolCalls?: { tool: string; input: unknown; output: unknown }[],
  ): Promise<void> {
    const entries: Array<{ role: "user" | "assistant" | "tool"; content: string; timestamp: number }> = [
      { role: "user", content: input, timestamp: Date.now() },
      { role: "assistant", content: output, timestamp: Date.now() },
    ];

    if (toolCalls && toolCalls.length > 0) {
      for (const tc of toolCalls) {
        entries.push({
          role: "tool" as const,
          content: JSON.stringify({ tool: tc.tool, result: tc.output }),
          timestamp: Date.now(),
        });
      }
    }

    await store.save(resourceId, threadId, entries);
  }
}
