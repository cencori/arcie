import type { MemoryStore, MemoryStrategy, MemoryProcessor } from "../types";
import type { ToolConfig } from "../../types";

/**
 * Wraps a legacy MemoryStrategy into the MemoryProcessor interface.
 * Allows gradual migration: old strategies (LastN, Summary, KeyFacts) work
 * unchanged inside the new processor pipeline.
 */
export class StrategyAdapter implements MemoryProcessor {
  name: string;
  private strategy: MemoryStrategy;

  constructor(strategy: MemoryStrategy) {
    this.strategy = strategy;
    this.name = `${strategy.constructor.name}Adapter`;
  }

  async processInput(store: MemoryStore, resourceId: string, threadId: string): Promise<string> {
    return this.strategy.getInputContext(store, resourceId, threadId);
  }

  async processOutput(
    store: MemoryStore,
    resourceId: string,
    threadId: string,
    input: string,
    output: string,
    toolCalls?: { tool: string; input: unknown; output: unknown }[],
  ): Promise<void> {
    await this.strategy.recordTurn(store, resourceId, threadId, input, output, toolCalls);
  }

  getToolDefinitions?(): Record<string, ToolConfig> {
    if ("getToolDefinitions" in this.strategy) {
      return (this.strategy as { getToolDefinitions(): Record<string, ToolConfig> }).getToolDefinitions();
    }
    return {};
  }
}
