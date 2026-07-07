import { watch, type FSWatcher } from "node:fs";
import { streamAgent } from "../../../runner/index";
import { loadAgent } from "../../../loader";
import { discoverAgent } from "../../../discover/index";
import { parsePromptCommand, formatPromptCommandHelp } from "../prompt-commands";
import { attachKeyStream } from "../attach-keys";
import { EventTranslator } from "./event-to-blocks";
import { TerminalRenderer } from "./terminal-renderer";

export interface StartBlockChatOptions {
  readonly agentDir: string;
  readonly initialInput?: string;
}

/**
 * Runs the block-based dev TUI against a local agent directory. Returns when
 * the user submits `/exit` or presses Ctrl+C. Ownership of raw stdin is
 * scoped to this function; the caller does not need to restore terminal
 * state on exit paths.
 */
export async function startBlockChat(options: StartBlockChatOptions): Promise<void> {
  const { agentDir } = options;
  const renderer = new TerminalRenderer();
  const translator = new EventTranslator();

  const commitHeader = async () => {
    try {
      const agent = await loadAgent(agentDir);
      const model = agent.manifest.config.model;
      renderer.writeAgentHeader(`arcie · ${agentDir.split("/").pop() ?? "agent"} · ${model}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      renderer.writeError("Agent load failed", message);
    }
  };

  const { diagnostics } = discoverAgent(agentDir);
  const errorDiags = diagnostics.filter((d) => d.severity === "error");
  if (errorDiags.length > 0) {
    for (const d of errorDiags) renderer.writeError(d.code, d.message);
    renderer.stop();
    return;
  }

  await commitHeader();

  let watcher: FSWatcher | undefined;
  try {
    let reprobeTimer: ReturnType<typeof setTimeout> | undefined;
    watcher = watch(agentDir, { recursive: true }, () => {
      if (reprobeTimer !== undefined) clearTimeout(reprobeTimer);
      reprobeTimer = setTimeout(() => {
        void commitHeader();
      }, 250);
    });
  } catch {
    // A missing fs.watch (e.g. some sandboxes) is not fatal.
  }

  const detachKeys = attachKeyStream((key) => renderer.handleKey(key));

  try {
    if (options.initialInput !== undefined && options.initialInput.length > 0) {
      await streamOneTurn(renderer, translator, agentDir, options.initialInput);
    }

    while (true) {
      const text = await renderer.readPrompt();
      if (text === undefined) return;
      const trimmed = text.trim();
      if (trimmed.length === 0) continue;

      if (trimmed.startsWith("/")) {
        const command = parsePromptCommand(trimmed);
        if (command === null) {
          renderer.writeError("Unknown command", `${trimmed} — try /help`);
          continue;
        }
        switch (command.type) {
          case "exit":
            return;
          case "help":
            for (const line of formatPromptCommandHelp().split("\n")) {
              renderer.writeNotice(line);
            }
            continue;
          case "clear":
          case "new":
            for (const op of translator.reset()) renderer.apply([op]);
            await commitHeader();
            continue;
          case "extension":
            renderer.writeNotice(`/${command.name} not yet implemented`);
            continue;
          case "loglevel":
            renderer.writeNotice("logs not yet implemented");
            continue;
        }
        continue;
      }

      await streamOneTurn(renderer, translator, agentDir, trimmed);
    }
  } finally {
    detachKeys();
    watcher?.close();
    renderer.stop();
  }
}

async function streamOneTurn(
  renderer: TerminalRenderer,
  translator: EventTranslator,
  agentDir: string,
  message: string,
): Promise<void> {
  let sawApproval = false;
  try {
    for await (const event of streamAgent(agentDir, message)) {
      const ops = translator.feed(event);
      renderer.apply(ops);
      if (
        event.type === "tool.completed" &&
        event.data.status === "pending" &&
        event.data.error?.code === "needs_approval"
      ) {
        sawApproval = true;
      }
    }
    if (sawApproval) {
      renderer.writeNotice(
        "Tool call awaiting approval — approve via the Cencori sessions API to continue.",
      );
    }
  } catch (err) {
    const detail = err instanceof Error ? err.stack : undefined;
    renderer.apply([
      {
        type: "commit",
        block: {
          kind: "error",
          title: "Stream error",
          body: err instanceof Error ? err.message : String(err),
          detail,
        },
      },
    ]);
  }
}

