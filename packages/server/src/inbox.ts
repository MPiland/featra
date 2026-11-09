/**
 * The Inbox (STORY-7): the approvals and questions chats wait on, kept with when each was asked on the server's clock.
 * Each is in its chat from the start; once it has waited as long as a watcher's wait it is in that watcher's Inbox too,
 * until it is answered or ends. Answering is the approval desk's, in the chat or from the Inbox alike: the Inbox only
 * hears the events that open and close a request, so it can't be a second way to decide.
 */
import {
  dueItems,
  nextDueIn,
  type Ask,
  type Inbox,
  type InboxItem,
  type InboxRequest,
  type PendingAsk,
} from "@featra/work-format";
import { tellAll } from "./chat-list-watch.ts";

/** The timers the Inbox sets: `setTimeout` and `clearTimeout`; tests give a clock they move by hand. */
export interface Timers {
  set: (run: () => void, ms: number) => unknown;
  clear: (timer: unknown) => void;
}

const live = new Map<number, ReturnType<typeof setTimeout>>();
let lastTimer = 0;
export const realTimers: Timers = {
  set(run, ms) {
    const id = ++lastTimer;
    live.set(
      id,
      setTimeout(() => {
        live.delete(id);
        run();
      }, ms),
    );
    return id;
  },
  clear(timer) {
    const handle = typeof timer === "number" ? live.get(timer) : undefined;
    if (typeof timer === "number") live.delete(timer);
    if (handle) clearTimeout(handle);
  },
};

/** What the Inbox needs to know of a chat when it shows one of its requests. */
export interface ChatFacts {
  dir: string;
  chatName: string;
  card?: string;
}

export interface InboxDeps {
  /** The server's clock, in milliseconds. */
  now: () => number;
  timers?: Timers;
  /** The chat as the list shows it now, or null when it is gone or closed. */
  chat: (id: string) => ChatFacts | null;
  /** Whether two project folders are the same project. */
  same: (a: string, b: string) => boolean;
  log: (message: string) => void;
}

export interface InboxHub {
  /** A chat asks the user for an approval or an answer. */
  opened: (chat: string, request: InboxRequest) => void;
  /** The chat's open requests are now `asks`: any other it held has ended (answered, cancelled, or its turn did). */
  keep: (chat: string, asks: readonly Ask[]) => void;
  /** The chat ended or was closed: it holds no requests. */
  ended: (chat: string) => void;
  /** The project's Inbox at `wait` ms, and again to `listener` whenever it changes, until `stop`. */
  watch: (dir: string, wait: number, listener: (inbox: Inbox) => void) => { inbox: Inbox; stop: () => void };
  /** Each request a chat of the project asks, to `listener` as it is asked; returns the stop. */
  watchAsked: (dir: string, listener: (item: InboxItem) => void) => () => void;
  close: () => void;
}

type Held = PendingAsk & { dir: string };

interface Watcher {
  dir: string;
  wait: number;
  listener: (inbox: Inbox) => void;
  /** The requests last sent, to send again only when they change. */
  sent: string;
  timer: unknown;
}

/** One request's identity: the chat and the tool call it is about. */
const keyOf = (chat: string, ask: string) => `${chat}\n${ask}`;
const idsOf = (inbox: Inbox) => inbox.items.map((i) => keyOf(i.chat, i.request.id)).join("\n\n");

export function createInbox({ now, timers = realTimers, chat, same, log }: InboxDeps): InboxHub {
  const held = new Map<string, Held>();
  const watchers = new Set<Watcher>();
  const askedListeners = new Set<{ dir: string; listener: (item: InboxItem) => void }>();

  const inProject = (dir: string) => [...held.values()].filter((p) => same(p.dir, dir));
  const inboxOf = (dir: string, wait: number): Inbox => ({
    // The chat's name can change (its first message names it), so it is read when sent, not when asked.
    items: dueItems(inProject(dir), wait, now()).map((i) =>
      Object.assign(i, { chatName: chat(i.chat)?.chatName ?? i.chatName }),
    ),
  });

  /** Sets the timer for the next request to come due at the watcher's wait. */
  function schedule(w: Watcher) {
    timers.clear(w.timer);
    const left = nextDueIn(inProject(w.dir), w.wait, now());
    w.timer = left === null ? undefined : timers.set(() => refresh(w), left);
  }

  /** Sends the watcher its Inbox if it changed, and sets the timer for what comes due next. */
  function refresh(w: Watcher) {
    const inbox = inboxOf(w.dir, w.wait);
    const ids = idsOf(inbox);
    if (ids !== w.sent) {
      w.sent = ids;
      tellAll([w.listener], inbox, log);
    }
    schedule(w);
  }

  const refreshAll = (dir: string) => {
    for (const w of watchers) if (same(w.dir, dir)) refresh(w);
  };

  function drop(key: string) {
    const gone = held.get(key);
    if (!gone) return;
    held.delete(key);
    refreshAll(gone.dir);
  }

  return {
    opened(id, request) {
      const facts = chat(id);
      if (!facts) return;
      const at = now();
      const base = { chat: id, chatName: facts.chatName, ...(facts.card ? { card: facts.card } : {}), request };
      held.set(keyOf(id, request.id), { ...base, at, dir: facts.dir });
      const asked: InboxItem = { ...base, since: new Date(at).toISOString() };
      tellAll(
        [...askedListeners].filter((l) => same(l.dir, facts.dir)).map((l) => l.listener),
        asked,
        log,
      );
      refreshAll(facts.dir);
    },
    keep(id, asks) {
      const open = new Set(asks.map((a) => keyOf(id, a.id)));
      for (const [key, p] of held) if (p.chat === id && !open.has(key)) drop(key);
    },
    ended(id) {
      for (const [key, p] of held) if (p.chat === id) drop(key);
    },
    watch(dir, wait, listener) {
      const w: Watcher = { dir, wait, listener, sent: "", timer: undefined };
      watchers.add(w);
      const inbox = inboxOf(dir, wait);
      w.sent = idsOf(inbox);
      schedule(w);
      return {
        inbox,
        stop() {
          timers.clear(w.timer);
          watchers.delete(w);
        },
      };
    },
    watchAsked(dir, listener) {
      const entry = { dir, listener };
      askedListeners.add(entry);
      return () => void askedListeners.delete(entry);
    },
    close() {
      for (const w of watchers) timers.clear(w.timer);
      watchers.clear();
      askedListeners.clear();
      held.clear();
    },
  };
}
