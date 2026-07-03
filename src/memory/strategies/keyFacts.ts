import type { MemoryStore, MemoryStrategy } from "../types";

const FACT_PATTERNS = [
  /(?:I am|I'm|my name is)\s+(\w+)/i,
  /(?:I (?:work|am)\s+(?:at|for))\s+([\w\s]+?)(?=[.!,]|$)/i,
  /(?:I (?:like|love|enjoy|prefer)\s+)([\w\s]+?)(?=[.!,]|$)/i,
  /(?:I (?:live|am based|am located)\s+(?:in|at))\s+([\w\s,]+?)(?=[.!,]|$)/i,
  /(?:my (?:favorite|favourite)\s+\w+\s+is)\s+([\w\s]+?)(?=[.!,]|$)/i,
  /(?:I (?:have|has)\s+(?:a|an|the)\s+)([\w\s]+?)(?=[.!,]|$)/i,
  /(?:I (?:don't|do not)\s+)([\w\s]+?)(?=[.!,]|$)/i,
  /(?:I (?:use|built|created|developed)\s+)([\w\s]+?)(?=[.!,]|$)/i,
];

function extractFacts(text: string): string[] {
  const facts = new Set<string>();
  for (const pattern of FACT_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1].trim().length > 1) {
      facts.add(match[1].trim());
    }
  }
  return [...facts];
}

const FACTS_PREFIX = "___keyfacts___:";

export class KeyFactsStrategy implements MemoryStrategy {
  private facts = new Map<string, number>();
  private loaded = false;

  private async ensureLoaded(store: MemoryStore, resourceId: string, threadId: string): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const entries = await store.load(resourceId, threadId);
      const factEntries = entries
        .filter((e) => e.content.startsWith(FACTS_PREFIX))
        .sort((a, b) => b.timestamp - a.timestamp);
      if (factEntries.length > 0) {
        this.facts = new Map(JSON.parse(factEntries[0].content.slice(FACTS_PREFIX.length)));
      }
    } catch {
      // ignore load errors on cold start
    }
  }

  async getInputContext(store: MemoryStore, resourceId: string, threadId: string): Promise<string> {
    await this.ensureLoaded(store, resourceId, threadId);
    if (this.facts.size === 0) return "";

    const lines = [...this.facts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([fact]) => `- ${fact}`);

    return `## Known facts about the user\n\n${lines.join("\n")}`;
  }

  async recordTurn(
    store: MemoryStore,
    resourceId: string,
    threadId: string,
    input: string,
    output: string,
    _toolCalls?: { tool: string; input: unknown; output: unknown }[],
  ): Promise<void> {
    await this.ensureLoaded(store, resourceId, threadId);

    const extracted = [...extractFacts(input), ...extractFacts(output)];
    for (const fact of extracted) {
      this.facts.set(fact, (this.facts.get(fact) ?? 0) + 1);
    }

    await store.save(resourceId, threadId, [
      { role: "user", content: input, timestamp: Date.now() },
      { role: "assistant", content: output, timestamp: Date.now() },
      {
        role: "tool",
        content: `${FACTS_PREFIX}${JSON.stringify([...this.facts.entries()])}`,
        timestamp: Date.now(),
      },
    ]);
  }
}
