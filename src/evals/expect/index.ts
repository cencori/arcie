import type { EvalCheckFn } from "../types";

export function includes(substring: string | RegExp): EvalCheckFn {
  return (value: unknown) => {
    const str = String(value);
    if (substring instanceof RegExp) {
      return substring.test(str)
        ? { score: 1 }
        : { score: 0, message: `Expected "${str}" to match ${substring}` };
    }
    return str.includes(substring)
      ? { score: 1 }
      : { score: 0, message: `Expected "${str}" to include "${substring}"` };
  };
}

export function equals(expected: unknown): EvalCheckFn {
  return (value: unknown) => {
    const pass = deepEqual(value, expected);
    return pass
      ? { score: 1 }
      : { score: 0, message: `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}` };
  };
}

export function matches(schema: { safeParse: (v: unknown) => { success: boolean; error?: unknown } }): EvalCheckFn {
  return (value: unknown) => {
    const result = schema.safeParse(value);
    return result.success
      ? { score: 1 }
      : { score: 0, message: `Schema validation failed: ${String(result.error ?? "unknown")}` };
  };
}

export function satisfies(predicate: (value: unknown) => boolean, label?: string): EvalCheckFn {
  return (value: unknown) => {
    const pass = predicate(value);
    return pass
      ? { score: 1 }
      : { score: 0, message: label ? `Predicate "${label}" returned false` : "Predicate returned false" };
  };
}

export function similarity(expected: string): EvalCheckFn {
  return (value: unknown) => {
    const actual = String(value);
    const maxLen = Math.max(expected.length, actual.length);
    if (maxLen === 0) return { score: 1 };
    const dist = levenshtein(expected, actual);
    return { score: 1 - dist / maxLen };
  };
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a as Record<string, unknown>);
    const bKeys = Object.keys(b as Record<string, unknown>);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}
