"use client";

import * as React from "react";
import {
  Ban,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Loader2,
  XCircle,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UiToolCall } from "@/lib/types";

function formatJSON(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function summarize(input: unknown, max = 60): string {
  if (input === undefined || input === null) return "";
  if (typeof input !== "object") return String(input).slice(0, max);
  if (Array.isArray(input)) return `[${input.length} items]`;
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length === 0) return "";
  const parts = entries.map(([key, value]) => {
    if (typeof value === "string") return `${key}="${value.slice(0, 24)}"`;
    if (typeof value === "object") {
      return `${key}=${Array.isArray(value) ? `[${value.length} items]` : "{…}"}`;
    }
    return `${key}=${String(value)}`;
  });
  const joined = parts.join(", ");
  return joined.length > max ? `${joined.slice(0, max - 1)}…` : joined;
}

function resultText(call: UiToolCall): string | undefined {
  if (call.status === "error") return call.errorMessage;
  if (call.status === "denied") return "denied by user";
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

interface ToolCallProps {
  call: UiToolCall;
  onApprove?(): void;
  onDeny?(): void;
}

export function ToolCall({ call, onApprove, onDeny }: ToolCallProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [copied, setCopied] = React.useState<"input" | "output" | null>(null);
  const args = summarize(call.input);
  const result = resultText(call);
  const awaitingApproval = call.status === "approval";
  const hasDetail = call.input !== undefined || call.output !== undefined;

  const copyJSON = (label: "input" | "output", value: unknown) => {
    void navigator.clipboard.writeText(formatJSON(value));
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1200);
  };

  const statusColor = {
    running: "text-muted-foreground",
    done: "text-emerald-500",
    error: "text-destructive",
    approval: "text-amber-500",
    denied: "text-muted-foreground",
  }[call.status];

  return (
    <div
      className={cn(
        "group rounded-xl border bg-card/40 text-xs transition-all duration-200",
        awaitingApproval
          ? "border-amber-500/30 shadow-[0_0_12px_-4px_hsl(var(--primary))]"
          : "border-border/30 hover:border-border/50",
        expanded && "border-border/50",
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className={statusColor}>
          <StatusGlyph status={call.status} />
        </span>
        {hasDetail && (
          <span className="text-muted-foreground/50 transition-transform duration-150">
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </span>
        )}
        <span className="font-mono font-semibold text-[11px] tracking-tight">{call.name}</span>
        {call.kind === "subagent" && (
          <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-primary">
            <Bot className="h-2.5 w-2.5" />
            agent
          </span>
        )}
        {args.length > 0 && !expanded && (
          <span className="ml-auto truncate font-mono text-[10px] text-muted-foreground/50 max-w-[200px]">
            {args}
          </span>
        )}
      </button>

      {result !== undefined && !expanded && (
        <div className="ml-8 mr-3 pb-2 truncate text-[10px] text-muted-foreground/50">
          → <span className="font-mono">{result}</span>
        </div>
      )}

      {awaitingApproval && onApprove && onDeny && (
        <div className="ml-8 mr-3 pb-2 flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onApprove(); }}
            className="rounded-lg bg-emerald-600/80 px-3 py-1 text-[10px] font-semibold text-white transition-all hover:bg-emerald-600 active:scale-[0.97]"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDeny(); }}
            className="rounded-lg border border-border/40 px-3 py-1 text-[10px] font-medium text-muted-foreground transition-all hover:bg-muted/30 hover:text-foreground active:scale-[0.97]"
          >
            Deny
          </button>
        </div>
      )}

      {expanded && (
        <div className="border-t border-border/20 px-3 py-2.5 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
          {call.input !== undefined && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                  Input
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); copyJSON("input", call.input); }}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                >
                  {copied === "input" ? (
                    <Check className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </div>
              <pre className="overflow-x-auto rounded-lg bg-black/40 p-2.5 text-[10px] leading-relaxed text-muted-foreground/80 font-mono">
                {formatJSON(call.input)}
              </pre>
            </div>
          )}
          {(call.output !== undefined && call.status !== "error") && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                  Output
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); copyJSON("output", call.output); }}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                >
                  {copied === "output" ? (
                    <Check className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </div>
              <pre className="overflow-x-auto rounded-lg bg-black/40 p-2.5 text-[10px] leading-relaxed text-muted-foreground/80 font-mono">
                {formatJSON(call.output)}
              </pre>
            </div>
          )}
          {call.status === "error" && call.errorMessage && (
            <div className="rounded-lg bg-destructive/5 p-2.5 text-[10px] text-destructive font-mono">
              {call.errorMessage}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusGlyph({ status }: { status: UiToolCall["status"] }) {
  switch (status) {
    case "running":
      return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
    case "done":
      return <CheckCircle2 className="h-3.5 w-3.5" />;
    case "error":
      return <XCircle className="h-3.5 w-3.5" />;
    case "approval":
      return <HelpCircle className="h-3.5 w-3.5" />;
    case "denied":
      return <Ban className="h-3.5 w-3.5" />;
    default:
      return null;
  }
}
