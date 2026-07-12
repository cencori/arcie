import { defineTool } from "arcie";
import { z } from "zod";

export default defineTool({
  description:
    "Classify an image — returns structured tags, categories, and objects detected. Uses Cencori Vision classification. Best for autotagging, content moderation, and catalog organization.",
  inputSchema: z.object({
    image: z.string().describe("Public URL or data: URL of the image (e.g. data:image/jpeg;base64,...)"),
    model: z.string().optional().default("gemini-2.5-flash").describe("Vision model"),
  }),
  execute: async ({ image: rawImage, model }) => {
    const image = rawImage as string;
    const apiKey = process.env.CENCORI_API_KEY;
    if (!apiKey) {
      return { error: "Set CENCORI_API_KEY in .env.local to use vision.", available: true };
    }

    try {
      const body: Record<string, unknown> = { model };

      if (image.startsWith("data:")) {
        const [header, base64] = image.slice(5).split(";base64,");
        body.image_base64 = base64;
        body.mime_type = header ?? "image/jpeg";
      } else {
        body.image_url = image;
      }

      const res = await fetch("https://cencori.com/api/ai/vision/classify", {
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
        return { error: `Vision classify error (${res.status}): ${err.slice(0, 500)}` };
      }

      const data = await res.json() as {
        classification: Record<string, unknown>;
        raw: string;
        model: string;
        provider: string;
        usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
        cost?: { cencoriChargeUsd: number };
      };

      return {
        classification: data.classification,
        model: data.model,
        provider: data.provider,
        usage: data.usage,
        cost: data.cost?.cencoriChargeUsd,
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Vision classify request failed" };
    }
  },
});
