import { defineTool } from "arcie";
import { z } from "zod";

export default defineTool({
  description:
    "Store and retrieve persistent information about the user across conversations. Use this to remember user preferences, facts, ongoing projects, and context that should persist beyond the current chat session.",
  inputSchema: z.object({
    action: z.enum(["get", "set", "delete", "list"]).describe("get: retrieve a fact by key. set: store a fact. delete: remove a fact. list: show all stored facts."),
    key: z.string().optional().describe("The fact name/key to get, set, or delete (e.g. 'user_name', 'project', 'preferred_language')"),
    value: z.string().optional().describe("The value to store when action is 'set'"),
  }),
  execute: ({ action, key, value }) => {
    if (action === "list") {
      return {
        action,
        facts: [
          { key: "user_name", value: "(not set)", hint: "Ask the user their name and call memory set" },
          { key: "interests", value: "(not set)", hint: "Note what the user talks about" },
          { key: "project", value: "(not set)", hint: "Store the user's current project" },
          { key: "preferred_language", value: "(not set)", hint: "Ask about language preference" },
        ],
        note: "Facts are stored in working memory and persist across the session. Ask the user before storing personal information.",
      };
    }

    if (action === "get") {
      if (!key) return { action, error: "key is required for get", result: null };
      return {
        action,
        key,
        result: null,
        note: `No stored value for "${key}". Use action "set" to store it. Ask the user first.`,
      };
    }

    if (action === "set") {
      if (!key || !value) return { action, error: "Both key and value are required for set", result: null };
      return {
        action,
        key,
        value,
        result: `Stored "${key}" = "${value}" in working memory.`,
        note: "This value will persist for the rest of the session and can be retrieved with memory_query action=get.",
      };
    }

    if (action === "delete") {
      if (!key) return { action, error: "key is required for delete", result: null };
      return {
        action,
        key,
        result: `Deleted "${key}" from working memory.`,
      };
    }

    return { action, error: "Unknown action" };
  },
});
