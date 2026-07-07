"use client";

import * as React from "react";
import { Zap } from "lucide-react";
import { InputBar } from "@/components/input-bar";
import { Message } from "@/components/message";
import { readArcieStream } from "@/lib/stream";
import type { UiMessage, UiToolCall } from "@/lib/types";
import { cn } from "@/lib/utils";

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function Chat() {
  const [messages, setMessages] = React.useState<UiMessage[]>([]);
  const [streaming, setStreaming] = React.useState(false);
  const abortRef = React.useRef<AbortController | undefined>(undefined);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const stop = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  const send = async (text: string) => {
    const userMessage: UiMessage = { id: newId("u"), role: "user", content: text };
    const assistantId = newId("a");
    const assistantMessage: UiMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      streaming: true,
      toolCalls: [],
    };
    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const updateAssistant = (patch: (prev: UiMessage) => UiMessage) => {
      setMessages((prev) =>
        prev.map((message) => (message.id === assistantId ? patch(message) : message)),
      );
    };

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const errorBody = await response.text();
        updateAssistant((m) => ({
          ...m,
          content: errorBody || `Server error (${response.status})`,
          streaming: false,
          errored: true,
        }));
        return;
      }

      const toolIndex = new Map<string, number>();

      for await (const event of readArcieStream(response)) {
        switch (event.type) {
          case "message.appended": {
            const delta = (event.data as { delta?: string }).delta ?? "";
            updateAssistant((m) => ({ ...m, content: `${m.content}${delta}` }));
            break;
          }
          case "message.completed": {
            const text = (event.data as { text?: string | null }).text;
            updateAssistant((m) => ({
              ...m,
              content: typeof text === "string" && text.length > 0 ? text : m.content,
            }));
            break;
          }
          case "reasoning.appended": {
            const delta = (event.data as { delta?: string }).delta ?? "";
            updateAssistant((m) => ({ ...m, reasoning: `${m.reasoning ?? ""}${delta}` }));
            break;
          }
          case "tool.started": {
            const data = event.data as { name: string; callId: string; input: unknown };
            const call: UiToolCall = {
              callId: data.callId,
              name: data.name,
              input: data.input,
              status: "running",
            };
            updateAssistant((m) => {
              const toolCalls = m.toolCalls ?? [];
              toolIndex.set(data.callId, toolCalls.length);
              return { ...m, toolCalls: [...toolCalls, call] };
            });
            break;
          }
          case "tool.completed": {
            const data = event.data as {
              callId: string;
              output: unknown;
              status: string;
              error?: { code: string; message: string };
            };
            updateAssistant((m) => {
              const toolCalls = [...(m.toolCalls ?? [])];
              const idx = toolIndex.get(data.callId);
              if (idx === undefined || toolCalls[idx] === undefined) return m;
              const previous = toolCalls[idx];
              const isApproval =
                data.status === "pending" && data.error?.code === "needs_approval";
              toolCalls[idx] = {
                ...previous,
                status: isApproval
                  ? "approval"
                  : data.status === "completed"
                    ? "done"
                    : "error",
                output: data.output,
                errorMessage: data.error?.message,
              };
              return { ...m, toolCalls };
            });
            break;
          }
          case "step.failed":
          case "turn.failed":
          case "session.failed": {
            const data = event.data as { code?: string; message?: string };
            updateAssistant((m) => ({
              ...m,
              content: data.message ?? "Something went wrong.",
              streaming: false,
              errored: true,
            }));
            break;
          }
        }
      }
    } catch (error) {
      if (controller.signal.aborted) {
        updateAssistant((m) => ({ ...m, streaming: false }));
      } else {
        updateAssistant((m) => ({
          ...m,
          content: error instanceof Error ? error.message : String(error),
          streaming: false,
          errored: true,
        }));
      }
    } finally {
      updateAssistant((m) => ({ ...m, streaming: false }));
      setStreaming(false);
      abortRef.current = undefined;
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Zap className="h-5 w-5 text-amber-500" />
        <span className="font-semibold">arcie</span>
        <span className="text-xs text-muted-foreground">web chat</span>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-6">
          {messages.length === 0 && <EmptyState />}
          {messages.map((message) => (
            <Message key={message.id} message={message} />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
      <InputBar onSend={send} onStop={stop} streaming={streaming} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className={cn("mt-24 flex flex-col items-center gap-2 text-center text-muted-foreground")}>
      <Zap className="h-8 w-8 text-amber-500" />
      <div className="text-lg font-medium text-foreground">Start a conversation</div>
      <div className="text-sm">Ask your arcie agent anything.</div>
    </div>
  );
}
