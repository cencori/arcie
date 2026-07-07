import type { StreamEvent } from "../../../protocol/events";
import type { Block } from "./blocks";
import { summarizeToolArgs, summarizeToolResult } from "../tool-format";

export type BlockOp =
  | { type: "commit"; block: Block }
  | { type: "start-live"; block: Block }
  | { type: "update-live"; id: string; patch: Partial<Block> }
  | { type: "end-live"; id: string }
  | { type: "clear-live"; id: string };

export interface TranslatorOptions {
  /** Auto-collapse a live reasoning block when the assistant starts speaking. Default true. */
  readonly autoCollapseReasoning?: boolean;
}

/**
 * Pure(ish) fold from `StreamEvent`s to `BlockOp`s.
 *
 * Owns just enough state to correlate stream events with live blocks: the
 * currently streaming assistant / reasoning blocks per level, an in-flight
 * tool map keyed by `callId`, and a subagent depth stack. Every method takes
 * one event and returns the ops that should be applied to the renderer's
 * block store.
 */
export class EventTranslator {
  readonly #autoCollapseReasoning: boolean;
  #nextId = 0;
  #currentAssistantId: string | undefined;
  #currentReasoningId: string | undefined;
  #toolIds = new Map<string, string>();
  #subagentStack: string[] = [];

  constructor(options: TranslatorOptions = {}) {
    this.#autoCollapseReasoning = options.autoCollapseReasoning ?? true;
  }

  get depth(): number {
    return this.#subagentStack.length;
  }

  reset(): BlockOp[] {
    const ops: BlockOp[] = [];
    if (this.#currentAssistantId !== undefined) {
      ops.push({ type: "end-live", id: this.#currentAssistantId });
    }
    if (this.#currentReasoningId !== undefined) {
      ops.push({ type: "end-live", id: this.#currentReasoningId });
    }
    for (const [, id] of this.#toolIds) ops.push({ type: "end-live", id });
    for (const id of this.#subagentStack) ops.push({ type: "end-live", id });
    this.#currentAssistantId = undefined;
    this.#currentReasoningId = undefined;
    this.#toolIds.clear();
    this.#subagentStack = [];
    return ops;
  }

  feed(event: StreamEvent): BlockOp[] {
    switch (event.type) {
      case "session.started":
      case "session.waiting":
      case "session.completed":
      case "turn.started":
      case "turn.completed":
      case "step.started":
      case "step.completed":
        return [];
      case "message.received":
        return this.#onUserMessage(event.data.message);
      case "message.appended":
        return this.#onAssistantDelta(event.data.delta);
      case "message.completed":
        return this.#endAssistant(event.data.text ?? undefined);
      case "reasoning.appended":
        return this.#onReasoningDelta(event.data.delta);
      case "reasoning.completed":
        return this.#endReasoning(event.data.text);
      case "tool.started":
        return this.#onToolStarted(event.data.name, event.data.callId, event.data.input);
      case "tool.completed":
        return this.#onToolCompleted(
          event.data.callId,
          event.data.status,
          event.data.output,
          event.data.error?.message,
          event.data.error?.code,
        );
      case "subagent.called":
        return this.#onSubagentCalled(event.data.name, event.data.callId);
      case "subagent.completed":
        return this.#onSubagentCompleted(event.data.callId, event.data.output);
      case "step.failed":
      case "turn.failed":
      case "session.failed":
        return this.#onFailure(event.data.code, event.data.message);
    }
  }

  #id(prefix: string): string {
    this.#nextId += 1;
    return `${prefix}-${this.#nextId}`;
  }

  #onUserMessage(message: string): BlockOp[] {
    const ops = this.#closeReasoningIfLive();
    ops.push({
      type: "commit",
      block: { kind: "user", body: message, depth: this.depth },
    });
    return ops;
  }

  #onAssistantDelta(delta: string): BlockOp[] {
    const ops = this.#closeReasoningIfLive();
    if (this.#currentAssistantId === undefined) {
      const id = this.#id("assistant");
      this.#currentAssistantId = id;
      ops.push({
        type: "start-live",
        block: this.#assistantKind({ kind: "assistant", id, body: delta, live: true, depth: this.depth }),
      });
    } else {
      ops.push({
        type: "update-live",
        id: this.#currentAssistantId,
        patch: withDelta(delta),
      });
    }
    return ops;
  }

  #endAssistant(text: string | undefined): BlockOp[] {
    const ops: BlockOp[] = [];
    if (this.#currentAssistantId === undefined) return ops;
    if (text !== undefined && text.length > 0) {
      ops.push({
        type: "update-live",
        id: this.#currentAssistantId,
        patch: { body: text, live: false },
      });
    } else {
      ops.push({
        type: "update-live",
        id: this.#currentAssistantId,
        patch: { live: false },
      });
    }
    ops.push({ type: "end-live", id: this.#currentAssistantId });
    this.#currentAssistantId = undefined;
    return ops;
  }

  #onReasoningDelta(delta: string): BlockOp[] {
    const ops: BlockOp[] = [];
    if (this.#currentReasoningId === undefined) {
      const id = this.#id("reasoning");
      this.#currentReasoningId = id;
      ops.push({
        type: "start-live",
        block: this.#assistantKind({
          kind: "reasoning",
          id,
          body: delta,
          live: true,
          collapsed: false,
          depth: this.depth,
        }),
      });
    } else {
      ops.push({
        type: "update-live",
        id: this.#currentReasoningId,
        patch: withDelta(delta),
      });
    }
    return ops;
  }

  #endReasoning(text: string): BlockOp[] {
    const ops: BlockOp[] = [];
    if (this.#currentReasoningId === undefined) return ops;
    ops.push({
      type: "update-live",
      id: this.#currentReasoningId,
      patch: { body: text, live: false, collapsed: this.#autoCollapseReasoning },
    });
    ops.push({ type: "end-live", id: this.#currentReasoningId });
    this.#currentReasoningId = undefined;
    return ops;
  }

  #closeReasoningIfLive(): BlockOp[] {
    if (this.#currentReasoningId === undefined || !this.#autoCollapseReasoning) return [];
    const id = this.#currentReasoningId;
    this.#currentReasoningId = undefined;
    return [
      { type: "update-live", id, patch: { collapsed: true, live: false } },
      { type: "end-live", id },
    ];
  }

  #onToolStarted(name: string, callId: string, input: unknown): BlockOp[] {
    const id = this.#id("tool");
    this.#toolIds.set(callId, id);
    const inSubagent = this.depth > 0;
    const args = summarizeToolArgs(input, 80);
    return [
      {
        type: "start-live",
        block: {
          kind: inSubagent ? "subagent-tool" : "tool",
          id,
          title: name,
          subtitle: args,
          toolInput: input,
          status: "running",
          live: true,
          depth: this.depth,
        },
      },
    ];
  }

  #onToolCompleted(
    callId: string,
    status: string,
    output: unknown,
    errorMessage: string | undefined,
    errorCode: string | undefined,
  ): BlockOp[] {
    const id = this.#toolIds.get(callId);
    if (id === undefined) return [];
    const isApproval = status === "pending" && errorCode === "needs_approval";
    if (isApproval) {
      // Approval state stays live: the tool call has not resolved, and the
      // runner has yielded `session.waiting` to pause the stream. The block
      // sits with an `approval` glyph until the user resumes the session.
      return [
        {
          type: "update-live",
          id,
          patch: {
            status: "approval",
            result: errorMessage ?? "awaiting approval",
          },
        },
      ];
    }
    this.#toolIds.delete(callId);
    const ok = status === "completed";
    const patch: Partial<Block> = {
      status: ok ? "done" : "error",
      toolOutput: ok ? output : undefined,
      result: ok ? summarizeToolResult(output, 80) : errorMessage ?? "failed",
      live: false,
    };
    return [
      { type: "update-live", id, patch },
      { type: "end-live", id },
    ];
  }

  #onSubagentCalled(name: string, callId: string): BlockOp[] {
    const id = this.#id("subagent");
    this.#subagentStack.push(id);
    return [
      {
        type: "commit",
        block: {
          kind: "subagent",
          id,
          title: name,
          depth: this.depth - 1,
        },
      },
    ];
  }

  #onSubagentCompleted(_callId: string, output: string): BlockOp[] {
    if (this.#subagentStack.length === 0) return [];
    this.#subagentStack.pop();
    if (output && output.length > 0) {
      return [
        {
          type: "commit",
          block: {
            kind: "subagent-step",
            body: output,
            depth: this.depth,
          },
        },
      ];
    }
    return [];
  }

  #onFailure(code: string, message: string): BlockOp[] {
    return [
      {
        type: "commit",
        block: {
          kind: "error",
          title: code,
          body: message,
          depth: this.depth,
        },
      },
    ];
  }

