import { streamAgent } from "arcie/runner";
import { FileStore } from "arcie";
import { NextRequest } from "next/server";
import { resolve } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_DIR = process.env.ARCIE_AGENT_DIR ?? resolve(process.cwd(), "../../agent");
const memoryStore = new FileStore(resolve(AGENT_DIR, "sessions", ".memory"));

interface IncomingFile {
  name: string;
  type: string;
  dataUrl: string;
}

async function analyzeImage(dataUrl: string, fileName: string): Promise<string> {
  const apiKey = process.env.CENCORI_API_KEY;
  if (!apiKey) return `[Image attached: ${fileName} — set CENCORI_API_KEY for vision analysis]`;

  const [header, base64] = dataUrl.slice(5).split(";base64,");

  try {
    const res = await fetch("https://cencori.com/api/ai/vision", {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: { "CENCORI_API_KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        image_base64: base64,
        mime_type: header ?? "image/jpeg",
        prompt: "Describe this image concisely for a text-only language model that cannot see it. Include all visible details: objects, people, text, colors, layout, setting.",
        model: "gemini-2.5-flash",
        response_format: "text",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return `[Image attached: ${fileName} — vision analysis failed (${res.status})]`;
    }

    const data = await res.json() as { analysis: string };
    return `[Image attached: ${fileName}]\n[Vision analysis: ${data.analysis}]`;
  } catch {
    return `[Image attached: ${fileName} — vision API unreachable]`;
  }
}

export async function POST(req: NextRequest) {
  const { message, files, agentId, sessionId, threadId, resume } = (await req.json()) as {
    message?: string;
    files?: IncomingFile[];
    agentId?: string;
    sessionId?: string;
    threadId?: string;
    resume?: {
      toolCalls: Array<{ actionId: string; name: string; args: unknown; approved: boolean }>;
    };
  };

  let fullMessage = message ?? "";

  if (files && files.length > 0) {
    const results = await Promise.allSettled(
      files.map(async (f) => {
        if (f.type.startsWith("image/")) {
          return analyzeImage(f.dataUrl, f.name);
        }
        return `[File attached: ${f.name} — ${(f.dataUrl.length / 1024).toFixed(0)} KB]`;
      }),
    );

    const attachments = results
      .map((r) => (r.status === "fulfilled" ? r.value : `[File processing failed]`))
      .join("\n\n");

    fullMessage = fullMessage.length > 0 ? `${fullMessage}\n\n${attachments}` : attachments;
  }

  const isResume = resume !== undefined && Array.isArray(resume.toolCalls) && resume.toolCalls.length > 0;
  if (!isResume && fullMessage.length === 0) {
    return new Response("message or files required", { status: 400 });
  }
  if (isResume && (typeof sessionId !== "string" || sessionId.length === 0)) {
    return new Response("resume requires sessionId", { status: 400 });
  }

  const encoder = new TextEncoder();
  const runOpts = {
    hotReload: true,
    memoryStore,
    workingMemoryDir: resolve(AGENT_DIR, "sessions"),
    resourceId: "web",
    ...(typeof agentId === "string" && agentId.length > 0 ? { agentId } : {}),
    ...(typeof sessionId === "string" && sessionId.length > 0 ? { sessionId } : {}),
    ...(typeof threadId === "string" && threadId.length > 0 ? { threadId } : {}),
    ...(isResume ? { resume } : {}),
  };

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of streamAgent(AGENT_DIR, fullMessage, runOpts)) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
      } catch (error) {
        const errorEvent = {
          type: "session.failed",
          data: {
            code: "runtime_error",
            message: error instanceof Error ? error.message : String(error),
          },
        };
        controller.enqueue(encoder.encode(JSON.stringify(errorEvent) + "\n"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
