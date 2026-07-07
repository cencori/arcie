import type { IncomingMessage, ServerResponse } from "node:http";
import { streamLlm, getProviderApiKey, type LlmMessage, type ToolResult } from "./llm";
import type { ModelToolDefinition } from "../tools/index";

interface Session {
  id: string;
  agentId: string;
  model: string;
  instructions: string;
  messages: LlmMessage[];
  tools?: ModelToolDefinition[];
  pendingToolCalls?: Array<{ name: string; arguments: string; id: string }>;
}

const sessions = new Map<string, Session>();

let sessionCounter = 0;
function nextId(): string {
  return `local-${++sessionCounter}-${Date.now().toString(36)}`;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

function writeSSE(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function parseUrl(url: string): { pathname: string } {
  const idx = url.indexOf("?");
  return { pathname: idx === -1 ? url : url.slice(0, idx) };
}

export async function handleSessionsRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const { pathname } = parseUrl(req.url ?? "/");

  const sessionMatch = pathname.match(/^\/v1\/sessions\/([^/]+)\/turns$/);
  const approveMatch = pathname.match(/^\/v1\/sessions\/([^/]+)\/approve$/);
  const createMatch = pathname === "/v1/sessions" && req.method === "POST";

  if (createMatch) {
    return handleCreateSession(req, res);
  }
  if (sessionMatch && req.method === "POST") {
    return handleTurn(req, res, sessionMatch[1]);
  }
  if (approveMatch && req.method === "POST") {
    return handleApprove(req, res, approveMatch[1]);
  }

  return false;
}

async function handleCreateSession(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const body = JSON.parse(await readBody(req));
  const id = nextId();
  const session: Session = {
    id,
    agentId: body.agent_id ?? "unnamed",
    model: body.metadata?.model ?? "",
    instructions: body.metadata?.instructions ?? "",
    messages: [],
  };
  sessions.set(id, session);

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ id }));
  return true;
}

async function handleTurn(
  req: IncomingMessage,
  res: ServerResponse,
  sessionId: string,
): Promise<boolean> {
  const session = sessions.get(sessionId);
  if (!session) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Session not found" }));
    return true;
  }

  const body = JSON.parse(await readBody(req));
  const model = body.model || session.model;
  const input = body.input ?? "";
  const instructions = body.instructions || session.instructions;
  const stream = body.stream !== false;
  const pauseOnTools = body.pause_on_tool_calls !== false;
  const tools: ModelToolDefinition[] = (body.tools ?? []);

  session.model = model;
  session.instructions = instructions;
  if (tools.length > 0) session.tools = tools;

  const messages: LlmMessage[] = [];

  if (instructions) {
    messages.push({ role: "system", content: instructions });
  }

  for (const msg of session.messages) {
    messages.push(msg);
  }

  const turnNumber = session.messages.filter((m) => m.role === "user").length + 1;
  const userMsg: LlmMessage = { role: "user", content: input };
  messages.push(userMsg);

  if (stream) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    writeSSE(res, "turn.started", { turn_number: turnNumber, input_text: input });
    writeSSE(res, "message.received", { input_text: input, turn_number: turnNumber });
    writeSSE(res, "step.started", { step_number: 1, turn_number: turnNumber });

    let textSoFar = "";
    let hadToolCalls = false;
    let messagePushed = false;

    try {
      for await (const event of streamLlm(model, messages, tools.length > 0 ? tools : undefined)) {
        if (event.type === "delta" && event.delta) {
          textSoFar += event.delta;
          writeSSE(res, "output_text.delta", { delta: event.delta, text: textSoFar });
        }

        if (event.type === "tool_call" && event.toolCalls) {
          hadToolCalls = true;
          session.pendingToolCalls = event.toolCalls;

          for (const tc of event.toolCalls) {
            writeSSE(res, "tool_call.started", {
              tool: tc.name,
              arguments: JSON.parse(tc.arguments || "{}"),
              action_id: tc.id,
            });
          }

          const toolCallMsg: LlmMessage = {
            role: "assistant",
            content: textSoFar,
            tool_calls: event.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: { name: tc.name, arguments: tc.arguments },
            })),
          };

          if (pauseOnTools) {
            session.messages.push(toolCallMsg);
            messagePushed = true;
            writeSSE(res, "turn.paused", { text: textSoFar });
            res.end();
            return true;
          }

          session.messages.push(toolCallMsg);
          messagePushed = true;
        }

        if (event.type === "done") {
          if (!messagePushed) {
            session.messages.push({ role: "assistant", content: textSoFar });
            messagePushed = true;
          }
          writeSSE(res, "message.completed", {
            text: textSoFar,
            finish_reason: event.finishReason ?? "stop",
            step_number: 1,
            turn_number: turnNumber,
          });
          writeSSE(res, "step.completed", {
            finish_reason: event.finishReason ?? "stop",
            step_number: 1,
            turn_number: turnNumber,
          });
          writeSSE(res, "turn.completed", { turn_number: turnNumber, turn_id: sessionId });
        }

        if (event.type === "error") {
          writeSSE(res, "turn.completed", { turn_number: turnNumber, turn_id: sessionId });
          writeSSE(res, "error", { message: event.error });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      writeSSE(res, "error", { message: msg });
    }

    res.end();
  } else {
    let fullText = "";
    let messagePushed = false;
    try {
      for await (const event of streamLlm(model, messages, tools.length > 0 ? tools : undefined)) {
        if (event.type === "delta" && event.delta) {
          fullText += event.delta;
        }
        if (event.type === "tool_call" && event.toolCalls) {
          session.pendingToolCalls = event.toolCalls;
        }
      }
    } catch {}

    if (!messagePushed) {
      session.messages.push({ role: "assistant", content: fullText });
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ output: fullText, turn_id: sessionId }));
  }

  return true;
}

