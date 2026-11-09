/**
 * The Inbox (STORY-7): the approvals and questions that have waited on the user past the Inbox wait, each with its chat
 * and card. Pure, so the server decides what is due and the client reads what it sends with one copy of the rules.
 */
import { normalizeChatEvent, type ChatEvent } from "./chat-events.ts";
import { isRecord } from "./utils/guards.ts";

/** An approval or a question: the two requests that block a turn until the user answers. */
export type InboxRequest = Extract<ChatEvent, { type: "approval" | "question" }>;

/** One request waiting on the user, with the chat it blocks. `since` is when it was asked (ISO 8601, the server's clock). */
export interface InboxItem {
  chat: string;
  chatName: string;
  /** The card the chat works on, when it was started from one. */
  card?: string;
  request: InboxRequest;
  since: string;
}

/** What `inbox.watch` answers and pushes: the requests past the wait, oldest first. */
export interface Inbox {
  items: InboxItem[];
}

export const EMPTY_INBOX: Inbox = { items: [] };

/** How long a request waits in its chat before it is also in the Inbox, until the user sets another (Settings > General). */
export const DEFAULT_INBOX_WAIT_MINUTES = 10;
/** The shortest and longest wait Settings takes: a second (for tests that mustn't sleep) and a day. */
export const MIN_INBOX_WAIT_MINUTES = 1 / 60;
export const MAX_INBOX_WAIT_MINUTES = 24 * 60;

/** A wait read from settings: a number of minutes in range, else the default. */
export function normalizeWaitMinutes(raw: unknown): number {
  return typeof raw === "number" && raw >= MIN_INBOX_WAIT_MINUTES && raw <= MAX_INBOX_WAIT_MINUTES
    ? raw
    : DEFAULT_INBOX_WAIT_MINUTES;
}

export const waitMs = (minutes: number): number => Math.round(minutes * 60_000);

/** A request the server holds: the item, with the moment it was asked as server-clock milliseconds. */
export interface PendingAsk extends Omit<InboxItem, "since"> {
  at: number;
}

const byAge = (a: PendingAsk, b: PendingAsk) => a.at - b.at || a.chat.localeCompare(b.chat);

/** The requests that have waited at least `wait` ms at `now`, oldest first. */
export function dueItems(pending: Iterable<PendingAsk>, wait: number, now: number): InboxItem[] {
  return [...pending]
    .filter((p) => now - p.at >= wait)
    .toSorted(byAge)
    .map(({ chat, chatName, card, request, at }) => {
      const item: InboxItem = { chat, chatName, request, since: new Date(at).toISOString() };
      if (card) item.card = card;
      return item;
    });
}

/** Milliseconds until the next request comes due, or null when none is still waiting to. */
export function nextDueIn(pending: Iterable<PendingAsk>, wait: number, now: number): number | null {
  let soonest: number | null = null;
  for (const p of pending) {
    const left = p.at + wait - now;
    if (left > 0 && (soonest === null || left < soonest)) soonest = left;
  }
  return soonest;
}

/** The `{ dir, waitMs }` params of `inbox.watch`, or null. */
export function inboxParams(params: unknown): { dir: string; waitMs: number } | null {
  if (!isRecord(params) || typeof params.dir !== "string" || !params.dir) return null;
  const ms = params.waitMs;
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0 || ms > waitMs(MAX_INBOX_WAIT_MINUTES)) return null;
  return { dir: params.dir, waitMs: ms };
}

/** An item read from the socket, or null when it isn't one. */
export function normalizeInboxItem(raw: unknown): InboxItem | null {
  if (!isRecord(raw)) return null;
  const request = normalizeChatEvent(raw.request);
  const { chat, chatName, card, since } = raw;
  if (request?.type !== "approval" && request?.type !== "question") return null;
  if (typeof chat !== "string" || !chat || typeof chatName !== "string" || typeof since !== "string") return null;
  return {
    chat,
    chatName,
    ...(typeof card === "string" && card ? { card } : {}),
    request,
    since,
  };
}

/** An inbox read from the socket; anything malformed in it is dropped. */
export function normalizeInbox(raw: unknown): Inbox {
  const items = isRecord(raw) && Array.isArray(raw.items) ? raw.items : [];
  return { items: items.map(normalizeInboxItem).filter((i): i is InboxItem => i !== null) };
}
