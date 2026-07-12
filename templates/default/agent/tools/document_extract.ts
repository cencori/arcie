import { defineTool } from "arcie";
import { z } from "zod";

export default defineTool({
  description:
    "Extract all text from a PDF or image document. Text-based PDFs use native extraction (free, no LLM cost). Image-based documents route through Vision OCR. Use document_query to ask questions about the content.",
  inputSchema: z.object({
    model: z.string().optional().default("gemini-2.5-flash").describe("Vision model for image-based documents"),
    document: z.string().describe("Public URL or data: URL of the document (PDF or image)"),
  }),
  execute: async ({ model, document: rawDoc }) => {
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

      const res = await fetch("https://cencori.com/api/ai/documents/extract", {
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
        return { error: `Document extract error (${res.status}): ${err.slice(0, 500)}` };
      }

      const data = await res.json() as {
        text: string;
        pageCount: number;
        kind: string;
        method: string;
        metadata?: Record<string, unknown>;
      };

      return {
        text: data.text,
        pageCount: data.pageCount,
        kind: data.kind,
        method: data.method,
        metadata: data.metadata,
        textLength: data.text.length,
        note: data.method === "pdf_text" ? "Free PDF text extraction — no LLM cost." : undefined,
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Document extract request failed" };
    }
  },
});
