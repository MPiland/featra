import { useEffect, useState } from "react";
import { EMPTY_INBOX, type Inbox } from "@featra/work-format/inbox";
import type { InboxBridge, NotificationsBridge } from "../../inbox.ts";

/**
 * The Inbox of every open project at `waitMs`, as the server last sent it; empty while `on` is false (no project). A new
 * wait starts a new watch and keeps the list until the server answers, so a changed setting doesn't flash it empty.
 * What a watch that has been replaced still sends is ignored, so a late push at the old wait can't show.
 */
export function useInbox(inbox: InboxBridge, on: boolean, waitMs: number): Inbox {
  const [current, setCurrent] = useState<Inbox>(EMPTY_INBOX);
  useEffect(() => {
    if (!on) return undefined;
    let live = true;
    // A dropped connection keeps the last list: the watch starts again and sends a fresh one.
    const stop = inbox.watch(null, waitMs, (update) => live && setCurrent(update.inbox));
    return () => {
      live = false;
      stop();
    };
  }, [inbox, on, waitMs]);
  return on ? current : EMPTY_INBOX;
}

/**
 * Hands the host each request any project's chats ask as it is asked (it decides whether to notify), and opens the chat
 * a clicked notification names, in its project.
 */
export function useNotifications(
  inbox: InboxBridge,
  notifications: NotificationsBridge,
  on: boolean,
  openChat: (chat: string, project?: string) => void,
): void {
  useEffect(
    () => (on ? inbox.asked(null, (item) => notifications.asked(item)) : undefined),
    [inbox, notifications, on],
  );
  useEffect(() => notifications.onOpenChat(openChat), [notifications, openChat]);
}
