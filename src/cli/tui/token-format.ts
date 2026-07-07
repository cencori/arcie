export interface AssistantResponseStats {
  totalTokens: number | undefined;
  outputTokens: number | undefined;
  tokensPerSecond: number | undefined;
}

export type AssistantResponseStatsMode = "tokens" | "tokensPerSecond";

export function formatCompactTokenCount(count: number): string {
  if (count < 1000) return `${count}`;
  const scaled = count < 1_000_000 ? count / 1000 : count / 1_000_000;
  const suffix = count < 1_000_000 ? "K" : "M";
  return `${scaled.toFixed(1).replace(/\.0$/, "")}${suffix}`;
}

export function formatTokenFlow(
  flow: { inputTokens: number; outputTokens: number; contextSize?: number },
  glyph: { arrowUp: string; arrowDown: string },
): string {
  const up = formatCompactTokenCount(flow.inputTokens);
  const down = formatCompactTokenCount(flow.outputTokens);
  const base = `${glyph.arrowUp} ${up} ${glyph.arrowDown} ${down}`;
  const percentage = formatContextPercentage(flow.inputTokens, flow.contextSize);
  return percentage == null ? base : `${base} ${percentage}`;
}

function formatContextPercentage(
  tokens: number,
  contextSize: number | undefined,
): string | undefined {
  if (contextSize == null || contextSize <= 0 || !Number.isFinite(contextSize)) return undefined;
  return `${Math.round((tokens / contextSize) * 100).toLocaleString()}%`;
}

export function formatAssistantResponseStats(
  stats: AssistantResponseStats,
  mode: AssistantResponseStatsMode,
): string | undefined {
  if (mode === "tokensPerSecond") return formatTokensPerSecond(stats.tokensPerSecond);
  if (stats.outputTokens == null) return undefined;
  return `${stats.outputTokens.toLocaleString()} output tokens`;
}

function formatTokensPerSecond(tokensPerSecond: number | undefined): string | undefined {
  if (tokensPerSecond == null) return undefined;
  return `${formatNumber(tokensPerSecond)} tok/s`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}
