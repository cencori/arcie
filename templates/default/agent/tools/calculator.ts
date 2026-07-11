import { defineTool } from "arcie";
import { z } from "zod";

export default defineTool({
  description:
    "Evaluate a mathematical expression. Supports +, -, *, /, parentheses, exponents (^), sqrt, sin, cos, tan, log, ln, pi, e. Use this for any calculation the user asks for — it's more reliable than doing math in your head.",
  inputSchema: z.object({
    expression: z.string().describe("The math expression to evaluate, e.g. '(12 * 3.5 + 45) / 2' or 'sqrt(144) * pi'"),
  }),
  execute: ({ expression }) => {
    const sanitized = expression
      .replace(/×/g, "*")
      .replace(/÷/g, "/")
      .replace(/π/g, "Math.PI")
      .replace(/pi/gi, "Math.PI")
      .replace(/\be\b(?!\w*\.)/g, "Math.E")
      .replace(/sqrt\(/g, "Math.sqrt(")
      .replace(/sin\(/g, "Math.sin(")
      .replace(/cos\(/g, "Math.cos(")
      .replace(/tan\(/g, "Math.tan(")
      .replace(/log\(/g, "Math.log10(")
      .replace(/ln\(/g, "Math.log(")
      .replace(/\^/g, "**");

    const fn = new Function(`"use strict"; return (${sanitized})`);
    const result = fn();
    const formatted = Number.isInteger(result) ? result.toString() : result.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
    return { expression, result, formatted };
  },
});
