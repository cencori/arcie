import type { MemoryStore, MemoryStrategy, MemoryEntry } from "./types";
export type { MemoryEntry, MemoryStore, MemoryStrategy, MemoryQuery } from "./types";
export { InMemoryStore } from "./store";
export { SqliteStore } from "./sqlite-store";
export { FileStore } from "./file-store";
export { CencoriMemoryStore } from "./cencori-store";
export type { CencoriMemoryClient } from "./cencori-store";
export { LastNStrategy } from "./strategies/lastN";
export { KeyFactsStrategy } from "./strategies/keyFacts";
export { SummaryStrategy } from "./strategies/summary";
export type { SummarizeFn } from "./strategies/summary";
export { SemanticRecall } from "./semantic";
export { WorkingMemory, DEFAULT_TEMPLATE, WORKING_MEMORY_SYSTEM_INSTRUCTION } from "./working-memory";

import type { SessionConfig } from "../types";
import { InMemoryStore } from "./store";
import { LastNStrategy } from "./strategies/lastN";
import { KeyFactsStrategy } from "./strategies/keyFacts";
import { SummaryStrategy } from "./strategies/summary";
import { SemanticRecall } from "./semantic";
import { WorkingMemory } from "./working-memory";

export interface MemoryOptions {
  store?: MemoryStore;
  resourceId?: string;
  threadId?: string;
}

export class Memory {
  store: MemoryStore;
  private strategy: MemoryStrategy;
  private workingMemory: WorkingMemory | null;
  resourceId: string;
  threadId: string;

  constructor(config: SessionConfig["memory"], options: MemoryOptions = {}) {
    this.store = options.store ?? new InMemoryStore();
    this.resourceId = options.resourceId ?? "default";
    this.threadId = options.threadId ?? "default";

    this.workingMemory = config?.workingMemory
      ? new WorkingMemory(config.workingMemoryTemplate, undefined, this.resourceId)
      : null;

    switch (config?.strategy) {
      case "lastN":
        this.strategy = new LastNStrategy(config.limit ?? 10);
        break;
      case "keyFacts":
        this.strategy = new KeyFactsStrategy();
        break;
      case "summary":
        this.strategy = new SummaryStrategy(config.limit ?? 10);
        break;
      case "semantic":
        this.strategy = new SemanticRecall(config.limit ?? 5);
        break;
      default:
        this.strategy = new LastNStrategy(10);
    }
  }

  async destroy(): Promise<void> {
    await this.store.close?.();
  }

  async getInputContext(): Promise<string> {
    const parts: string[] = [];

    if (this.workingMemory) {
      const wmContext = await this.workingMemory.getInputContext(this.store, this.resourceId, this.threadId);
      if (wmContext) parts.push(wmContext);
    }

    const strategyContext = await this.strategy.getInputContext(this.store, this.resourceId, this.threadId);
    if (strategyContext) parts.push(strategyContext);

    return parts.join("\n\n");
  }

  getSystemInstruction(): string {
    if (this.workingMemory) {
      return this.workingMemory.getSystemInstruction();
    }
    return "";
  }

  getToolDefinitions(): Record<string, import("../types").ToolConfig> {
    if (this.workingMemory) {
      return this.workingMemory.getToolDefinitions();
    }
    return {};
  }

  async recordTurn(
    input: string,
    output: string,
    toolCalls?: { tool: string; input: unknown; output: unknown }[],
  ): Promise<void> {
    await this.strategy.recordTurn(this.store, this.resourceId, this.threadId, input, output, toolCalls);
    if (this.workingMemory) {
      await this.workingMemory.recordTurn(this.store, this.resourceId, this.threadId, input, output, toolCalls);
    }
  }

  async clear(): Promise<void> {
    await this.store.clear(this.resourceId, this.threadId);
  }
}
