/** The session manager's interface and its dependencies (ADR 0018); `chat-manager.ts` builds it. */
import type { Answers, ApprovalAnswer, ChatEvent, ChatSummary, ProviderInfo } from "@featra/work-format";
import type { ChatStore } from "./chat-store.ts";
import type { ApprovalHandler, ProviderAdapter } from "./provider.ts";
import type { RoleRegistry } from "./role-registry.ts";

export interface ChatManager {
  /** Starts a chat from a role in the project folder; its agent starts with the first message. */
  start: (dir: string, roleId: string) => Promise<string>;
  /** Readies a chat to watch and send to: a restored chat reads its transcript from its provider, running no agent. */
  open: (id: string) => Promise<void>;
  /** The chat's log so far, and every later event to `listener` until `stop`. */
  watch: (id: string, listener: (event: ChatEvent) => void) => { events: ChatEvent[]; stop: () => void };
  send: (id: string, text: string) => void;
  /** Interrupts the running turn, if any. */
  stop: (id: string) => Promise<void>;
  /** The user's answer to a tool request the chat waits on (STORY-45); refused when it isn't waiting. */
  approve: (id: string, tool: string, answer: ApprovalAnswer) => void;
  /** The user's answers to a question the chat waits on (STORY-46); refused when it isn't waiting or isn't answered. */
  answer: (id: string, tool: string, answers: Answers) => void;
  /** The chat's project folder, or null when there is no such chat. */
  dirOf: (id: string) => string | null;
  /** The project's chats as the list shows them, oldest first. */
  list: (dir: string) => ChatSummary[];
  /**
   * The project's chats now, and the whole list again to `listener` each time a row changes or a chat comes or goes,
   * until `stop`. A streamed reply doesn't change a row, so it doesn't call it.
   */
  watchList: (dir: string, listener: (chats: ChatSummary[]) => void) => { chats: ChatSummary[]; stop: () => void };
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
  /** Where chats are saved; nowhere by default. */
  store?: ChatStore;
  /** Whose rule project folders compare by (`projectKey`); this machine's by default. */
  platform?: string;
}
