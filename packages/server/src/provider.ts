/**
 * The provider adapter seam (ADR 0018): how the session manager runs an agent without knowing which one. The Claude
 * adapter is the only one in M1; Codex and ACP agents (M2) implement the same interface.
 */
import type {
  Answers,
  ChatControls,
  ChatEvent,
  ChatSettings,
  ProviderId,
  Question,
  Role,
  TurnOutcome,
} from "@featra/work-format";

/**
 * A rule the provider suggests for Allow for this chat (ADR 0018): an optional adapter capability. The provider applies
 * `rule` for the rest of its session and matches later calls itself; Featra passes it back untouched and only shows
 * `covers`. Without one, Featra's own rule (`chatRule`) applies.
 */
export interface SuggestedRule {
  rule: unknown;
  covers: string;
}

/** A tool call the agent wants to make, as the approval handler sees it. */
export interface ToolRequest {
  /** The chat it came from. */
  chat: string;
  /** The chat's working folder, for rules on paths. */
  cwd: string;
  /** The provider's id for this call: the tool row it belongs to. */
  id: string;
  name: string;
  input: Record<string, unknown>;
  /** False when the agent says the call may only be allowed once: no Allow for this chat covers or comes from it. */
  forChat?: boolean;
  /** The provider's own rule for Allow for this chat on this call, when it has one. */
  suggested?: SuggestedRule;
  /** The label of the subagent the call is from, when the session's own subagent asks (STORY-55). */
  subagent?: string;
}

/** A request the agent is told no to. `interrupt` tells it to stop its turn rather than try another step (Stop, the chat ending). */
export interface Refusal {
  allow: false;
  message: string;
  interrupt?: boolean;
}

/** `rule` on an allow is the provider's suggested rule the user chose Allow for this chat for: the provider applies it. */
export type ToolDecision = { allow: true; input: Record<string, unknown>; rule?: unknown } | Refusal;

/** Questions the agent asks the user to choose from (STORY-46), as the question handler sees them. */
export interface QuestionRequest {
  /** The chat it came from. */
  chat: string;
  /** The provider's id for this call: the row it belongs to. */
  id: string;
  name: string;
  questions: Question[];
  /** The label of the subagent that asks, when the session's own subagent does (STORY-55). */
  subagent?: string;
}

/** The user's answers, each question answered as it asks; or why the agent is told no (Stop, the chat ending). */
export type QuestionDecision = { allow: true; answers: Answers } | Refusal;

/**
 * Asks the user the agent's questions: by default the approval desk shows them in the chat and holds them until
 * answered. `signal` aborts as for an `ApprovalHandler`.
 */
export type QuestionHandler = (request: QuestionRequest, signal: AbortSignal) => Promise<QuestionDecision>;

/**
 * Decides a tool call that needs approval: by default the approval desk asks the user in the chat (STORY-45). `signal`
 * aborts when the turn is stopped or the chat's agent ends, and the request ends unanswered.
 */
export type ApprovalHandler = (request: ToolRequest, signal: AbortSignal) => Promise<ToolDecision>;

/**
 * A local stdio MCP server the agent is given for its session (STORY-47): Featra's own. Provider neutral: each
 * adapter attaches it its own way (Claude's `mcpServers`), so Codex later takes the same description.
 */
