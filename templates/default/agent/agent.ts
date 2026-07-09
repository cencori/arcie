import { defineAgent } from "arcie";

export default defineAgent({
  // Change this line to swap models — hot reload picks it up on the next
  // message, no restart needed. Common choices routed through the Cencori
  // Gateway:
  //   "llama-3.3-70b-versatile"   ← free tier friendly (default)
  //   "claude-sonnet-4-5"
  //   "claude-opus-4.8"
  //   "gpt-5"
  //   "gemini-3.1-pro"
  //   "deepseek-v4"
  model: "llama-3.3-70b-versatile",
  name: "my-agent",
  description: "An Arcie agent powered by Cencori.",
  cencori: {
    project: process.env.CENCORI_PROJECT_ID,
    billing: {
      budget: "50.00/month",
    },
  },
});
