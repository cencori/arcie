import type { MemoryStore, MemoryStrategy } from "../types";

export type SummarizeFn = (text: string) => Promise<string>;

function truncate(text: string, maxChars: number = 2000): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "...";
}

export class SummaryStrategy implements MemoryStrategy {
  private limit: number;
  private summary = "";
  private summarize: SummarizeFn;
  private mutex = Promise.resolve();

  constructor(limit: number = 10, summarize?: SummarizeFn) {
    this.limit = limit;
    this.summarize = summarize ?? this.defaultSummarize;
  }

  private async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.mutex;
    let release: () => void;
    this.mutex = new Promise<void>((resolve) => { release = resolve; });
    await prev;
    try {
      return await fn();
    } finally {
      release!();
    }
  }

  private async defaultSummarize(text: string): Promise<string> {
    const truncated = truncate(text);
    const apiKey = process.env.CENCORI_API_KEY;
    const endpoint = process.env.CENCORI_API_URL || "https://cencori.com/v1";

    if (!apiKey) {
      return `Previous conversation: ${truncated.slice(0, 500)}`;
    }

    try {
      const res = await fetch(`${endpoint}/responses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          input: `Summarize this conversation concisely:\n\n${truncated}`,
          max_output_tokens: 300,
        }),
      });

      if (!res.ok) return `Previous conversation: ${truncated.slice(0, 500)}`;

      const data = await res.json() as { output?: { output?: { content?: { text?: string }[] }[] } };
      const text = data.output?.output?.[0]?.content?.[0]?.text;
      return text ?? `Previous conversation: ${truncated.slice(0, 500)}`;
    } catch {
      return `Previous conversation: ${truncated.slice(0, 500)}`;
    }
  }

  async getInputContext(store: MemoryStore, resourceId: string, threadId: string): Promise<string> {
    const entries = await store.load(resourceId, threadId);
    const recentEntries: string[] = [];
    const summarizeEntries: string[] = [];

    if (this.summary) {
      summarizeEntries.push(`Summary of earlier conversation: ${this.summary}`);
    }

    for (const e of entries) {
      const prefix = e.role === "user" ? "User" : e.role === "assistant" ? "Assistant" : "Tool";
      recentEntries.push(`${prefix}: ${e.content}`);
    }

    const parts = [...summarizeEntries, ...recentEntries];
    if (parts.length === 0) return "";

    return `## Conversation history\n\n${parts.join("\n")}`;
  }

  async recordTurn(
    store: MemoryStore,
    resourceId: string,
    threadId: string,
    input: string,
    output: string,
    toolCalls?: { tool: string; input: unknown; output: unknown }[],
  ): Promise<void> {
    await this.exclusive(async () => {
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

      const allEntries = await store.load(resourceId, threadId);
      if (allEntries.length > this.limit * 2) {
        const textToSummarize = allEntries
          .slice(0, allEntries.length - this.limit)
          .map((e) => `${e.role}: ${e.content}`)
          .join("\n");

        this.summary = await this.summarize(textToSummarize);

        const recentEntries = allEntries.slice(allEntries.length - this.limit);
        await store.clear(resourceId, threadId);
        await store.save(resourceId, threadId, recentEntries);
      }
    });
  }
}
