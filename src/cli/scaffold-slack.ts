import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface ScaffoldSlackResult {
  readonly targetPath: string;
  readonly alreadyExisted: boolean;
}

const SLACK_CHANNEL_TEMPLATE = `import { defineChannel, POST } from "arcie";

/*
  Slack Events API channel.

  1. Create a Slack app at https://api.slack.com/apps
  2. Enable Event Subscriptions and point the Request URL to:
     https://your-domain.com/api/channels/slack/events
  3. Add the \`SLACK_SIGNING_SECRET\` and \`SLACK_BOT_TOKEN\` env vars.

  For local dev, use a tunnel (ngrok) to expose your local server.
*/

export default defineChannel({
  name: "slack",
  type: "slack",
  handler: POST(async (request) => {
    const { body, headers } = request;
    const payload = body as Record<string, unknown>;

    // Slack URL verification challenge
    if (payload.type === "url_verification") {
      return {
        status: 200,
        body: { challenge: payload.challenge },
      };
    }

    // Event callback
    if (payload.type === "event_callback") {
      const event = payload.event as Record<string, unknown> | undefined;
      if (event?.type === "app_mention" || event?.type === "message") {
        const text = event.text as string | undefined;
        const channel = event.channel as string | undefined;
        if (text && channel) {
          // Process through agent (import your agent and send the message)
          // const response = await agent.generate(text);
          // await fetch("https://slack.com/api/chat.postMessage", {
          //   method: "POST",
          //   headers: {
          //     Authorization: \`Bearer \${process.env.SLACK_BOT_TOKEN}\`,
          //     "Content-Type": "application/json",
          //   },
          //   body: JSON.stringify({ channel, text: response }),
          // });
        }
      }
      return { status: 200, body: { ok: true } };
    }

    // Slash commands
    if (payload.command) {
      const text = payload.text as string | undefined;
      const channelId = payload.channel_id as string | undefined;
      if (text) {
        // const response = await agent.generate(text);
        // return { status: 200, body: { response_type: "in_channel", text: response } };
      }
      return { status: 200, body: { text: "Processing..." } };
    }

    return { status: 200, body: { ok: true } };
  }),
});
`;

export function scaffoldSlackChannel(agentDir: string): ScaffoldSlackResult {
  const targetDir = join(agentDir, "channels");
  const targetFile = join(targetDir, "slack.ts");

  if (existsSync(targetFile)) {
    return { targetPath: targetFile, alreadyExisted: true };
  }

  mkdirSync(targetDir, { recursive: true });
  writeFileSync(targetFile, SLACK_CHANNEL_TEMPLATE, "utf-8");
  return { targetPath: targetFile, alreadyExisted: false };
}
