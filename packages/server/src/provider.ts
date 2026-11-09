/**
 * The provider adapter seam (ADR 0018): how the session manager runs an agent without knowing which one. The Claude
 * adapter is the only one in M1; Codex and ACP agents (M2) implement the same interface.
 */
import type { ChatEvent, ProviderId, Role } from "@featra/work-format";

/** A tool call the agent wants to make, as the approval handler sees it. */
export interface ToolRequest {
  /** The chat it came from. */
  chat: string;
  /** The provider's id for this call: the tool row it belongs to. */
  id: string;
  name: string;
  input: Record<string, unknown>;
  /** False when the agent says the call may only be allowed once: no Allow for this chat covers or comes from it. */
  forChat?: boolean;
}

/** `interrupt` on a deny tells the agent to stop its turn rather than try another step (Stop, the chat ending). */
export type ToolDecision =
  | { allow: true; input: Record<string, unknown> }
  | { allow: false; message: string; interrupt?: boolean };

/**
 * Decides a tool call that needs approval: by default the approval desk asks the user in the chat (STORY-45). `signal`
 * aborts when the turn is stopped or the chat's agent ends, and the request ends unanswered.
 */
export type ApprovalHandler = (request: ToolRequest, signal: AbortSignal) => Promise<ToolDecision>;

export interface SessionOptions {
  chat: string;
  /** The project folder: the agent's working directory. */
  cwd: string;
  role: Role;
  /** Asked before each tool that needs approval. */
  approve: (request: Omit<ToolRequest, "chat">, signal: AbortSignal) => Promise<ToolDecision>;
  /** Hears each event of the agent's stream, in order. */
  emit: (event: ChatEvent) => void;
  /** The provider's session to go on with (a restored chat, STORY-44); a new conversation without it. */
  resume?: string | null;
}

/** One agent conversation. The agent starts with the first message. */
export interface ProviderSession {
  /** Sends the user's message, starting the agent first if it isn't running. */
  send: (text: string) => void;
  /** Ends the running turn; the agent keeps its conversation for the next message. */
  interrupt: () => Promise<void>;
  /** Ends the agent. */
  close: () => void;
  /** The provider's session id once the agent reported it, kept to resume the conversation (STORY-44). */
  sessionId: () => string | null;
}

export interface ProviderAdapter {
  id: ProviderId;
  /** What the chat list calls the provider's group ("Claude Code"). */
  name: string;
  /** Whether the user has the provider's agent installed: the chat list shows a group for each one that is. */
  installed: () => Promise<boolean>;
  start: (options: SessionOptions) => ProviderSession;
  /**
   * A session's transcript as chat events, read from the provider's own record of it without running the agent (no
   * tokens), or null when the provider no longer has the session (STORY-44).
   */
  history: (session: string, cwd: string) => Promise<ChatEvent[] | null>;
}
