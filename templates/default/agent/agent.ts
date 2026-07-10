import { defineAgent } from "arcie";

export default defineAgent({
  // Change this line to swap models — hot reload picks it up on the next
  // message, no restart needed. Common choices routed through the Cencori
  // Gateway:
  //   "llama-3.3-70b-versatile"   ← free tier friendly (default)





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
