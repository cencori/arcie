import { defineTool } from "arcie";
import { z } from "zod";

export default defineTool({
  description:
    "Extract text from a PDF or image document and generate a concise summary. Text-based PDF extraction is free. Use document_query if you need to ask specific questions instead.",
  inputSchema: z.object({
    document: z.string().describe("Public URL or data: URL of the document (PDF or image)"),
    model: z.string().optional().default("gemini-2.5-flash").describe("Model for summarization"),
  }),
  execute: async ({ document: rawDoc, model }) => {
    const document = rawDoc as string;
    const apiKey = process.env.CENCORI_API_KEY;
    if (!apiKey) {
      return { error: "Set CENCORI_API_KEY in .env.local to use documents endpoint." };
    }

    try {
      const body: Record<string, unknown> = { model };

      if (document.startsWith("data:")) {
        const [header, base64] = document.slice(5).split(";base64,");
        body.document_base64 = base64;
        body.mime_type = header ?? "application/octet-stream";
      } else {
        body.document_url = document;
      }

      const res = await fetch("https://cencori.com/api/ai/documents/summarize", {
        method: "POST",
        signal: AbortSignal.timeout(60_000),
        headers: {
          "CENCORI_API_KEY": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        return { error: `Document summarize error (${res.status}): ${err.slice(0, 500)}` };
      }

      const data = await res.json() as {
        summary: string;
        pageCount: number;
        model: string;
        provider: string;
        extractMethod: string;
        usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
        cost?: { cencoriChargeUsd: number };
      };

      return {
        summary: data.summary,
        pageCount: data.pageCount,
        model: data.model,
        provider: data.provider,
        extractMethod: data.extractMethod,
        usage: data.usage,
        cost: data.cost?.cencoriChargeUsd,
        note: data.extractMethod === "pdf_text" ? "Free PDF extraction — only summary generation cost." : undefined,
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Document summarize request failed" };
    }
  },
});
