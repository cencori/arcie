import { defineTool } from "arcie";
import { z } from "zod";

export default defineTool({
  description:
    "Analyze an image (URL or base64) with a custom question. Uses Cencori Vision API — routes across GPT-4o, Claude, and Gemini. For OCR-specific tasks use vision_ocr instead.",
  inputSchema: z.object({
    image: z.string().describe("Public URL of the image, or a data: URL (e.g. data:image/jpeg;base64,...)"),
    prompt: z.string().describe("Question or instruction about the image"),
    model: z.string().optional().default("gemini-2.5-flash").describe("Vision model"),
    temperature: z.number().optional().default(0.7),
    maxTokens: z.number().optional().default(1024),
  }),
  execute: async ({ image: rawImage, prompt, model, temperature, maxTokens }) => {
    const image = rawImage as string;
    const apiKey = process.env.CENCORI_API_KEY;
    if (!apiKey) {
      return { error: "Set CENCORI_API_KEY in .env.local to use vision.", available: true };
    }

    try {
      const body: Record<string, unknown> = {
        prompt,
        model,
        temperature,
        max_tokens: maxTokens,
        response_format: "text",
      };

      if (image.startsWith("data:")) {
        const [header, base64] = image.slice(5).split(";base64,");
        body.image_base64 = base64;
        body.mime_type = header ?? "image/jpeg";
      } else {
        body.image_url = image;
      }

      const res = await fetch("https://cencori.com/api/ai/vision", {
        method: "POST",
        signal: AbortSignal.timeout(30_000),
        headers: {
          "CENCORI_API_KEY": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        return { error: `Vision API error (${res.status}): ${err.slice(0, 500)}` };
      }

      const data = await res.json() as {
        analysis: string;
        model: string;
        provider: string;
        usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
        cost?: { cencoriChargeUsd: number };
      };

      return {
        analysis: data.analysis,
        model: data.model,
        provider: data.provider,
        usage: data.usage,
        cost: data.cost?.cencoriChargeUsd,
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Vision request failed" };
    }
  },
});
