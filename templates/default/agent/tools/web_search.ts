import { defineTool } from "arcie";
import { z } from "zod";

export default defineTool({
  description:
    "Search the web for current information. Uses Tavily — an AI-native search engine optimized for LLMs. Returns clean, relevant results with content snippets and source URLs. Call fetch_url on any result to get the full page content.",
  inputSchema: z.object({
    query: z.string().describe("The search query — be specific for best results"),
    maxResults: z.number().optional().default(5).describe("Maximum number of results to return (1-10)"),
    includeContent: z.boolean().optional().default(true).describe("Include cleaned page content in results"),
  }),
  execute: async ({ query, maxResults, includeContent }) => {
    const apiKey = process.env.TAVILY_API_KEY;

    if (!apiKey) {
      return fallbackSearch(query, maxResults);
    }

    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        signal: AbortSignal.timeout(10_000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: Math.min(maxResults, 10),
          include_answer: true,
          include_raw_content: false,
          include_domains: [],
          exclude_domains: [],
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        return {
          engine: "tavily",
          query,
          error: `Tavily API error (${res.status}): ${text}`,
          results: [],
          note: "Set a valid TAVILY_API_KEY in .env.local.",
        };
      }

      const data = (await res.json()) as {
        answer?: string;
        results?: Array<{
          title: string;
          url: string;
          content: string;
          score: number;
        }>;
      };

      const results = (data.results ?? []).slice(0, maxResults).map((r) => ({
        title: r.title,
        snippet: includeContent ? r.content : r.content.slice(0, 300),
        url: r.url,
        score: r.score,
      }));

      return {
        engine: "tavily",
        query,
        count: results.length,
        answer: data.answer,
        results,
      };
    } catch (err) {
      return {
        engine: "tavily",
        query,
        error: err instanceof Error ? err.message : "Search failed",
        results: [],
        note: "Tavily API unreachable. Check your network connection.",
      };
    }
  },
});

function fallbackSearch(query: string, maxResults: number) {
  const topics = curatedKnowledge();
  const normalized = query.toLowerCase();
  const matches = topics
    .filter((t) => t.title.toLowerCase().includes(normalized) || t.content.toLowerCase().includes(normalized))
    .slice(0, maxResults);

  return {
    engine: "curated",
    query,
    count: matches.length,
    answer: matches.length > 0 ? undefined : `No curated information found for "${query}".`,
    results: matches.length > 0
      ? matches.map((m) => ({ title: m.title, snippet: m.content, url: "" }))
      : [{ title: "No results", snippet: `Set TAVILY_API_KEY in .env.local for live web search, or try a different query.`, url: "" }],
    note: "Using curated knowledge base. Set TAVILY_API_KEY in .env.local for live web results.",
  };
}

function curatedKnowledge(): Array<{ title: string; content: string }> {
  return [
    { title: "TypeScript", content: "Typed superset of JavaScript by Microsoft. Adds static types, interfaces, generics." },
    { title: "Python", content: "High-level interpreted language by Guido van Rossum (1991). Popular for data science, web dev, automation." },
    { title: "React", content: "UI library by Meta (2013). Component-based, virtual DOM. Most popular frontend framework." },
    { title: "Next.js", content: "React framework by Vercel. SSR, SSG, API routes, file-system routing." },
    { title: "Node.js", content: "JavaScript runtime on V8 by Ryan Dahl (2009). Event-driven, non-blocking I/O." },
    { title: "Rust", content: "Systems language by Mozilla (2015). Memory-safe, zero-cost abstractions, no GC." },
    { title: "PostgreSQL", content: "Open-source relational DB (1996). ACID, JSON, full-text search, extensible." },
    { title: "Docker", content: "Container platform (2013). Package apps with dependencies for consistent deployment." },
    { title: "Kubernetes", content: "Container orchestration by Google (2014). Auto deploys, scales, manages containers." },
    { title: "GraphQL", content: "API query language by Meta (2015). Clients request exact data needed, no over-fetching." },
    { title: "Machine Learning", content: "AI subset where systems learn from data. Types: supervised, unsupervised, reinforcement learning." },
    { title: "Linux", content: "Open-source OS kernel by Linus Torvalds (1991). Powers most servers, Android, cloud infrastructure." },
    { title: "Git", content: "Distributed version control by Linus Torvalds (2005). Branching, merging, staging area." },
    { title: "SQL", content: "Structured Query Language for relational databases. Declarative, set-based operations on tables." },
    { title: "REST API", content: "Representational State Transfer. HTTP methods (GET, POST, PUT, DELETE) on resources as JSON/XML." },
    { title: "JSON", content: "JavaScript Object Notation. Lightweight data interchange format. Language-independent." },
    { title: "WebSocket", content: "Full-duplex communication protocol over TCP. Real-time apps: chat, games, live updates." },
    { title: "OAuth 2.0", content: "Authorization framework. Token-based access delegation for APIs." },
    { title: "JWT", content: "JSON Web Token. Compact, self-contained token format for transmitting claims between parties." },
    { title: "HTTPS", content: "HTTP over TLS/SSL. Encrypted communication between browser and server." },
    { title: "Docker Compose", content: "Tool for defining and running multi-container Docker apps with a YAML file." },
    { title: "CI/CD", content: "Continuous Integration and Continuous Deployment. Automate building, testing, deploying." },
    { title: "Microservices", content: "Architectural style where apps are composed of small, independent services over networks." },
    { title: "Serverless", content: "Cloud execution model where provider manages servers. Pay-per-execution. AWS Lambda." },
    { title: "Edge Computing", content: "Processing data near source rather than centralized data centers. Low latency." },
    { title: "WebAssembly", content: "Binary instruction format for stack-based VMs. Runs near-native speed in browsers." },
    { title: "Arcie", content: "Production-grade agent framework. Filesystem-first: agents in agent/ dir. Tools, subagents, hooks, memory, policies, MCP." },
    { title: "Cencori", content: "Cloud gateway for AI model inference. Routes to OpenAI, Anthropic, Groq, DeepSeek, Mistral, Google, Meta models." },
  ];
}
