/**
 * The sidebar's chat list (STORY-21): each chat as one row, folded from its event log, and the rows grouped by the
 * provider that runs them. Pure, so the server builds the rows and the client groups and reads them with one copy of
 * the rules.
 */
import type { ChatEvent } from "./chat-events.ts";
import { isOneOf, isRecord } from "./utils/guards.ts";
import { EFFORTS, PROVIDERS, type ProviderId, type Role } from "./roles.ts";

/**
 * Why a chat is waiting on the user. A reply: the agent's turn ended and it waits for the next message. STORY-45 adds
 * a tool approval and STORY-46 a question; each is a new reason here, set from its own event in `nextWait`.
 */
export type WaitReason = "reply";
export const WAIT_REASONS: readonly WaitReason[] = ["reply"];

/** What a chat row shows of the role it started from. */
export type ChatRoleRef = Pick<Role, "id" | "name" | "model" | "effort">;

/** One chat in the list. */
export interface ChatSummary {
  id: string;
  provider: ProviderId;
  role: ChatRoleRef;
  /** The first line of the user's first message; null until there is one (`chatName` shows the role's name). */
  title: string | null;
  /** When the chat started (ISO 8601). */
  startedAt: string;
  /** A turn is running. */
  running: boolean;
  /** What the chat waits on the user for, or null: the row's status dot. */
  waiting: WaitReason | null;
}

/** A provider the list can group by: its name, and whether the user has its agent installed. */
export interface ProviderInfo {
  id: ProviderId;
  name: string;
  installed: boolean;
}

/** What `chat.list` answers and pushes: the providers, and the project's chats. */
export interface ChatList {
  providers: ProviderInfo[];
  chats: ChatSummary[];
}

export const EMPTY_CHAT_LIST: ChatList = { providers: [], chats: [] };

/** The longest title a row shows before it is cut with an ellipsis. */
export const CHAT_TITLE_MAX = 60;

/** A message's first non-blank line, cut to `CHAT_TITLE_MAX`; null when the message is blank. */
export function chatTitle(text: string): string | null {
  const line = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return null;
  return line.length > CHAT_TITLE_MAX ? `${line.slice(0, CHAT_TITLE_MAX - 1).trimEnd()}…` : line;
}

/**
 * What the chat waits on after `event`. A message from the user answers whatever it waited on; a turn the agent
 * finished or that failed waits for the user's reply; a turn the user stopped doesn't, since the user is the one who
 * acted.
 */
export function nextWait(waiting: WaitReason | null, event: ChatEvent): WaitReason | null {
  if (event.type === "user") return null;
  if (event.type === "turn-end") return event.outcome === "stopped" ? null : "reply";
  return waiting;
}

/** The row after one more event. */
export function reduceSummary(summary: ChatSummary, event: ChatEvent): ChatSummary {
  const waiting = nextWait(summary.waiting, event);
  let { title, running } = summary;
  if (event.type === "user") {
    running = true;
    // The first message names the chat; later ones don't rename it.
    title ??= chatTitle(event.text);
  }
  if (event.type === "turn-end") running = false;
  return title === summary.title && running === summary.running && waiting === summary.waiting
    ? summary
    : { ...summary, title, running, waiting };
}

/** A new chat's row, before any event. */
export function newSummary(id: string, provider: ProviderId, role: ChatRoleRef, startedAt: string): ChatSummary {
  return {
    id,
    provider,
    role: { id: role.id, name: role.name, model: role.model, effort: role.effort },
    title: null,
    startedAt,
    running: false,
    waiting: null,
  };
}

/** What a row calls the chat: its title, or the role's name before the first message. */
export const chatName = (chat: ChatSummary): string => chat.title ?? chat.role.name;

export interface ChatGroup {
  provider: ProviderInfo;
  chats: ChatSummary[];
}

/**
 * The list as the sidebar shows it: one group per installed provider, in the order the server lists them, plus any
 * provider that isn't installed but still has chats (so none go missing). Newest chat first in each group.
 */
const newestFirst = (a: ChatSummary, b: ChatSummary) =>
  b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id);

export function groupChats(list: ChatList): ChatGroup[] {
  return list.providers
    .map((provider) => ({
      provider,
      chats: list.chats.filter((c) => c.provider === provider.id).toSorted(newestFirst),
    }))
    .filter((g) => g.provider.installed || g.chats.length > 0);
}

const str = (v: unknown): v is string => typeof v === "string" && v.length > 0;

function normalizeSummary(raw: unknown): ChatSummary | null {
  if (!isRecord(raw) || !isRecord(raw.role)) return null;
  const { id, provider, title, startedAt, role } = raw;
  if (!str(id) || !isOneOf(PROVIDERS, provider) || !str(startedAt)) return null;
  if (title !== null && !str(title)) return null;
  if (!str(role.id) || !str(role.name) || !str(role.model) || !isOneOf(EFFORTS, role.effort)) return null;
  return {
    id,
    provider,
    role: { id: role.id, name: role.name, model: role.model, effort: role.effort },
    title,
    startedAt,
    running: raw.running === true,
    waiting: isOneOf(WAIT_REASONS, raw.waiting) ? raw.waiting : null,
  };
}

function normalizeProvider(raw: unknown): ProviderInfo | null {
  if (!isRecord(raw) || !isOneOf(PROVIDERS, raw.id) || !str(raw.name)) return null;
  return { id: raw.id, name: raw.name, installed: raw.installed === true };
}

const each = <T>(raw: unknown, read: (v: unknown) => T | null): T[] =>
  Array.isArray(raw) ? raw.map(read).filter((v): v is T => v !== null) : [];

/** A chat list read from the socket; anything malformed in it is dropped. */
export function normalizeChatList(raw: unknown): ChatList {
  if (!isRecord(raw)) return EMPTY_CHAT_LIST;
  return { providers: each(raw.providers, normalizeProvider), chats: each(raw.chats, normalizeSummary) };
}
