import type { IncomingMessage, ServerResponse } from "node:http";
import type { ChannelConfig, ChannelRequest, ChannelResponse } from "../types";

export interface ChannelServerHandle {
  stop: () => void;
}

/**
 * Mounts channel handlers as HTTP routes on the dev server.
 * Returns a middleware function + cleanup handle.
 */
export function createChannelMiddleware(
  channels: Record<string, ChannelConfig>,
): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  const routes = buildRoutes(channels);

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    for (const route of routes) {
      const match = route.pattern.exec(req.url ?? "/");
      if (!match) continue;
      if (route.method && req.method !== route.method) continue;

      const body = await readBody(req);
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = body;
      }

      const channelReq: ChannelRequest = {
        body: parsed,
        headers: Object.fromEntries(
          Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : v ?? ""]),
        ),
        method: req.method ?? "GET",
      };

      try {
        const channelRes: ChannelResponse = await route.handler(channelReq);
        res.writeHead(channelRes.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(channelRes.body));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: msg }));
      }
      return true;
    }
    return false;
  };
}

interface RouteEntry {
  pattern: RegExp;
  method?: string;
  handler: (req: ChannelRequest) => ChannelResponse | Promise<ChannelResponse>;
}

function buildRoutes(channels: Record<string, ChannelConfig>): RouteEntry[] {
  const routes: RouteEntry[] = [];

  for (const [name, channel] of Object.entries(channels)) {
    if (channel.type === "http") {
      routes.push({
        pattern: new RegExp(`^/api/channels/${name}/?$`),
        handler: channel.handler,
      });
    } else if (channel.type === "slack") {
      routes.push({
        pattern: /^\/api\/channels\/slack\/events\/?$/,
        method: "POST",
        handler: channel.handler,
      });
    } else if (channel.type === "discord") {
      routes.push({
        pattern: /^\/api\/channels\/discord\/interactions\/?$/,
        method: "POST",
        handler: channel.handler,
      });
    } else if (channel.type === "custom") {
      // Custom channels: try path prefix match on channel name
      routes.push({
        pattern: new RegExp(`^/api/channels/${name}/?$`),
        handler: channel.handler,
      });
    }
  }

  return routes;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}
