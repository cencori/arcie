export type ChatRole = "user" | "assistant";

export interface UiFile {
  id: string;
  name: string;
  type: string;
  /** data URL (base64) for images, or placeholder for other files */
  dataUrl: string;
  size: number;
  loading?: boolean;
}

export interface UiMessage {
  id: string;
  role: ChatRole;
  content: string;
  files?: UiFile[];
  toolCalls?: UiToolCall[];
  reasoning?: string;
  streaming?: boolean;
  errored?: boolean;
  latencyMs?: number;
}

export interface UiToolCall {
  callId: string;
  name: string;
  input?: unknown;
  output?: unknown;
  status: "running" | "done" | "error" | "approval" | "denied";
  errorMessage?: string;
  /** Set when the call is handled by a subagent rather than a plain tool. */
  kind?: "tool" | "subagent";
}

export interface AgentInfo {
  id: string;
  name: string;
  model: string;
  description: string;
}

export type ArcieStreamEvent =
  | { type: "session.started"; data: { sessionId: string } }
  | { type: "turn.started"; data: { turnId: string } }
  | { type: "message.received"; data: { message: string; turnId: string } }
  | {
      type: "message.appended";
      data: { delta: string; textSoFar: string; turnId: string; stepIndex: number };
    }
  | {
      type: "message.completed";
      data: { text: string | null; turnId: string; stepIndex: number };
    }
  | {
      type: "reasoning.appended";
      data: { delta: string; soFar: string; turnId: string; stepIndex: number };
    }
  | {
      type: "reasoning.completed";
      data: { text: string; turnId: string; stepIndex: number };
    }
  | {
      type: "tool.started";
      data: { name: string; input: unknown; callId: string; turnId: string };
    }
  | {
      type: "tool.completed";
      data: {
        name: string;
        output: unknown;
        callId: string;
        status: string;
        error?: { code: string; message: string };
        turnId: string;
      };
    }
  | {
      type: "subagent.called";
      data: { name: string; callId: string; childSessionId: string; turnId: string };
    }
  | {
      type: "subagent.completed";
      data: { name: string; callId: string; output: string };
    }
  | {
      type: "step.failed" | "turn.failed" | "session.failed";
      data: { code: string; message: string };
    }
  | { type: string; data: unknown };
