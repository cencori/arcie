import { defineTool } from "arcie";
import { z } from "zod";

export default defineTool({
  description:
    "Get the current date and time for any IANA timezone (e.g. 'America/New_York', 'Asia/Tokyo'). Use this only when the user explicitly asks what time it is, what the date is, or requests timezone conversion.",
  inputSchema: z.object({
    timezone: z
      .string()
      .optional()
      .describe("IANA timezone like 'Europe/London' or 'Asia/Tokyo'. Defaults to the server's local timezone if omitted."),
  }),
  execute: ({ timezone }) => {
    const now = new Date();
    const formatted = new Intl.DateTimeFormat("en-US", {
      dateStyle: "full",
      timeStyle: "long",
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(now);
    const utcOffset = timezone
      ? Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "short" })
          .formatToParts(now)
          .find((p) => p.type === "timeZoneName")?.value ?? "unknown"
      : Intl.DateTimeFormat("en-US", { timeZoneName: "short" })
          .formatToParts(now)
          .find((p) => p.type === "timeZoneName")?.value ?? "unknown";
    return { iso: now.toISOString(), formatted, timezone: timezone ?? "server-local", utcOffset };
  },
});
