import type { AgentConfig, AgentManifest, ToolConfig } from "../types";
import { streamLoadedAgent, type RunOptions } from "../runner/index";
import type { StreamEvent } from "../protocol/events";

class Agent {
  id = "agent";
  agentDir = process.cwd();

  constructor(public config: AgentConfig) {
    if (!config.model) {
      throw new Error("Agent must specify a model");
    }
  }

  get manifest(): AgentManifest {
    return {
      config: this.config,
      instructions: this.config.instructions ?? "You are a helpful AI agent.",
      tools: this.config.tools ?? {},
      skills: {},
      hooks: {},
      channels: {},
      connections: {},
      schedules: {},
      subagents: materializeInlineSubagents(this.config.subagents),
    };
  }

  async generate(input: string, options?: RunOptions): Promise<string> {
    let outputText = "";
    let sessionId = options?.sessionId ?? "";
    for await (const event of streamLoadedAgent(this, input, { ...options, sessionId })) {
      if (event.type === "session.started" && !sessionId) {
        sessionId = event.data.sessionId;
      }
      if (event.type === "message.completed" && event.data.text) {
        outputText = event.data.text;
      }
    }
    return outputText;
  }

  async *stream(input: string, options?: RunOptions): AsyncGenerator<StreamEvent, void, unknown> {
    yield* streamLoadedAgent(this, input, options ?? {});
  }

  async execute(name: string, input: unknown): Promise<unknown> {
    const tool = this.config.tools?.[name];
    if (!tool) throw new Error(`Tool "${name}" not found on agent`);
    let output = await tool.execute(input);
    if (tool.outputSchema) {
      output = tool.outputSchema.parse(output);
    }
    return output;
  }

  getTools(): Record<string, ToolConfig> {
    return { ...this.config.tools };
  }
}

function materializeInlineSubagents(
  configs: Record<string, AgentConfig> | undefined,
): Record<string, import("../types").SubagentManifest> {
  if (configs === undefined) return {};
  const result: Record<string, import("../types").SubagentManifest> = {};
  for (const [id, subConfig] of Object.entries(configs)) {
    if (!subConfig.description || subConfig.description.length === 0) {
      throw new Error(`Inline subagent "${id}" must declare a description`);
    }
    result[id] = {
      config: subConfig,
      instructions: subConfig.instructions ?? "You are a helpful subagent.",
      tools: subConfig.tools ?? {},
      skills: {},
    };
  }
  return result;
}

/** Returns an Agent instance with programmatic generate/stream/execute APIs. */
export function createAgent(config: AgentConfig): Agent {
  return new Agent(config);
}

/**
 * Validates and returns a plain AgentConfig object. Backward-compatible —
 * use `createAgent()` when you need the programmatic API.
 */
export function defineAgent(config: AgentConfig): AgentConfig {
  if (!config.model) {
    throw new Error("Agent must specify a model");
  }
  return config;
}

export { Agent };
