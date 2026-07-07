"use client";

import * as React from "react";
import { CheckCircle2, Loader2, XCircle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UiToolCall } from "@/lib/types";

function summarize(input: unknown, max = 60): string {
  if (input === undefined || input === null) return "";
  if (typeof input !== "object") return String(input).slice(0, max);
  if (Array.isArray(input)) return `[${input.length}]`;
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length === 0) return "";
  const parts = entries.map(([key, value]) => {
    if (typeof value === "string") return `${key}="${value.slice(0, 24)}"`;
    if (typeof value === "object") {
      return `${key}=${Array.isArray(value) ? `[${value.length}]` : "{…}"}`;
    }
    return `${key}=${String(value)}`;
  });
  const joined = parts.join(", ");
  return joined.length > max ? `${joined.slice(0, max - 1)}…` : joined;
}

function resultText(call: UiToolCall): string | undefined {
  if (call.status === "error") return call.errorMessage;
  if (call.status === "approval") return call.errorMessage ?? "awaiting approval";
  if (call.output === undefined || call.output === null) return undefined;
  if (typeof call.output === "string") {
    return call.output.split("\n").find((line) => line.trim().length > 0) ?? undefined;
  }
  if (typeof call.output !== "object") return String(call.output);
  const record = call.output as Record<string, unknown>;
  for (const key of ["result", "text", "message", "summary", "value", "output"]) {
    const value = record[key];
    if (value !== undefined && typeof value !== "object") return String(value);
  }
  return undefined;
}

export function ToolCall({ call }: { call: UiToolCall }) {
  const args = summarize(call.input);
  const result = resultText(call);
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm",
      )}
    >
      <div className="flex items-center gap-2">
        <StatusGlyph status={call.status} />
        <span className="font-mono font-medium">{call.name}</span>
        {args.length > 0 && (
          <span className="truncate font-mono text-xs text-muted-foreground">{args}</span>
        )}
      </div>
      {result !== undefined && (
        <div className="ml-6 truncate text-xs text-muted-foreground">
          → <span className="font-mono">{result}</span>
        </div>
      )}
    </div>
  );
}

function StatusGlyph({ status }: { status: UiToolCall["status"] }) {
  switch (status) {
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    case "done":
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case "error":
      return <XCircle className="h-4 w-4 text-destructive" />;
    case "approval":
      return <HelpCircle className="h-4 w-4 text-amber-500" />;
    default:
      return null;
  }
}
