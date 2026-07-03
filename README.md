# Arcie

The electronic line — build agents at the speed of light.

> Site: [cencori.com/arcie](https://cencori.com/arcie) &middot; Docs: [cencori.com/arcie/docs](https://cencori.com/arcie/docs)

```
npx arcie@latest init my-agent
```

```
my-agent/
├── agent/
│   ├── agent.ts           # model + Cencori config
│   ├── instructions.md    # system prompt
│   ├── tools/             # what it can do
│   ├── knowledge/         # what it knows
│   ├── subagents/         # who it delegates to
│   ├── channels/          # where it lives (HTTP, Slack, etc.)
│   ├── schedules/         # when it acts on its own
│   ├── sessions/          # durable execution policies
│   └── policies/          # security, budgets, guardrails
├── package.json
└── tsconfig.json
```

## Quick Start

```bash
npx arcie@latest init my-agent
cd my-agent
npm run dev
```

## Authoring

```ts
// agent/agent.ts
import { defineAgent } from "arcie";

export default defineAgent({
  model: "claude-sonnet-4-5",
  cencori: {
    project: "proj_abc",
    billing: { budget: "50.00/month" },
  },
});
```

```ts
// agent/tools/get_weather.ts
import { defineTool } from "arcie/tools";
import { z } from "zod";

export default defineTool({
  description: "Get the current weather for a city.",
  inputSchema: z.object({ city: z.string() }),
  async execute({ city }) {
    return { city, condition: "Sunny", temperatureF: 72 };
  },
});
```

## Subagents

Drop a specialist under `agent/subagents/<id>/` and the orchestrator can delegate
a focused subtask to it. Each subagent is a full agent with its own instructions
and tools, and **must declare a `description`** so the model knows when to use it.

```
agent/subagents/researcher/
├── agent.ts          # defineAgent({ model, description })  ← description required
├── instructions.md   # optional
└── tools/            # optional — the subagent's own tools
```

```ts
// agent/subagents/researcher/agent.ts
import { defineAgent } from "arcie";

export default defineAgent({
  model: "claude-sonnet-4-5",
  description: "Investigate ambiguous questions before the parent agent responds.",
});
```

The orchestrator sees each subagent as a tool it can call with a `message` (plus an
optional `outputSchema` for structured results). Every call runs in a **fresh,
isolated session** — the subagent never inherits the parent's history, so the main
agent's context stays lean. See [docs/subagents.md](docs/subagents.md).

## License

MIT