  #assistantKind<B extends Block>(block: B): B {
    return this.depth > 0 && block.kind === "assistant"
      ? ({ ...block, kind: "subagent-step" } as unknown as B)
      : block;
  }
}

const DELTA_KEY = "__delta" as const;

function withDelta(delta: string): Partial<Block> {
  return { [DELTA_KEY]: delta } as unknown as Partial<Block>;
}

/**
 * Applies a `BlockOp` to a mutable block store. The store keeps `live` blocks
 * as an insertion-ordered map (for live-region redraw) and `committed` blocks
 * as an append-only array (for scrollback). `commit` from the store is
 * whatever rows should be flushed to `LiveRegion.commit`.
 */
export interface BlockStore {
  readonly live: ReadonlyMap<string, Block>;
  readonly justCommitted: readonly Block[];
  apply(op: BlockOp): void;
  drainCommitted(): Block[];
}

export function createBlockStore(): BlockStore {
  const live = new Map<string, Block>();
  let justCommitted: Block[] = [];

  return {
    get live() {
      return live;
    },
    get justCommitted() {
      return justCommitted;
    },
    apply(op) {
      switch (op.type) {
        case "commit":
          justCommitted.push(op.block);
          return;
        case "start-live":
          if (op.block.id === undefined) return;
          live.set(op.block.id, op.block);
          return;
        case "update-live": {
          const existing = live.get(op.id);
          if (existing === undefined) return;
          const patch = op.patch as Partial<Block> & { [DELTA_KEY]?: string };
          const delta = patch[DELTA_KEY];
          const rest: Partial<Block> = { ...patch };
          delete (rest as { [DELTA_KEY]?: string })[DELTA_KEY];
          const merged: Block = { ...existing, ...rest };
          if (delta !== undefined) merged.body = `${existing.body ?? ""}${delta}`;
          live.set(op.id, merged);
          return;
        }
        case "end-live": {
          const existing = live.get(op.id);
          if (existing === undefined) return;
          live.delete(op.id);
          justCommitted.push({ ...existing, live: false });
          return;
        }
        case "clear-live":
          live.delete(op.id);
          return;
      }
    },
    drainCommitted() {
      const out = justCommitted;
      justCommitted = [];
      return out;
    },
  };
}
