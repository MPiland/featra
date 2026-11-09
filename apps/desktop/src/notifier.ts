import { normalizeInboxItem, type InboxItem } from "@featra/work-format";

/** What the notifier needs from Electron and the app, so its rules run in tests without either. */
export interface NotifierDeps {
  /** Settings > General > Notifications, as it is now. */
  enabled: () => boolean;
  /** Featra's window is in front: visible, and the one the user is at. */
  focused: () => boolean;
  /** Shows a desktop notification; `click` runs when the user clicks it. Returns a way to close it, when it has one. */
  show: (notification: { title: string; body: string; click: () => void }) => { close: () => void } | void;
  /** Brings Featra's window back and opens the chat in it, in `project` when the request says which. */
  open: (chat: string, project?: string) => void;
}

export interface Notifier {
  /** The page says a request has just arrived (not past the Inbox wait). Anything that isn't one is ignored. */
  asked: (raw: unknown) => void;
}

/** The notification's one line: which chat, and what it needs. */
export function notificationBody(item: InboxItem): string {
  const { request } = item;
  if (request.type === "approval") return `${item.chatName}: approve ${request.name}`;
  const ask = request.questions[0]?.question ?? "";
  return `${item.chatName}: ${ask.length > MAX_ASK ? `${ask.slice(0, MAX_ASK - 1).trimEnd()}…` : ask}`;
}

/** How much of a question the notification quotes. */
const MAX_ASK = 80;

/**
 * Desktop notifications for the requests that arrive (STORY-7): one as soon as it arrives, when notifications are on and
 * Featra isn't focused. Clicking it opens the chat. The page is not trusted: the item is read again here.
 */
export function createNotifier({ enabled, focused, show, open }: NotifierDeps): Notifier {
  // At most one notification per chat: a new request replaces the chat's last one rather than stacking beside it.
  const shown = new Map<string, { close: () => void }>();
  return {
    asked(raw) {
      const item = normalizeInboxItem(raw);
      if (!item || !enabled() || focused()) return;
      shown.get(item.chat)?.close();
      const toast = show({ title: "Featra", body: notificationBody(item), click: () => open(item.chat, item.project) });
      if (toast) shown.set(item.chat, toast);
      else shown.delete(item.chat);
    },
  };
}
