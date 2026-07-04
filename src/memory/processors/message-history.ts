import type { MemoryStore, InputProcessor, OutputProcessor } from "../types";

export class MessageHistoryProcessor implements InputProcessor, OutputProcessor {
  name = "message-history";
  private limit: number;

  constructor(limit: number = 10) {
    this.limit = limit;
  }

  async processInput(store: MemoryStore, resourceId: string, threadId: string): Promise<string> {
    const entries = await store.load(resourceId, threadId, this.limit);
    if (entries.length === 0) return "";

    const lines = entries.map((e) => {
      const prefix = e.role === "user" ? "User" : e.role === "assistant" ? "Assistant" : "Tool";
      return `${prefix}: ${e.content}`;
    });

    return `## Recent conversation history\n\n${lines.join("\n")}`;
  }

  async processOutput(
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
          role: "tool",
          content: JSON.stringify({ tool: tc.tool, result: tc.output }),
          timestamp: Date.now(),
        });
      }
    }
    await store.save(resourceId, threadId, entries);
  }
}
