import type { MemoryStore, MemoryProcessor, Embedder, VectorStore } from "../types";

export interface SemanticRecallConfig {
  topK?: number;
  messageRange?: number;
  scope?: "thread" | "resource";
}

export class SemanticRecallProcessor implements MemoryProcessor {
  name = "semantic-recall";
  private config: SemanticRecallConfig;
  private embedder: Embedder;
  private vectorStore: VectorStore;

  constructor(embedder: Embedder, vectorStore: VectorStore, config?: SemanticRecallConfig) {
    this.embedder = embedder;
    this.vectorStore = vectorStore;
    this.config = {
      topK: 5,
      messageRange: 2,
      scope: "thread",
      ...config,
    };
  }

  async processInput(store: MemoryStore, resourceId: string, threadId: string): Promise<string> {
    const entries = await store.load(resourceId, threadId, this.config.topK);
    if (entries.length === 0) return "";

    const lines = entries.map((e) => {
      const prefix = e.role === "user" ? "User" : e.role === "assistant" ? "Assistant" : "Tool";
      const scoreStr = e.score !== undefined ? ` [relevance: ${(e.score * 100).toFixed(0)}%]` : "";
      return `${prefix}${scoreStr}: ${e.content}`;
    });

    return `## Relevant past context\n\n${lines.join("\n")}`;
  }

  async processOutput(
    store: MemoryStore,
    resourceId: string,
    threadId: string,
    input: string,
    output: string,
    toolCalls?: { tool: string; input: unknown; output: unknown }[],
  ): Promise<void> {
    const texts = [input, output];
    if (toolCalls) {
      for (const tc of toolCalls) {
        texts.push(JSON.stringify({ tool: tc.tool, result: tc.output }));
      }
    }
    const embeddings = await this.embedder.embedBatch(texts);
    const namespace = this.config.scope === "resource" ? resourceId : threadId;
    await this.vectorStore.upsert(namespace, embeddings.map((values, i) => ({
      id: `${threadId}:${Date.now()}:${i}`,
      values,
      metadata: { role: i === 0 ? "user" : i === 1 ? "assistant" : "tool", threadId },
    })));
  }
}
