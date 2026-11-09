import { useEffect, useState } from "react";
import { EMPTY_INBOX, type Inbox } from "@featra/work-format/inbox";
import type { InboxBridge, NotificationsBridge } from "../../inbox.ts";

/**
 * The project's Inbox at `waitMs`, as the server last sent it; empty without a project. A new wait starts a new watch
 * and keeps the list until the server answers, so a changed setting doesn't flash it empty.
 */
export function useInbox(inbox: InboxBridge, dir: string | null, waitMs: number): Inbox {
  const [state, setState] = useState<{ dir: string | null; inbox: Inbox }>({ dir, inbox: EMPTY_INBOX });
  useEffect(() => {
    // A dropped connection keeps the last list: the watch starts again and sends a fresh one.
    return dir ? inbox.watch(dir, waitMs, (update) => setState({ dir, inbox: update.inbox })) : undefined;
  }, [inbox, dir, waitMs]);
  // Another project's requests never show, even for the moment before its own list arrives.
  return state.dir === dir && dir ? state.inbox : EMPTY_INBOX;
}

/**
 * Hands the host each request the project's chats ask as it is asked (it decides whether to notify), and opens the chat
 * a clicked notification names.
 */
export function useNotifications(
  inbox: InboxBridge,
  notifications: NotificationsBridge,
  dir: string | null,
  openChat: (chat: string) => void,
): void {
  useEffect(
    () => (dir ? inbox.asked(dir, (item) => notifications.asked(item)) : undefined),
    [inbox, notifications, dir],
  );
  useEffect(() => notifications.onOpenChat(openChat), [notifications, openChat]);
}
