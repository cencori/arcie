import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolConfig } from "../types";

export function defineTool<TInput = unknown, TOutput = unknown>(
  config: ToolConfig<TInput, TOutput>
): ToolConfig<TInput, TOutput> {
  if (!config.description) {
    throw new Error("Tool must have a description");
  }
  if (!config.execute) {
    throw new Error("Tool must have an execute function");
  }
  return config;
}

export interface ModelToolDefinition {
  name: string;
  description: string;
  input_schema?: Record<string, unknown>;
  type: "function";
}

export function toModelOutput(name: string, tool: ToolConfig): ModelToolDefinition {
  return {
    name,
    description: tool.description,
    input_schema: tool.inputSchema
      ? (zodToJsonSchema(tool.inputSchema, { target: "openApi3" }) as Record<string, unknown>)
      : undefined,
    type: "function",
  };
}