export interface McpServerSpec {
  /** The server's name, which an agent sees in its tools' names (Claude: `mcp__featra__log_decision`). */
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

/**
 * What a session reports of the subagents it spawns for itself (STORY-55), under an id of the provider's that is
 * stable for the subagent's life. Provider neutral: each adapter turns its own stream into these, and the session manager
 * shows each subagent as a read-only transcript nested under the session.
 */
export type SubagentEvent =
  /** A subagent started, or one that ended started again (a resumed task). `stoppable` says `stopSubagent` can end it alone now. */
  | { type: "started"; id: string; label: string; kind: string | null; stoppable: boolean }
  /** `stoppable` changed (a foreground subagent moved to the background), or its announcement came after its messages and says what it is. */
  | { type: "updated"; id: string; stoppable: boolean; label?: string; kind?: string | null }
  /** One event of the subagent's own transcript. */
  | { type: "event"; id: string; event: ChatEvent }
  /** The subagent ended on its own, was stopped, or its agent went away with it. */
  | { type: "ended"; id: string; outcome: TurnOutcome };

export interface SessionOptions {
  chat: string;
  /** The project folder: the agent's working directory. */
  cwd: string;
  role: Role;
  /** Asked before each tool that needs approval. */
  approve: (request: Omit<ToolRequest, "chat" | "cwd">, signal: AbortSignal) => Promise<ToolDecision>;
  /** Asked when the agent asks the user to choose (STORY-46). */
  ask: (request: Omit<QuestionRequest, "chat">, signal: AbortSignal) => Promise<QuestionDecision>;
  /** Hears each event of the agent's stream, in order. */
  emit: (event: ChatEvent) => void;
  /** Hears the subagents the agent spawns for itself (STORY-55); an adapter without subagents never calls it. */
  subagent?: (event: SubagentEvent) => void;
  /**
   * The Featra MCP for this session, asked for when the agent starts; null when the project turned it off. The adapter
   * attaches it, and lets the agent call its tools without asking: they only log (ADR 0019).
   */
  mcp?: () => Promise<McpServerSpec | null>;
  /** The provider's session to go on with (a restored chat, STORY-44); a new conversation without it. */
  resume?: string | null;
  /**
   * The allow rules a Dev Lead chat had when it started this story session (STORY-9, ADR 0025): the provider's own
   * rules, as `ToolDecision.rule` gave them, applied for the whole session so it doesn't ask again for what the
   * parent was already allowed.
   */
  inherited?: readonly unknown[];
}

/**
 * Where a provider keeps the worktrees of its story sessions (STORY-9, ADR 0025): an optional adapter capability. An
 * adapter without it has no runner for stories, and a spawn on its roles is refused.
 */
export interface WorktreeSpot {
  /** The folder of the worktree named `name` for the repository at `repo`. */
  folder: (repo: string, name: string) => string;
  /** The pattern the repository's `.git/info/exclude` gets so the folder isn't seen as changes; null when it needs none. */
  ignore: string | null;
}

/** One agent conversation. The agent starts with the first message. */
export interface ProviderSession {
  /** Sends the user's message, starting the agent first if it isn't running. */
  send: (text: string) => void;
  /**
   * Resolves once the agent the last `send` asked for is running, or has failed to start (BUG-15). A story is "started"
   * only then. Absent, the adapter's agent starts at once.
   */
  started?: () => Promise<void>;
  /**
   * Changes what the agent runs as from its next turn (STORY-22): the role (its prompt), and the provider's own names
   * for model, effort and permission mode. A turn already running goes on as it was. How the provider applies it is its
   * own: the Claude adapter replaces the agent and resumes the session.
   */
  configure: (role: Role, settings: ChatSettings) => void;
  /** Ends the running turn; the agent keeps its conversation for the next message. */
  interrupt: () => Promise<void>;
  /**
   * Ends one subagent without ending the turn (STORY-55): an optional capability, present only where the provider can
   * (Claude background subagents). A subagent's `stoppable` is true only while it can be. Its end comes as `ended`.
   */
  stopSubagent?: (id: string) => Promise<void>;
  /** An ended subagent was archived: the adapter forgets it (STORY-55). */
  forgetSubagent?: (id: string) => void;
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
   * Whether a stopped session goes on in the same provider session, with its transcript (STORY-53): the adapter takes a
   * message for the session after `interrupt`, and `SessionOptions.resume` after a restart. Absent, Resume is refused.
   */
  resumes?: true;
  /** Where its story sessions' worktrees live; absent when the adapter can't run story sessions (STORY-9). */
  worktrees?: WorktreeSpot;
  /** What the composer can pick for a chat from `role`, under the provider's own names (STORY-22). */
  controls: (role: Role) => ChatControls;
  /** The settings a chat from `role` starts with. */
  settings: (role: Role) => ChatSettings;
  /**
   * A session's transcript as chat events, read from the provider's own record of it without running the agent (no
   * tokens), or null when the provider no longer has the session (STORY-44).
   */
  history: (session: string, cwd: string) => Promise<ChatEvent[] | null>;
}
