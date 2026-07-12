import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { discoverEvalFiles, importEvalFiles, importEvalConfig } from "../evals/discover";
import { runEvals } from "../evals/runner";
import { defineEvalConfig } from "../evals/define-eval";
import { ConsoleReporter, createJunitReporter } from "../evals/reporters/index";
import type { EvalConfig } from "../evals/types";
import { loadAgent } from "../loader";
import { streamAgent } from "../runner/index";
import { handleSessionsRequest, getProviderApiKey, resolveProviderForModel } from "../server/index";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export interface EvalCommandOptions {
  agentDir: string;
  url?: string;
  filter?: string[];
  tag?: string;
  list: boolean;
  junit?: string;
  timeoutMs?: number;
}

export async function evalCommand(options: EvalCommandOptions): Promise<void> {
  const appRoot = resolve(process.cwd());
  const agentDir = resolve(appRoot, options.agentDir);

  // Discover eval files
  const files = discoverEvalFiles(appRoot);
  if (files.length === 0) {
    console.log("  No eval files found in evals/");
    process.exit(2);
  }

  // Import eval definitions
  const evalMap = importEvalFiles(appRoot, files);
  if (evalMap.size === 0) {
    console.log("  No valid eval definitions found");
    process.exit(2);
  }

  // Filter by ids if specified
  const filtered = options.filter && options.filter.length > 0
    ? new Map([...evalMap].filter(([id]) => options.filter!.some((f) => id === f || id.startsWith(f + "/"))))
    : evalMap;

  // Filter by tag
  const withTagFilter = options.tag
    ? new Map([...filtered].filter(([, def]) => def.tags?.includes(options.tag!)))
    : filtered;

  if (withTagFilter.size === 0) {
    console.log("  No evals matched the filter");
    process.exit(2);
  }

  // Load config
  const rawConfig = importEvalConfig(appRoot) ?? {};
  const config: EvalConfig = defineEvalConfig({
    ...rawConfig,
    timeoutMs: options.timeoutMs ?? (rawConfig as EvalConfig).timeoutMs,
  });

  // List mode
  if (options.list) {
    console.log("\n  Discovered evals:");
    for (const [id, def] of withTagFilter) {
      console.log(`    ${id}  ${def.description}`);
    }
    console.log("");
    return;
  }

  // Build send function
  let sendFn: (input: string) => Promise<string>;

  if (options.url) {
    // Remote target
    sendFn = async (input: string) => {
      const res = await fetch(`${options.url}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input }),
      });
      const data = await res.json() as { text?: string; message?: string };
      return data.text ?? data.message ?? "";
    };
  } else {
    // Local: start a dev server
    if (!existsSync(agentDir)) {
      console.error(`  Agent directory not found: ${agentDir}`);
      process.exit(1);
    }

    const server = createServer(async (req, res) => {
      const handled = await handleSessionsRequest(req, res);
      if (!handled) {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const addr = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    // Load agent to get model info
    const agent = await loadAgent(agentDir, { hotReload: false });
    const modelId = agent.manifest.config.model;

    sendFn = async (input: string) => {
      // Create session
      const sessionRes = await fetch(`${baseUrl}/v1/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: null,
          metadata: { model: modelId, instructions: agent.manifest.instructions },
        }),
      });
      const { id: sessionId } = await sessionRes.json() as { id: string };

      // Send turn
      const res = await fetch(`${baseUrl}/v1/sessions/${sessionId}/turns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelId,
          input,
          instructions: agent.manifest.instructions,
          tools: [],
          stream: false,
          pause_on_tool_calls: false,
        }),
      });
      const data = await res.json() as { output?: string };
      return data.output ?? "";
    };

    console.log(`  Local server started on ${baseUrl}`);
  }

  // Build reporters
  const reporters = [ConsoleReporter];
  if (options.junit) {
    reporters.push(createJunitReporter(options.junit));
  }

  // Run
  const summary = await runEvals({
    evals: withTagFilter,
    config,
    sendFn,
    reporters,
    target: options.url ?? `local:${options.agentDir}`,
  });

  // Exit with appropriate code
  if (summary.failed > 0 || summary.errored > 0) {
    process.exit(1);
  }
}
