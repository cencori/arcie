import { defineTool } from "arcie";
import { z } from "zod";

/**
 * Starter tool — proves the tool-calling loop end to end. Ask the agent
 * "what time is it in Tokyo?" and watch the call render in the chat UI.
 * Copy this file to add your own tools: one default-exported
 * defineTool() per file; the filename becomes the tool name.
 */
export default defineTool({
  description:
    "Get the current date and time. Optionally pass an IANA timezone like 'Europe/London' or 'Africa/Lagos'; defaults to the server's local timezone.",
  inputSchema: z.object({
    timezone: z
      .string()
      .optional()
      .describe("IANA timezone, e.g. 'Africa/Lagos'. Defaults to server local time."),
  }),
  execute: ({ timezone }) => {
    const now = new Date();
    const formatted = new Intl.DateTimeFormat("en-US", {
      dateStyle: "full",
      timeStyle: "long",
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(now);
    return { iso: now.toISOString(), formatted, timezone: timezone ?? "server-local" };
  },
});
