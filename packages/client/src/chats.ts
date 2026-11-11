/**
 * The chat bridge (ADR 0018): start a chat from a role, watch its log folded into what the view shows, send and stop.
 * The session itself runs in the local server; this module holds the bridge's shape, its wording, and how the client
 * calls the server.
 */
import type { ApprovalAnswer } from "@featra/work-format/approvals";
import type { Answers } from "@featra/work-format/questions";
import {
  foldChat,
  reduceChat,
  EMPTY_CHAT,
  type ChatItem,
  type ChatNotice,
  type ChatState,
} from "@featra/work-format/chat";
import { normalizeChatEvent, normalizeChatSnapshot, type ChatEvent } from "@featra/work-format/chat-events";
import { normalizeControlState, type ChatControlState, type SettingsChange } from "@featra/work-format/chat-controls";
import { EMPTY_CHAT_LIST, normalizeChatList, type ChatList, type ChatRoleRef } from "@featra/work-format/chat-list";
import { assertNever, errorMessage, isRecord } from "@featra/work-format/guards";
import type { ModeInfo } from "@featra/work-format/modes";
import { normalizeRoles, type Role } from "@featra/work-format/roles";
import type { ServerClient } from "./server-client.ts";

export type { ChatList, ChatRoleRef, ChatState, Role };

/** What a watch hears: the chat so far, and why it is out of date when it is. */
export interface ChatUpdate {
  chat: ChatState;
  error: string | null;
  /** The mode a provider setting started the chat in (STORY-6); absent means Ask. */
  mode?: ModeInfo;
  /** One line on how the chat's role was adjusted to run, such as a model Claude doesn't have. */
  note?: string;
}

/** What a chat-list watch hears: the project's chats, and why the list is out of date when it is. */
export interface ChatListUpdate {
  list: ChatList;
  error: string | null;
}

export type ChatStart = { ok: true; id: string } | { ok: false; error: string };

/** A chat's controls and settings, or why they couldn't be had (STORY-22). */
export type ChatControlsResult = { ok: true; state: ChatControlState } | { ok: false; error: string };

export interface ChatBridge {
  /** The roles a chat in the project can start from. */
  roles: (dir: string) => Promise<Role[]>;
  /** Starts a chat from a role, on a card when it is for one (STORY-7: the Inbox names the card). */
  start: (dir: string, role: string, card?: string) => Promise<ChatStart>;
  /** Calls back with the chat now and on every change; returns the stop. */
  watch: (id: string, listener: (update: ChatUpdate) => void) => () => void;
  /** Sends a message; resolves with why it wasn't sent, or null. */
  send: (id: string, text: string) => Promise<string | null>;
  /** Interrupts the running turn; resolves with why it couldn't, or null. */
  stop: (id: string) => Promise<string | null>;
  /** Answers a tool request the chat waits on; resolves with why it wasn't taken, or null. */
  approve: (id: string, tool: string, answer: ApprovalAnswer) => Promise<string | null>;
  /** Answers a question the chat waits on (STORY-46); resolves with why it wasn't taken, or null. */
  answer: (id: string, tool: string, answers: Answers) => Promise<string | null>;
  /** Takes back an entry the agent logged (STORY-47); resolves with why it couldn't, or null. */
  undoLog: (id: string, entry: string) => Promise<string | null>;
  /** What the composer can change for the chat, and what it runs with now. */
  controls: (id: string) => Promise<ChatControlsResult>;
  /** Changes the chat's role, model, effort or mode from the next turn; answers the settings now, or why not. */
  configure: (id: string, change: SettingsChange) => Promise<ChatControlsResult>;
  /** Calls back with the project's chat list now and on every change; returns the stop. */
  list: (dir: string, listener: (update: ChatListUpdate) => void) => () => void;
}

export const CHAT_COPY = {
  newChat: "New chat",
  /** The File menu's item, in the menu's Title Case. */
  newChatMenu: "New Chat",
  chats: "Chats",
  waiting: "Waiting for you",
  queued: "Queued",
  askedFor: (story: string) => `Asked by the session of ${story}`,
  storySessions: (lead: string) => `Story sessions of ${lead}`,
  roles: "Roles",
  noRoles: "No roles to start from.",
  ask: "Ask",
  composer: "Message",
  placeholder: "Message the agent",
  send: "Send",
  stop: "Stop",
  transcript: "Chat",
  working: "Working…",
  thinking: "Thinking",
  watching: "Watching the story's agent. The Dev Lead steers it.",
  denied: "Denied",
  toolStopped: "Stopped",
  cancelled: "Cancelled",
  needsApproval: "Needs approval",
  allowed: "Allowed",
  allowedForChat: "Allowed for this chat",
  approve: "Approve",
  allow: "Allow",
  allowForChat: "Allow for this chat",
  deny: "Deny",
  denyReason: "Reason",
  denyReasonHint: "Reason (optional)",
  question: "Question",
  needsAnswer: "Needs answer",
  answered: "Answered",
  submit: "Submit",
  other: "Other",
  input: "Input",
  result: "Result",
  noResult: "No result yet.",
  notInstalled: "Claude Code isn't installed.",
  loggedOut: "Claude Code isn't logged in. Run claude in a terminal to log in.",
  stopped: "Stopped.",
  gone: "This chat's history is gone.",
  loggedTo: "Logged to",
  undo: "Undo",
  undone: "Undone",
  role: "Role",
  model: "Model",
  effort: "Effort",
  mode: "Mode",
  context: "Context",
  fullAccess: "full access",
} as const;

