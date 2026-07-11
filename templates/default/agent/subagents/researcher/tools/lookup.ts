import { defineTool } from "arcie";
import { z } from "zod";

const KNOWLEDGE_BASE: Record<string, string> = {
  "typescript": "TypeScript is a typed superset of JavaScript that compiles to plain JavaScript. Developed by Microsoft, first released in 2012. Adds static typing, interfaces, generics, enums, and decorators to JavaScript.",
  "python": "Python is a high-level, interpreted programming language created by Guido van Rossum and first released in 1991. Known for readability, extensive standard library, and strong ecosystem in data science, web development, and automation.",
  "react": "React is a JavaScript library for building user interfaces, developed by Meta (Facebook). First released in 2013. Uses a component-based architecture with a virtual DOM for efficient rendering.",
  "nextjs": "Next.js is a React framework for production-grade applications. Developed by Vercel. Provides server-side rendering, static generation, API routes, file-system routing, and middleware.",
  "nodejs": "Node.js is a JavaScript runtime built on Chrome's V8 engine. Created by Ryan Dahl in 2009. Enables server-side JavaScript with an event-driven, non-blocking I/O model.",
  "rust": "Rust is a systems programming language focused on safety, speed, and concurrency. Developed by Mozilla, first stable release in 2015. Known for its ownership model that guarantees memory safety without garbage collection.",
  "postgresql": "PostgreSQL is a free and open-source relational database management system emphasizing extensibility and SQL compliance. First released in 1996. Supports ACID transactions, JSON, full-text search, and custom data types.",
  "docker": "Docker is a platform for developing, shipping, and running applications in containers. First released in 2013. Containers package software with its dependencies for consistent execution across environments.",
  "kubernetes": "Kubernetes (K8s) is an open-source container orchestration platform originally designed by Google. First released in 2014. Automates deployment, scaling, and management of containerized applications.",
  "graphql": "GraphQL is a query language for APIs and a runtime for executing those queries. Developed by Meta (Facebook), first released in 2015. Clients request exactly the data they need, reducing over-fetching.",
  "machine learning": "Machine learning is a subset of artificial intelligence where systems learn from data to improve performance on tasks without explicit programming. Types include supervised, unsupervised, and reinforcement learning.",
  "cencori": "Cencori provides the cloud gateway for arcie agent inference. Routes requests to the appropriate LLM provider based on the model name. Supports OpenAI, Anthropic, Groq, DeepSeek, Mistral, Google, and Meta models.",
  "arcie": "Arcie is a production-grade agent framework. It is filesystem-first — agents live in an `agent/` directory. Features include tools, subagents, hooks, schedules, memory, policies, channels, connections, and MCP support.",
};

export default defineTool({
  description: "Look up information about a topic from the knowledge base. Returns structured facts and descriptions.",
  inputSchema: z.object({
    topic: z.string().describe("The topic to look up in the knowledge base"),
  }),
  execute: ({ topic }) => {
    const normalized = topic.toLowerCase().trim();
    const results: Array<{ topic: string; content: string }> = [];

    for (const [key, content] of Object.entries(KNOWLEDGE_BASE)) {
      if (key.includes(normalized) || content.toLowerCase().includes(normalized)) {
        results.push({ topic: key, content });
      }
    }

    return {
      topic,
      found: results.length > 0,
      results: results.length > 0 ? results.slice(0, 5) : [{ topic: topic, content: `No information found about "${topic}" in the knowledge base.` }],
    };
  },
});