async function handleApprove(
  req: IncomingMessage,
  res: ServerResponse,
  sessionId: string,
): Promise<boolean> {
  const session = sessions.get(sessionId);
  if (!session) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Session not found" }));
    return true;
  }

  const body = JSON.parse(await readBody(req));
  const toolResults: ToolResult[] = body.tool_results ?? [];
  const actionId = body.action_id ?? toolResults[0]?.action_id ?? "";

  if (!session.pendingToolCalls || session.pendingToolCalls.length === 0) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "No pending tool calls" }));
    return true;
  }

  const toolResultMessages = toolResults.map((r) => ({
    role: "tool" as const,
    tool_call_id: r.action_id,
    content: r.output,
  }));

  for (const msg of toolResultMessages) {
    session.messages.push(msg);
  }

  session.pendingToolCalls = undefined;

  const turnNumber = session.messages.filter((m) => m.role === "user").length;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  writeSSE(res, "turn.resumed", {});

  let textSoFar = "";
  let hadToolCalls = false;
  let messagePushed = false;

  try {
    for await (const event of streamLlm(
      session.model,
      session.messages,
      session.tools,
      toolResults,
    )) {
      if (event.type === "delta" && event.delta) {
        textSoFar += event.delta;
        writeSSE(res, "output_text.delta", { delta: event.delta, text: textSoFar });
      }

      if (event.type === "tool_call" && event.toolCalls) {
        hadToolCalls = true;
        session.pendingToolCalls = event.toolCalls;

        for (const tc of event.toolCalls) {
          writeSSE(res, "tool_call.started", {
            tool: tc.name,
            arguments: JSON.parse(tc.arguments || "{}"),
            action_id: tc.id,
          });
        }

        session.messages.push({
          role: "assistant",
          content: textSoFar,
          tool_calls: event.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: tc.arguments },
          })),
        });
        messagePushed = true;

        writeSSE(res, "turn.paused", { text: textSoFar });
        res.end();
        return true;
      }

      if (event.type === "done") {
        if (!messagePushed) {
          session.messages.push({ role: "assistant", content: textSoFar });
          messagePushed = true;
        }
        writeSSE(res, "message.completed", {
          text: textSoFar,
          finish_reason: event.finishReason ?? "stop",
        });
        writeSSE(res, "turn.completed", { turn_number: turnNumber, turn_id: sessionId });
      }

      if (event.type === "error") {
        writeSSE(res, "error", { message: event.error });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeSSE(res, "error", { message: msg });
  }

  res.end();
  return true;
}

export { getProviderApiKey };
