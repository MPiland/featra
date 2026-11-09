/**
 * The Inbox bridge (STORY-7): the approvals and questions that have waited on the user past the Inbox wait, and a
 * stream of each as it is asked, which the host turns into a desktop notification. Deciding is not here: the Inbox
 * answers through the chat bridge's `approve` and `answer`, so it is never a second way to decide.
 */
import { EMPTY_INBOX, normalizeInbox, normalizeInboxItem, type Inbox, type InboxItem } from "@featra/work-format/inbox";
import type { ServerClient } from "./server-client.ts";

export type { Inbox, InboxItem };

/** What an Inbox watch hears: the requests past the wait, and why the list is out of date when it is. */
export interface InboxUpdate {
  inbox: Inbox;
  error: string | null;
}

export interface InboxBridge {
  /** Calls back with the Inbox of the project (every open project when `dir` is null) at `waitMs` now and on every change; returns the stop. */
  watch: (dir: string | null, waitMs: number, listener: (update: InboxUpdate) => void) => () => void;
  /** Calls back with each request a chat of the project (any open project when `dir` is null) asks, as it is asked, whatever the wait; returns the stop. */
  asked: (dir: string | null, listener: (item: InboxItem) => void) => () => void;
}

/** What the page tells the host about the requests that arrive and what the host tells the page back. */
export interface NotificationsBridge {
  /** A request just arrived. The host notifies when the setting is on and Featra isn't focused. */
  asked: (item: InboxItem) => void;
  /** Calls back with the chat a clicked notification names, and its project; returns the stop. */
  onOpenChat: (listener: (chat: string, project?: string) => void) => () => void;
}

export const INBOX_COPY = {
  empty: "Nothing is waiting for you.",
  list: "Waiting for you",
  approval: "Approval",
  question: "Question",
  openChat: "Open chat",
  waiting: "waiting",
} as const;

/** The bridge's Inbox methods over the server client. */
export function serverInbox(server: ServerClient): InboxBridge {
  return {
    watch(dir, waitMs, listener) {
      let inbox = EMPTY_INBOX;
      return server.watch("inbox.watch", dir === null ? { waitMs } : { dir, waitMs }, {
        data: (raw) => {
          inbox = normalizeInbox(raw);
          listener({ inbox, error: null });
        },
        error: (message) => listener({ inbox, error: message }),
      });
    },
    asked(dir, listener) {
      return server.watch("inbox.asked", dir === null ? {} : { dir }, {
        // The answer to the watch is null; each push is one request.
        data: (raw) => {
          const item = normalizeInboxItem(raw);
          if (item) listener(item);
        },
        error: () => {},
      });
    },
  };
}

/** A browser tab has no folders, so nothing is waiting. */
export function noInbox(): InboxBridge {
  return {
    watch(_dir, _waitMs, listener) {
      listener({ inbox: EMPTY_INBOX, error: null });
      return () => {};
    },
    asked: () => () => {},
  };
}

export function noNotifications(): NotificationsBridge {
  return { asked() {}, onOpenChat: () => () => {} };
}
