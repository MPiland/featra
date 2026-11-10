// The local server's Inbox side, as a fake: the requests its chats ask, held with when they were asked on a clock the
// test moves by hand. Which are due, and what an answer closes, are work-format's real rules (`dueItems`, `nextAsks`
// through the chat row); only the clock and the socket are faked.
import { act } from "react";
import { dueItems, type Ask, type ChatEvent, type InboxItem, type PendingAsk } from "@featra/work-format";
import type { InboxBridge, InboxUpdate } from "../src/inbox.ts";

/** What the Inbox shows of the chat a request belongs to. */
export interface ChatFacts {
  id: string;
  dir: string;
  chatName: string;
  card?: string;
}

interface Watcher {
  /** The project watched, or null for every one. */
  dir: string | null;
  wait: number;
  listener: (u: InboxUpdate) => void;
  /** The requests last sent, so a push comes only when they change. */
  sent: string | null;
}

const keyOf = (chat: string, ask: string) => `${chat}:${ask}`;

export function fakeInboxServer() {
  /** Each watch opened, with its wait: a changed setting shows as a new one. */
  const watches: { dir: string | null; wait: number }[] = [];
  let now = 0;
  const held = new Map<string, PendingAsk & { dir: string }>();
  const watchers = new Set<Watcher>();
  const askedListeners = new Set<{ dir: string | null; listener: (item: InboxItem) => void }>();
  const itemsOf = (w: Watcher) =>
    dueItems(
      [...held.values()].filter((p) => w.dir === null || p.dir === w.dir),
      w.wait,
      now,
    );
  const send = (w: Watcher) => {
    const items = itemsOf(w);
    const ids = items.map((i) => keyOf(i.chat, i.request.id)).join();
    if (ids === w.sent) return;
    w.sent = ids;
    w.listener({ inbox: { items }, error: null });
  };
  const bridge: InboxBridge = {
    watch(dir, wait, listener) {
      watches.push({ dir, wait });
      const w: Watcher = { dir, wait, listener, sent: null };
      watchers.add(w);
      queueMicrotask(() => watchers.has(w) && send(w));
      return () => void watchers.delete(w);
    },
    asked(dir, listener) {
      const entry = { dir, listener };
      askedListeners.add(entry);
      return () => void askedListeners.delete(entry);
    },
  };
  return {
    bridge,
    /** A chat recorded `event`; `open` are the requests it still waits on after it. */
    heard(chat: ChatFacts, event: ChatEvent, open: readonly Ask[]) {
      if (event.type === "approval" || event.type === "question") {
        const base = {
          chat: chat.id,
          chatName: chat.chatName,
          ...(chat.card ? { card: chat.card } : {}),
          project: chat.dir,
        };
        held.set(keyOf(chat.id, event.id), { ...base, request: event, at: now, dir: chat.dir });
        const since = new Date(now).toISOString();
        for (const l of askedListeners)
          if (l.dir === null || l.dir === chat.dir) l.listener({ ...base, request: event, since });
      }
      const stillOpen = new Set(open.map((a) => keyOf(chat.id, a.id)));
      for (const [key, p] of held) if (p.chat === chat.id && !stillOpen.has(key)) held.delete(key);
      for (const w of watchers) send(w);
    },
    /** The server's clock moves on; what has now waited long enough comes to the Inbox. */
    advance: (ms: number) =>
      act(() => {
        now += ms;
        for (const w of watchers) send(w);
      }),
    watching: () => watchers.size,
    watches,
  };
}
