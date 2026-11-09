import { normalizeInboxItem, type InboxItem } from "@featra/work-format";

/** What the notifier needs from Electron and the app, so its rules run in tests without either. */
export interface NotifierDeps {
  /** Settings > General > Notifications, as it is now. */
  enabled: () => boolean;
  /** Featra's window is in front: visible, and the one the user is at. */
  focused: () => boolean;
  /** Shows a desktop notification; `click` runs when the user clicks it. */
  show: (notification: { title: string; body: string; click: () => void }) => void;
  /** Brings Featra's window back and opens the chat in it. */
  open: (chat: string) => void;
}

export interface Notifier {
  /** The page says a request has just arrived (not past the Inbox wait). Anything that isn't one is ignored. */
  asked: (raw: unknown) => void;
}

/** The notification's one line: which chat, and what it needs. */
export function notificationBody(item: InboxItem): string {
  const { request } = item;
  return request.type === "approval"
    ? `${item.chatName}: approve ${request.name}`
    : `${item.chatName}: a question for you`;
}

/**
 * Desktop notifications for the requests that arrive (STORY-7): one as soon as it arrives, when notifications are on and
 * Featra isn't focused. Clicking it opens the chat. The page is not trusted: the item is read again here.
 */
export function createNotifier({ enabled, focused, show, open }: NotifierDeps): Notifier {
  return {
    asked(raw) {
      const item = normalizeInboxItem(raw);
      if (!item || !enabled() || focused()) return;
      show({ title: "Featra", body: notificationBody(item), click: () => open(item.chat) });
    },
  };
}
