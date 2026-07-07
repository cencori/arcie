"use client";

import * as React from "react";
import { Send, StopCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface InputBarProps {
  onSend(message: string): void;
  onStop(): void;
  streaming: boolean;
  disabled?: boolean;
}

export function InputBar({ onSend, onStop, streaming, disabled }: InputBarProps) {
  const [value, setValue] = React.useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed.length === 0 || streaming || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  React.useEffect(() => {
    const el = textareaRef.current;
    if (el === null) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  return (
    <div className="border-t border-border bg-background px-4 py-3">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={streaming ? "…" : "Send a message"}
          disabled={disabled}
          className={cn(
            "flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />
        {streaming ? (
          <Button size="icon" variant="outline" onClick={onStop} aria-label="Stop">
            <StopCircle className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            size="icon"
            onClick={submit}
            disabled={value.trim().length === 0 || disabled}
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
