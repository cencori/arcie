import { discoverAgents, loadAgentById } from "arcie";
import { resolve } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_DIR = process.env.ARCIE_AGENT_DIR ?? resolve(process.cwd(), "../../agent");

/**
 * Lists the agents available in this project: the primary agent plus any
 * inline top-level agents (`<agentDir>/<id>.ts`). Powers the UI's agent
 * selector.
 */
export async function GET() {
  const discovered = discoverAgents(AGENT_DIR);
  const agents = await Promise.all(
    discovered.map(async ({ id }) => {
      try {
        const loaded = await loadAgentById(AGENT_DIR, id, {});
        const { config } = loaded.manifest;
        return {
          id,
          name: config.name ?? id,
          model: config.model,
          description: config.description ?? "",
        };
      } catch {
        return { id, name: id, model: "", description: "" };
      }
    }),
  );
  return Response.json(agents);
}
