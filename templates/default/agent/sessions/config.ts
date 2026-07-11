import type { SessionConfig } from "arcie";

export default {
  maxTurns: 25,
  idleTimeoutMs: 300_000,
  requireApproval: false,
  memory: {
    strategy: "lastN",
    limit: 10,
    workingMemory: true,
    workingMemoryTemplate:
      "The user's name is {{user.name}}. Their interests include: {{user.interests}}.",
  },
} satisfies SessionConfig;
