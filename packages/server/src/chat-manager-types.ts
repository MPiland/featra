/** The session manager's interface and its dependencies (ADR 0018); `chat-manager.ts` builds it. */
import type {
  Answers,
  ApprovalAnswer,
  ChatControlState,
  ChatEvent,
  ChatSummary,
  Inbox,
  InboxItem,
  ModeInfo,
  ProviderInfo,
  SettingsChange,
  TitleBy,
} from "@featra/work-format";
import type { StoryStartOpts } from "./chat-stories.ts";
import type { ChatStore } from "./chat-store.ts";
import type { Timers } from "./inbox.ts";
import type { ApprovalHandler, McpServerSpec, ProviderAdapter } from "./provider.ts";
import type { RoleRegistry } from "./role-registry.ts";

/** What gives a chat's agent the Featra MCP, and takes it back when the agent ends (STORY-47). */
export interface McpAttach {
  /** The MCP for the chat's agent, or null when its project turned it off. */
  attach: (chat: { id: string; dir: string }) => Promise<McpServerSpec | null>;
  release: (chat: string) => void;
}

export interface ChatManager {
  /**
   * Starts a story's agent as a chat in its worktree (STORY-9, ADR 0025), now or Queued when the project is at its
   * limit. Refused for a role whose provider has no runner for story sessions.
   */
  startStory: (opts: StoryStartOpts) => Promise<{ chat: string; queued: boolean }>;
  /** Whether a session for the story is waiting for a free slot. */
  queuedStory: (dir: string, story: string) => boolean;
  /** Starts a chat from a role in the project folder, on a card when it is for one; its agent starts with the first message. */
  start: (dir: string, roleId: string, card?: string) => Promise<string>;
  /** Readies a chat to watch and send to: a restored chat reads its transcript from its provider, running no agent. */
  open: (id: string) => Promise<void>;
  /**
   * The chat's log so far, the mode and note its role gave it (null before its agent is made), and every later event to
   * `listener` until `stop`.
   */
  watch: (
    id: string,
    listener: (event: ChatEvent) => void,
  ) => { events: ChatEvent[]; mode: ModeInfo | null; note: string | null; stop: () => void };
  /** The chat's composer controls under its provider's own names, and the settings it runs with (STORY-22). */
  controls: (id: string) => Promise<ChatControlState>;
  /**
   * Changes the chat's role, model, effort or permission mode from its next turn: a turn that is running goes on as it
   * was. A new role brings its own model, effort and mode, and the rest of the change is applied over them. Refused
   * for a value the chat's provider doesn't offer.
   */
  configure: (id: string, change: SettingsChange) => Promise<ChatControlState>;
  /**
   * Renames a chat (STORY-49). A draft renames its chat to the feature's title, never over a name the user set; the
   * user's own name replaces anything. Pushes the list and saves.
   */
  retitle: (id: string, title: string, by: TitleBy) => void;
  send: (id: string, text: string) => void;
  /** Interrupts the running turn, if any. */
  stop: (id: string) => Promise<void>;
  /** The user's answer to a tool request the chat waits on (STORY-45); refused when it isn't waiting. */
  approve: (id: string, tool: string, answer: ApprovalAnswer) => void;
  /** The user's answers to a question the chat waits on (STORY-46); refused when it isn't waiting or isn't answered. */
  answer: (id: string, tool: string, answers: Answers) => void;
  /** The chat's project folder, or null when there is no such chat. */
  dirOf: (id: string) => string | null;
  /** An open chat's working folder and how its entries name it as their session, or null when it isn't open. */
  info: (id: string) => {
    dir: string;
    /** The folder its agent works in: its worktree for a story session, else `dir`. */
    cwd?: string;
    session: string;
    story?: boolean;
    storyId?: string;
    /** A story session's Dev Lead: the chat it nests under. */
    lead?: string | null;
  } | null;
  /** Adds an event the chat's server-side tools produced (STORY-47) to an open chat's log; nothing for any other. */
  report: (id: string, event: ChatEvent) => void;
  /** The project's chats as the list shows them, oldest first. */
  list: (dir: string) => ChatSummary[];
  /**
   * The project's chats now, and the whole list again to `listener` each time a row changes or a chat comes or goes,
   * until `stop`. A streamed reply doesn't change a row, so it doesn't call it.
   */
  watchList: (dir: string, listener: (chats: ChatSummary[]) => void) => { chats: ChatSummary[]; stop: () => void };
  /**
   * The project's approvals and questions that have waited at least `wait` ms on the server's clock (STORY-7), and the
   * whole Inbox again to `listener` each time that changes, until `stop`.
   */
  watchInbox: (
    dir: string | null,
    wait: number,
    listener: (inbox: Inbox) => void,
  ) => { inbox: Inbox; stop: () => void };
  /** Calls `listener` with each request a chat of the project asks, as it is asked, whatever the wait; returns the stop. */
  watchAsked: (dir: string | null, listener: (item: InboxItem) => void) => () => void;
  /** Every provider the manager runs, and whether its agent is installed. */
  providers: () => Promise<ProviderInfo[]>;
  /**
   * Ends the chats of every project `keep` turns down (a project the user closed): no more events, no more turns.
   * They stay saved, and come back when `keep` takes their project again.
   */
  closeProjects: (keep: (dir: string) => boolean) => void;
  close: () => void;
  /** Resolves once every change so far is saved. */
  flush: () => Promise<void>;
  /** Resolves once the saved chats are read, so a list holds them. */
  ready: () => Promise<void>;
}

export interface ChatManagerDeps {
  providers: readonly ProviderAdapter[];
  roles: RoleRegistry;
  /** Decides each tool call that needs approval; by default the user, in the chat (the approval desk). */
  approve?: ApprovalHandler;
  newId?: () => string;
  /** The clock a chat's start is stamped with. */
  now?: () => Date;
  log?: (message: string) => void;
  /** Gives each agent the Featra MCP (STORY-47); none by default. */
  mcp?: McpAttach;
  /** Where chats are saved; nowhere by default. */
  store?: ChatStore;
  /** The timers the Inbox waits on; the real ones by default. */
  timers?: Timers;
  /** The most story sessions a project runs at once (STORY-9); 3 by default. */
  storyLimit?: (dir: string) => Promise<number>;
  /** Whose rule project folders compare by (`projectKey`); this machine's by default. */
  platform?: string;
}
