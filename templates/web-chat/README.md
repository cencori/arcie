# web-chat

A Next.js chat UI for your arcie agent. Talks to arcie's HTTP server through a
server route so the browser never sees the agent's endpoint directly.

## Setup

```bash
cp .env.local.example .env.local
# edit ARCIE_URL if your agent isn't on http://localhost:3000

npm install
npm run dev
```

Open http://localhost:3001 in a browser. In another terminal, start your agent:

```bash
# from the parent agent directory
arcie dev
```

## Deploy

```bash
# Vercel
npx vercel

# Any Node host
npm run build && npm start
```

Set `ARCIE_URL` in the host's environment to point at your deployed agent's
HTTP endpoint.

## Customize

Everything is yours to edit:

- `app/page.tsx` — the chat page
- `components/chat.tsx` — the main chat container
- `components/message.tsx` — user + assistant message bubbles
- `components/tool-call.tsx` — how tool calls render
- `app/globals.css` — theme tokens (colors, radius)
- `tailwind.config.ts` — Tailwind config

Add more shadcn components:

```bash
npx shadcn@latest add card avatar
```
