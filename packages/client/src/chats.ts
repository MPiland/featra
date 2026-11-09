/**
 * The chat bridge (ADR 0018): start a chat from a role, watch its log folded into what the view shows, send and stop.
 * The session itself runs in the local server; this module holds the bridge's shape, its wording, and how the client
 * calls the server.
 */
import { foldChat, reduceChat, EMPTY_CHAT, type ChatNotice, type ChatState } from "@featra/work-format/chat";
import { normalizeChatEvent, normalizeChatSnapshot, type ChatEvent } from "@featra/work-format/chat-events";
import { assertNever, errorMessage, isRecord } from "@featra/work-format/guards";
import { normalizeRoles, type Role } from "@featra/work-format/roles";
import type { ServerClient } from "./server-client.ts";

export type { ChatState, Role };

/** What a watch hears: the chat so far, and why it is out of date when it is. */
export interface ChatUpdate {
  chat: ChatState;
  error: string | null;
}

export type ChatStart = { ok: true; id: string } | { ok: false; error: string };

export interface ChatBridge {
  /** The roles a chat in the project can start from. */
  roles: (dir: string) => Promise<Role[]>;
  start: (dir: string, role: string) => Promise<ChatStart>;
  /** Calls back with the chat now and on every change; returns the stop. */
  watch: (id: string, listener: (update: ChatUpdate) => void) => () => void;
  /** Sends a message; resolves with why it wasn't sent, or null. */
  send: (id: string, text: string) => Promise<string | null>;
  /** Interrupts the running turn. */
  stop: (id: string) => Promise<void>;
}

export const CHAT_COPY = {
  newChat: "New chat",
  roles: "Roles",
  noRoles: "No roles to start from.",
  ask: "Ask",
  composer: "Message",
  placeholder: "Message the agent",
  send: "Send",
  stop: "Stop",
  transcript: "Chat",
  working: "Working…",
  denied: "Denied",
  input: "Input",
  result: "Result",
  noResult: "No result yet.",
  notInstalled: "Claude Code isn't installed. Install it, then start a new chat.",
  loggedOut: "Claude Code isn't logged in. Log in from a terminal with claude, then try again.",
  stopped: "Stopped.",
} as const;

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
    default:
      return assertNever(notice);
  }
}

/** The bridge's chat methods over the server client. */
export function serverChats(server: ServerClient): ChatBridge {
  return {
    roles: (dir) => server.call("chat.roles", { dir }).then(normalizeRoles),
    start: (dir, role) =>
      server.call("chat.start", { dir, role }).then(
        (r): ChatStart =>
          isRecord(r) && typeof r.id === "string" ? { ok: true, id: r.id } : { ok: false, error: "No chat id." },
        (err: unknown): ChatStart => ({ ok: false, error: errorMessage(err) }),
      ),
    watch(id, listener) {
      let chat = EMPTY_CHAT;
      // The answer is the whole log (again, after a reconnect); each push is one later event. A push can beat the
      // answer, so until the answer comes, pushes wait to go after the log.
      let early: ChatEvent[] | null = [];
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
                listener({ chat, error: null });
              }
            } else {
              chat = foldChat([...normalizeChatSnapshot(raw).events, ...(early ?? [])]);
              early = null;
              listener({ chat, error: null });
            }
          },
          error: (message) => {
            early = [];
            listener({ chat, error: message });
          },
        },
      );
    },
    send: (id, text) =>
      server.call("chat.send", { id, text }).then(
        () => null,
        (err: unknown) => errorMessage(err),
      ),
    stop: (id) => server.call("chat.stop", { id }).then(() => undefined),
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
    stop: async () => {},
  };
}
