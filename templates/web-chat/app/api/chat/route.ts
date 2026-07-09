import { streamAgent } from "arcie/runner";
import { NextRequest } from "next/server";
import { resolve } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Where the agent directory lives, resolved to an absolute path.
 *
 * - In dev: `arcie dev` sets `ARCIE_AGENT_DIR` when spawning `next dev`.
 * - In prod: set `ARCIE_AGENT_DIR` on your host (or bundle agent/ into
 *   this Next.js app and adjust the fallback).
 *
 * Fallback assumes the standard `channels/web/` layout under a project
 * root — i.e. `../../agent` relative to this app's cwd.
 */
const AGENT_DIR = process.env.ARCIE_AGENT_DIR ?? resolve(process.cwd(), "../../agent");

export async function POST(req: NextRequest) {
  const { message, agentId } = (await req.json()) as {
    message: string;
    agentId?: string;
  };
  if (typeof message !== "string" || message.length === 0) {
    return new Response("message required", { status: 400 });
  }

  const encoder = new TextEncoder();
  const runOpts = {
    hotReload: true,
    ...(typeof agentId === "string" && agentId.length > 0 ? { agentId } : {}),
  };

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of streamAgent(AGENT_DIR, message, runOpts)) {
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