/** The state a server answered, read; or why it was unusable. */
function controlsResult(raw: unknown): ChatControlsResult {
  const state = normalizeControlState(raw);
  return state ? { ok: true, state } : { ok: false, error: "No settings." };
}
const controlsFailed = (err: unknown): ChatControlsResult => ({ ok: false, error: errorMessage(err) });

/** The one line a notice shows. */
export function noticeText(notice: ChatNotice): string {
  switch (notice.type) {
    case "not-installed":
      return CHAT_COPY.notInstalled;
    case "logged-out":
      return CHAT_COPY.loggedOut;
    case "stopped":
      return CHAT_COPY.stopped;
    case "failed":
      return notice.message;
    case "gone":
      return CHAT_COPY.gone;
    default:
      return assertNever(notice);
  }
}

/** The mark a tool row's head shows: where its approval stands, or how it ended unanswered; null for none. */
export function toolMark(item: Extract<ChatItem, { kind: "tool" }>): string | null {
  if (item.denied) return CHAT_COPY.denied;
  if (item.stopped) return CHAT_COPY.toolStopped;
  if (item.cancelled) return CHAT_COPY.cancelled;
  if (item.approval?.status === "pending") return CHAT_COPY.needsApproval;
  if (item.approval?.status === "allowed")
    return item.approval.scope === "chat" ? CHAT_COPY.allowedForChat : CHAT_COPY.allowed;
  return null;
}

/** The bridge's chat methods over the server client. */
export function serverChats(server: ServerClient): ChatBridge {
  return {
    roles: (dir) => server.call("chat.roles", { dir }).then(normalizeRoles),
    start: (dir, role, card) =>
      server.call("chat.start", { dir, role, ...(card ? { card } : {}) }).then(
        (r): ChatStart =>
          isRecord(r) && typeof r.id === "string" ? { ok: true, id: r.id } : { ok: false, error: "No chat id." },
        (err: unknown): ChatStart => ({ ok: false, error: errorMessage(err) }),
      ),
    watch(id, listener) {
      let chat = EMPTY_CHAT;
      // The answer is the whole log (again, after a reconnect); each push is one later event. A push can beat the
      // answer, so until the answer comes, pushes wait to go after the log.
      let early: ChatEvent[] | null = [];
      let start: Pick<ChatUpdate, "mode" | "note"> = {};
      return server.watch(
        "chat.watch",
        { id },
        {
          data: (raw) => {
            // A push is one event (it has a type); a malformed one is dropped, never read as a whole new log.
            if (isRecord(raw) && "type" in raw) {
              const event = normalizeChatEvent(raw);
              if (event && early) early.push(event);
              else if (event) {
                chat = reduceChat(chat, event);
                listener({ chat, error: null, ...start });
              }
            } else {
              const snapshot = normalizeChatSnapshot(raw);
              start = {
                ...(snapshot.mode ? { mode: snapshot.mode } : {}),
                ...(snapshot.note ? { note: snapshot.note } : {}),
              };
              chat = foldChat([...snapshot.events, ...(early ?? [])]);
              early = null;
              listener({ chat, error: null, ...start });
            }
          },
          error: (message) => {
            early = [];
            listener({ chat, error: message, ...start });
          },
        },
      );
    },
    send: (id, text) => server.call("chat.send", { id, text }).then(() => null, errorMessage),
    stop: (id) => server.call("chat.stop", { id }).then(() => null, errorMessage),
    approve: (id, tool, answer) => server.call("chat.approve", { id, tool, ...answer }).then(() => null, errorMessage),
    answer: (id, tool, answers) => server.call("chat.answer", { id, tool, answers }).then(() => null, errorMessage),
    undoLog: (id, entry) => server.call("chat.undoLog", { id, entry }).then(() => null, errorMessage),
    controls: (id) => server.call("chat.controls", { id }).then(controlsResult, controlsFailed),
    configure: (id, change) => server.call("chat.configure", { id, change }).then(controlsResult, controlsFailed),
    list(dir, listener) {
      let list = EMPTY_CHAT_LIST;
      return server.watch(
        "chat.list",
        { dir },
        {
          data: (raw) => {
            list = normalizeChatList(raw);
            listener({ list, error: null });
          },
          error: (message) => listener({ list, error: message }),
        },
      );
    },
  };
}

/** A browser tab has no folders, so no chats. */
export function noChats(error: string): ChatBridge {
  return {
    roles: async () => [],
    start: async () => ({ ok: false, error }),
    watch(_id, listener) {
      listener({ chat: EMPTY_CHAT, error });
      return () => {};
    },
    send: async () => error,
    stop: async () => error,
    approve: async () => error,
    answer: async () => error,
    undoLog: async () => error,
    controls: async () => ({ ok: false, error }),
    configure: async () => ({ ok: false, error }),
    // No chats is the whole truth here, not an out-of-date list.
    list(_dir, listener) {
      listener({ list: EMPTY_CHAT_LIST, error: null });
      return () => {};
    },
  };
}
