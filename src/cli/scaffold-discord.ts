import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface ScaffoldDiscordResult {
  readonly targetPath: string;
  readonly alreadyExisted: boolean;
}

const DISCORD_CHANNEL_TEMPLATE = `import { defineChannel, POST } from "arcie";

/*
  Discord Interactions channel.

  1. Create a Discord app at https://discord.com/developers/applications
  2. Enable Interactions and set the endpoint URL to:
     https://your-domain.com/api/channels/discord/interactions
  3. Add the \`DISCORD_BOT_TOKEN\` and \`DISCORD_PUBLIC_KEY\` env vars.

  For local dev, use a tunnel (ngrok) to expose your local server.
*/

export default defineChannel({
  name: "discord",
  type: "discord",
  handler: POST(async (request) => {
    const { body } = request;
    const payload = body as Record<string, unknown>;

    // Discord PING
    if (payload.type === 1) {
      return { status: 200, body: { type: 1 } };
    }

    // Slash command
    if (payload.type === 2) {
      const data = payload.data as Record<string, unknown> | undefined;
      const commandName = data?.name as string | undefined;
      const options = data?.options as Array<{ value?: string }> | undefined;
      const input = options?.[0]?.value ?? commandName ?? "";

      // Process through agent and respond
      // const response = await agent.generate(String(input));
      // return {
      //   status: 200,
      //   body: { type: 4, data: { content: response } },
      // };

      return {
        status: 200,
        body: { type: 5 }, // defer
      };
    }

    // Message component interaction
    if (payload.type === 3) {
      return { status: 200, body: { type: 4, data: { content: "Received" } } };
    }

    return { status: 200, body: { type: 1 } };
  }),
});
`;

export function scaffoldDiscordChannel(agentDir: string): ScaffoldDiscordResult {
  const targetDir = join(agentDir, "channels");
  const targetFile = join(targetDir, "discord.ts");

  if (existsSync(targetFile)) {
    return { targetPath: targetFile, alreadyExisted: true };
  }

  mkdirSync(targetDir, { recursive: true });
  writeFileSync(targetFile, DISCORD_CHANNEL_TEMPLATE, "utf-8");
  return { targetPath: targetFile, alreadyExisted: false };
}
