import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { loadAgent } from "../loader";
import { discoverAgent } from "../discover/index";
import { grey, dimmed } from "./style";

export async function buildCommand(options: {
  agentDir: string;
  outDir: string;
}): Promise<void> {
  const agentDirPath = resolve(process.cwd(), options.agentDir);
  const outDir = resolve(process.cwd(), options.outDir);

  console.log(`\n  Building agent...\n`);

  if (!existsSync(agentDirPath)) {
    console.error(`  Agent directory not found: ${agentDirPath}`);
    process.exit(1);
  }

  const { agent: discovered, diagnostics } = discoverAgent(agentDirPath);

  if (diagnostics.some((d) => d.severity === "error")) {
    for (const d of diagnostics) {
      console.error(`  ${grey("\u2716")} ${d.code}: ${d.message}`);
    }
    process.exit(1);
  }

  try {
    const agent = await loadAgent(agentDirPath);

    mkdirSync(outDir, { recursive: true });

    const manifest = {
      config: agent.manifest.config,
      instructions: agent.manifest.instructions,
      tools: Object.keys(agent.manifest.tools),
      skills: Object.keys(agent.manifest.skills),
      hooks: Object.keys(agent.manifest.hooks),
      channels: Object.keys(agent.manifest.channels),
      connections: Object.keys(agent.manifest.connections),
      schedules: Object.keys(agent.manifest.schedules),
      subagents: Object.fromEntries(
        Object.entries(agent.manifest.subagents).map(([id, sub]) => [
          id,
          { description: sub.config.description, tools: Object.keys(sub.tools) },
        ]),
      ),
      discovered: {
        tools: discovered.tools.map((t) => t.name),
        skills: discovered.skills.map((s) => s.name),
        hooks: discovered.hooks.map((h) => h.name),
        channels: discovered.channels.map((c) => c.name),
        connections: discovered.connections.map((c) => c.name),
        schedules: discovered.schedules.map((s) => s.name),
        subagents: discovered.subagents.map((s) => s.id),
      },
      session: agent.manifest.session,
      policy: agent.manifest.policy,
    };

    writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

    console.log(`  Written to ${dimmed(`${outDir}/manifest.json`)}`);
    console.log(`  ${grey(`\xB7 ${manifest.tools.length} tools`)}`);
    console.log(`  ${grey(`\xB7 ${manifest.skills.length} skills`)}`);
    console.log(`  ${grey(`\xB7 ${manifest.channels.length} channels`)}`);
    console.log(`  ${grey(`\xB7 ${manifest.connections.length} connections`)}`);
    console.log(`  ${grey(`\xB7 ${manifest.schedules.length} schedules`)}`);
    console.log(`  ${grey(`\xB7 ${Object.keys(manifest.subagents).length} subagents`)}`);
    console.log();
    console.log(`  ${grey("\u2500".repeat(50))}`);
    console.log(`  ${grey("Build complete.")}`);
    console.log();
  } catch (err) {
    console.error(`  Build failed:`, err);
    process.exit(1);
  }
}
