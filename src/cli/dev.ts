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

const MAX_PORT_ATTEMPTS = 10;

function tryListen(server: ReturnType<typeof createServer>, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      server.removeListener("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port);
  });
}

/**
 * Binds `server` to the first free port starting at `startPort`, walking
 * forward one port at a time until it finds one or exhausts the attempt
 * budget. Returns the bound port. Non-EADDRINUSE errors bubble up.
 */
async function listenWithFallback(
  server: ReturnType<typeof createServer>,
  startPort: number,
): Promise<number> {
  for (let offset = 0; offset < MAX_PORT_ATTEMPTS; offset += 1) {
    const port = startPort + offset;
    try {
      await tryListen(server, port);
      return port;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EADDRINUSE") throw err;
    }
  }
  throw new Error(
    `Could not find a free port in ${startPort}..${startPort + MAX_PORT_ATTEMPTS - 1}`,
  );
}

export async function devCommand(options: DevOptions): Promise<void> {
  const agentDirPath = resolve(process.cwd(), options.agentDir);
  const requestedPort = parseInt(options.port, 10);

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

  let boundPort: number;
  try {
    boundPort = await listenWithFallback(server, requestedPort);
  } catch (err) {
    console.error();
    console.error(`  ${grey("✗")} ${err instanceof Error ? err.message : String(err)}`);
    console.error(`  ${dimmed("try: arcie dev --port <n>    # pick your own starting port")}`);
    console.error();
    process.exit(1);
  }

  const localApiUrl = `http://127.0.0.1:${boundPort}/v1`;
  if (!process.env.CENCORI_API_KEY) process.env.CENCORI_API_KEY = "local-dev-key";
  if (!process.env.CENCORI_API_URL) process.env.CENCORI_API_URL = localApiUrl;

  if (!options.input) {
    showHeader();

    const { diagnostics } = discoverAgent(agentDirPath);

    if (diagnostics.some((d) => d.severity === "error")) {
      for (const d of diagnostics) {
        console.error(`  ${grey("✖")} ${d.code}: ${d.message}`);
      }
      process.exit(1);
    }

    for (const d of diagnostics) {
      console.warn(`  ${grey("⚠")} ${d.code}: ${d.message}`);
    }

    try {
      const agent = await loadAgent(agentDirPath);
      console.log(`  ${agentDirPath} ${grey("\xB7")} ${grey(agent.manifest.config.model)}`);
      console.log();
      if (boundPort !== requestedPort) {
        console.log(
          `  ${grey("!")} port ${requestedPort} was in use ${grey("\xB7")} using ${boundPort}`,
        );
        console.log();
      }
      console.log(`  ${dimmed(`http://localhost:${boundPort}`)}`);
      console.log();
      console.log(`  ${dimmed(`$ curl -X POST http://localhost:${boundPort} \\`)}`);
      console.log(`  ${dimmed(`  -H "Content-Type: application/json" \\`)}`);
      console.log(`  ${dimmed(`  -d '{"message": "hello"}'`)}`);
      console.log();

      const missing = checkProviderKeys(agent.manifest.config.model);
      if (missing.length > 0) {
        console.log(`  ${grey("⚠")} Missing API keys: ${missing.join(", ")}`);
        console.log(`  ${dimmed("  Set them in .env.local or your environment")}`);
        console.log();
      }
    } catch {
      console.log(`  ${agentDirPath}`);
      console.log();
      console.log(`  ${dimmed(`http://localhost:${boundPort}`)}`);
      console.log();
    }
  }

  if (options.input) {
    void startBlockChat({ agentDir: agentDirPath });
  }
}
