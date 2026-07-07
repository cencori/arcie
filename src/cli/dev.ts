import { createServer } from "node:http";
import { resolve } from "node:path";
import { loadAgent } from "../loader";
import { discoverAgent } from "../discover/index";
import { streamAgent } from "../runner/index";
import { showHeader } from "./banner";
import { grey, dimmed } from "./style";
import { startBlockChat } from "./tui/renderer/start-block-chat";
import { handleSessionsRequest, getProviderApiKey } from "../server/index";

export interface DevOptions {
  port: string;
  agentDir: string;
  input?: boolean;
}

function checkProviderKeys(modelId: string): string[] {
  const provider = modelId.split("/")[0];
  const missing: string[] = [];

  const keyMap: Record<string, string> = {
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    groq: "GROQ_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    mistral: "MISTRAL_API_KEY",
    google: "GOOGLE_API_KEY",
    meta: "TOGETHER_API_KEY",
  };

  const envVar = keyMap[provider];
  if (envVar && !process.env[envVar] && !getProviderApiKey(provider)) {
    missing.push(envVar);
  }

  return missing;
}

export async function devCommand(options: DevOptions): Promise<void> {
  const agentDirPath = resolve(process.cwd(), options.agentDir);
  const port = parseInt(options.port, 10);

  const localApiUrl = `http://127.0.0.1:${port}/v1`;

  if (!process.env.CENCORI_API_KEY) {
    process.env.CENCORI_API_KEY = "local-dev-key";
  }
  if (!process.env.CENCORI_API_URL) {
    process.env.CENCORI_API_URL = localApiUrl;
  }

  if (!options.input) {
    showHeader();

    const { diagnostics } = discoverAgent(agentDirPath);

    if (diagnostics.some((d) => d.severity === "error")) {
      for (const d of diagnostics) {
        console.error(`  ${grey("\u2716")} ${d.code}: ${d.message}`);
      }
      process.exit(1);
    }

    for (const d of diagnostics) {
      console.warn(`  ${grey("\u26A0")} ${d.code}: ${d.message}`);
    }

    try {
      const agent = await loadAgent(agentDirPath);
      console.log(`  ${agentDirPath} ${grey("\xB7")} ${grey(agent.manifest.config.model)}`);
      console.log();
      console.log(`  ${dimmed(`http://localhost:${port}`)}`);
      console.log();
      console.log(`  ${dimmed(`$ curl -X POST http://localhost:${port} \\`)}`);
      console.log(`  ${dimmed(`  -H "Content-Type: application/json" \\`)}`);
      console.log(`  ${dimmed(`  -d '{"message": "hello"}'`)}`);
      console.log();

      const missing = checkProviderKeys(agent.manifest.config.model);
      if (missing.length > 0) {
        console.log(`  ${grey("\u26A0")} Missing API keys: ${missing.join(", ")}`);
        console.log(`  ${dimmed("  Set them in .env.local or your environment")}`);
        console.log();
      }
    } catch {
      console.log(`  ${agentDirPath}`);
      console.log();
      console.log(`  ${dimmed(`http://localhost:${port}`)}`);
      console.log();
    }
  }

  const server = createServer(async (req, res) => {
    if (await handleSessionsRequest(req, res)) {
      return;
    }

    if (req.method === "POST" && req.url === "/") {
      let body = "";
      for await (const chunk of req) body += chunk;

      try {
        const { message, stream } = JSON.parse(body);

        if (stream) {
          res.writeHead(200, {
            "Content-Type": "application/x-ndjson",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });

          for await (const event of streamAgent(agentDirPath, message)) {
            res.write(JSON.stringify(event) + "\n");
          }
          res.end();
        } else {
          res.writeHead(200, { "Content-Type": "application/json" });
          for await (const _event of streamAgent(agentDirPath, message)) {}
          res.end(JSON.stringify({ status: "ok" }));
        }
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error();
      console.error(`  ${grey("✗")} port ${port} is already in use`);
      console.error(`  ${dimmed(`try: arcie dev --port ${port + 1}`)}`);
      console.error(`  ${dimmed(`or:  lsof -iTCP:${port} -sTCP:LISTEN -n -P    # find and kill the holder`)}`);
      console.error();
    } else {
      console.error();
      console.error(`  ${grey("✗")} ${err.message}`);
      console.error();
    }
    process.exit(1);
  });

  if (options.input) {
    server.listen(port, () => {
      void startBlockChat({ agentDir: agentDirPath });
    });
  } else {
    server.listen(port, () => {});
  }
}
