"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UiMessage } from "@/lib/types";
import { ToolCall } from "@/components/tool-call";

export function Message({ message }: { message: UiMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-4 py-2.5 text-sm animate-fade-in",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground",
          message.errored && "border border-destructive/40",
        )}
      >
        {message.errored && (
          <div className="mb-2 flex items-center gap-2 text-xs text-destructive">
            <AlertTriangle className="h-3 w-3" />
            <span>Error</span>
          </div>
        )}
        {message.reasoning && (
          <details className="mb-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none">thinking</summary>
            <div className="mt-1 whitespace-pre-wrap italic">{message.reasoning}</div>
          </details>
        )}
        {message.content.length > 0 &&
          (isUser ? (
            <div className="whitespace-pre-wrap">{message.content}</div>
          ) : (
            <div className="prose prose-sm prose-zinc max-w-none dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          ))}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 flex flex-col gap-1.5">
            {message.toolCalls.map((call) => (
              <ToolCall key={call.callId} call={call} />
            ))}
          </div>
        )}
        {message.streaming && message.content.length === 0 && !message.toolCalls?.length && (
          <div className="flex gap-1">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:300ms]" />
          </div>
        )}
      </div>
    </div>
  );
}
