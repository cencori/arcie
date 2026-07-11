import { defineTool } from "arcie";
import { z } from "zod";

export default defineTool({
  description:
    "Fetch one or more public URLs and return their text content. Strips HTML tags, scripts, and styles. Use this to read articles, documentation, API responses, or any public webpage. When the user doesn't provide a URL, use web_search first to find relevant URLs.",
  inputSchema: z.object({
    urls: z.union([z.string().url(), z.array(z.string().url())]).describe("One or more full URLs to fetch (e.g. 'https://example.com' or ['https://a.com', 'https://b.com'])"),
    maxCharsPerUrl: z.number().optional().default(8000).describe("Maximum characters to return per URL"),
  }),
  execute: async ({ urls, maxCharsPerUrl }) => {
    const urlList = typeof urls === "string" ? [urls] : urls;
    const results = [];

    for (const url of urlList) {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(15_000),
          redirect: "follow",
          headers: { "User-Agent": "ArcieAgent/1.0" },
        });

        if (!res.ok) {
          results.push({ url, status: res.status, error: `HTTP ${res.status}: ${res.statusText}`, content: null });
          continue;
        }

        const contentType = res.headers.get("content-type") ?? "";
        const isPlainText = contentType.startsWith("text/plain");
        const raw = await res.text();

        let content: string;
        let title = "";

        if (isPlainText) {
          content = raw;
        } else {
          const titleMatch = raw.match(/<title[^>]*>([^<]*)<\/title>/i);
          if (titleMatch) title = titleMatch[1]!.trim();

          content = raw
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
            .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
            .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/&[^;]+;/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        }

        const truncated = content.length > maxCharsPerUrl ? content.slice(0, maxCharsPerUrl) + "..." : content;

        results.push({
          url,
          status: res.status,
          contentType,
          title: title || undefined,
          content: truncated,
          truncated: content.length > maxCharsPerUrl,
          totalLength: content.length,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ url, error: message, content: null });
      }
    }

    return {
      count: results.length,
      results,
    };
  },
});
