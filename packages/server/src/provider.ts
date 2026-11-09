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
}

export type ToolDecision = { allow: true; input: Record<string, unknown> } | { allow: false; message: string };

/**
 * Decides a tool call that needs approval. Pluggable: until STORY-45 the server denies every one; STORY-45 asks the
 * user in the chat. `signal` aborts when the turn is stopped.
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
}
