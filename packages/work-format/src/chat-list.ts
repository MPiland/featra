/**
 * The sidebar's chat list (STORY-21): each chat as one row, folded from its event log, and the rows grouped by the
 * provider that runs them. Pure, so the server builds the rows and the client groups and reads them with one copy of
 * the rules.
 */
import type { ChatEvent } from "./chat-events.ts";
import { isOneOf, isRecord } from "./utils/guards.ts";
import { EFFORTS, PROVIDERS, type ProviderId, type Role } from "./roles.ts";

/**
 * A request the agent waits on the user to answer in the middle of a turn: an approval, a tool call in Ask mode
 * (STORY-45), or a question the agent asks the user to choose (STORY-46). Each is opened and closed by its own events
 * in `nextAsks`.
 */
export type AskReason = "approval" | "question";
export interface Ask {
  /** The request's id: the tool call it is about. */
  id: string;
  reason: AskReason;
  /** The story session whose request this is, when it is a copy shown in its Dev Lead's chat (STORY-9). */
  story?: string;
}

/**
 * Why a chat is waiting on the user: a reply (the agent's turn ended and it waits for the next message), or a request
 * the turn can't go on without (`Ask`).
 */
export type WaitReason = "reply" | AskReason;
export const WAIT_REASONS: readonly WaitReason[] = ["reply", "approval", "question"];
const isAsk = (w: WaitReason | null): w is AskReason => w !== null && w !== "reply";

/** Who renamed a chat. */
export type TitleBy = "draft" | "user";
const TITLE_BY: readonly TitleBy[] = ["draft", "user"];

/** What a chat row shows of the role it started from. */
export type ChatRoleRef = Pick<Role, "id" | "name" | "model" | "effort">;

/** One chat in the list. */
export interface ChatSummary {
  id: string;
  provider: ProviderId;
  role: ChatRoleRef;
  /** The first line of the user's first message; null until there is one (`chatName` shows the role's name). */
  title: string | null;
  /** Who set the title when it wasn't the first message: a draft (STORY-49), or the user, whose name a draft never replaces. */
  titleBy?: TitleBy;
  /** When the chat started (ISO 8601). */
  startedAt: string;
  /** A turn is running. */
  running: boolean;
  /** What the chat waits on the user for, or null: the row's status dot. */
  waiting: WaitReason | null;
  /** The card the chat was started to work on (STORY-7), when there is one. */
  card?: string;
  /** A story session (STORY-9): who it belongs to, for the sidebar to nest it. Absent for any other chat. */
  story?: StoryRef;
  /** A story session waiting for a free slot: its agent hasn't started (STORY-9). Absent once it runs. */
  queued?: true;
  /**
   * A story session idle after a turn that didn't finish: it failed, or a restart cut it off (STORY-53). Its transcript
   * has no composer, so Resume is the way to go on. Absent otherwise, and cleared by the next message.
   */
  stalled?: true;
  /**
   * A subagent the chat's session spawned for itself (STORY-55): its transcript is read-only, and the sidebar nests it
   * under that session. Absent for any other chat. Kept in memory with the session: never saved.
   */
  subagent?: SubagentRef;
}

/** What a subagent's row says of where it came from, and what the user can do to it. */
export interface SubagentRef {
  /** The chat of the session that spawned it. */
  parent: string;
  /** Stop ends just this subagent: only where the provider can (Claude background subagents); false shows no Stop. */
  stoppable: boolean;
}

/** What a story session's row says of the story it works on. */
export interface StoryRef {
  /** The story's id. */
  id: string;
  /** The Dev Lead's chat it nests under; the sidebar uses a group named after the feature when that chat isn't listed. */
  parent: string | null;
  /** The feature's id and title: the group's name when the parent chat is gone. */
  feature: string;
  featureTitle: string;
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
 * The row renamed to `title` (cut like any title). A draft renames a chat to its feature's title (STORY-49) but never
 * over a name the user set; the user's own name replaces anything. The same row comes back when nothing changes.
 */
export function retitle(summary: ChatSummary, title: string, by: TitleBy): ChatSummary {
  const next = chatTitle(title);
  if (next === null || (by === "draft" && summary.titleBy === "user")) return summary;
  return next === summary.title && by === summary.titleBy ? summary : { ...summary, title: next, titleBy: by };
}

/** The events that answer a request. */
const ANSWERS = new Set<ChatEvent["type"]>(["tool-allowed", "tool-denied", "question-answered", "approval-cancelled"]);
const isAnswer = (
  event: ChatEvent,
): event is Extract<ChatEvent, { type: "tool-allowed" | "tool-denied" | "question-answered" | "approval-cancelled" }> =>
  ANSWERS.has(event.type);

/**
 * The requests still open after `event`. A turn's end, or a new message, leaves none: no request outlives its turn.
 * Except a story session's request shown in its parent: it belongs to the session's turn, and closes with it.
 */
export function nextAsks(asks: readonly Ask[], event: ChatEvent): readonly Ask[] {
  if (event.type === "approval" || event.type === "question") {
    const story = event.type === "approval" && event.story ? { story: event.story } : {};
    return asks.some((a) => a.id === event.id) ? asks : [...asks, { id: event.id, reason: event.type, ...story }];
  }
  // An answer closes its request.
  if (isAnswer(event)) return asks.some((a) => a.id === event.id) ? asks.filter((a) => a.id !== event.id) : asks;
  if (event.type === "user" || event.type === "turn-end") {
    const kept = asks.filter((a) => a.story !== undefined);
    return kept.length === asks.length ? asks : kept;
  }
  return asks;
}

/**
 * What the chat waits on after `event`, given the requests open after it (`nextAsks`). An open request comes first,
 * the oldest one. A message from the user answers whatever it waited on; a turn the agent finished or that failed
 * waits for the user's reply; a turn the user stopped doesn't, since the user is the one who acted. Once its last
 * request is answered, the turn goes on and waits on nothing.
 */
export function nextWait(waiting: WaitReason | null, event: ChatEvent, asks: readonly Ask[] = []): WaitReason | null {
  if (asks[0]) return asks[0].reason;
  if (event.type === "user") return null;
  if (event.type === "turn-end") return event.outcome === "stopped" ? null : "reply";
  if (ANSWERS.has(event.type) && isAsk(waiting)) return null;
  return waiting;
}

/** A chat's row and the requests it waits on, as the server keeps them. Only the row is listed and saved. */
export interface ChatRow {
  summary: ChatSummary;
  asks: readonly Ask[];
}

/** The row and its open requests after one more event. */
export function reduceRow(row: ChatRow, event: ChatEvent): ChatRow {
  const asks = nextAsks(row.asks, event);
  const summary = foldSummary(row.summary, event, asks);
  return summary === row.summary && asks === row.asks ? row : { summary, asks };
}

/** A row out of a turn: not running, and waiting on no request, since none outlives the turn (its agent ended). */
export function idleSummary(summary: ChatSummary): ChatSummary {
  const waiting = isAsk(summary.waiting) ? "reply" : summary.waiting;
  if (!summary.running && waiting === summary.waiting) return summary;
  // A story session whose turn or request was cut off here (its agent ended) is stalled: it didn't finish.
  return withStalled({ ...summary, running: false, waiting }, summary.story !== undefined);
}

function withStalled({ stalled: _stalled, ...rest }: ChatSummary, stalled: boolean): ChatSummary {
  return stalled ? { ...rest, stalled: true } : rest;
}

/** The row after one more event, without the open requests: right while at most one request is open at a time. */
export const reduceSummary = (summary: ChatSummary, event: ChatEvent): ChatSummary =>
  foldSummary(summary, event, nextAsks([], event));

function foldSummary(summary: ChatSummary, event: ChatEvent, asks: readonly Ask[]): ChatSummary {
  let waiting = nextWait(summary.waiting, event, asks);
  // A story session's request answered in an idle chat leaves it waiting for the user's next message, as before it.
  if (waiting === null && isAsk(summary.waiting) && !summary.running && event.type !== "user") waiting = "reply";
  let { title, running } = summary;
  if (event.type === "user") {
    running = true;
    // The first message names the chat; later ones don't rename it.
    title ??= chatTitle(event.text);
  }
  if (event.type === "turn-end") running = false;
  // A story session's turn that failed leaves it stalled until the next message; any other end finished it.
  const stalled =
    event.type === "turn-end"
      ? summary.story !== undefined && event.outcome === "failed"
      : event.type !== "user" && summary.stalled === true;
  return title === summary.title &&
    running === summary.running &&
    waiting === summary.waiting &&
    stalled === (summary.stalled === true)
    ? summary
    : withStalled({ ...summary, title, running, waiting }, stalled);
}

/** A new chat's row, before any event. */
export function newSummary(
  id: string,
  provider: ProviderId,
  role: ChatRoleRef,
  startedAt: string,
  card?: string,
  story?: StoryRef,
  queued = false,
): ChatSummary {
  return {
    id,
    provider,
    role: { id: role.id, name: role.name, model: role.model, effort: role.effort },
    title: null,
    startedAt,
    running: false,
    waiting: null,
    ...(card ? { card } : {}),
    ...(story ? { story } : {}),
    ...(queued ? { queued: true as const } : {}),
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

/** A chat row read from the socket or a saved file, or null when it isn't one. */
export function normalizeSummary(raw: unknown): ChatSummary | null {
  if (!isRecord(raw) || !isRecord(raw.role)) return null;
  const { id, provider, title, startedAt, role } = raw;
  const story = normalizeStory(raw.story);
  const subagent = normalizeSubagent(raw.subagent);
  if (!str(id) || !isOneOf(PROVIDERS, provider) || !str(startedAt)) return null;
  if (title !== null && !str(title)) return null;
  if (!str(role.id) || !str(role.name) || !str(role.model) || !isOneOf(EFFORTS, role.effort)) return null;
  return {
    id,
    provider,
    role: { id: role.id, name: role.name, model: role.model, effort: role.effort },
    title,
    ...(isOneOf(TITLE_BY, raw.titleBy) ? { titleBy: raw.titleBy } : {}),
    startedAt,
    running: raw.running === true,
    waiting: isOneOf(WAIT_REASONS, raw.waiting) ? raw.waiting : null,
    ...(str(raw.card) ? { card: raw.card } : {}),
    ...(story ? { story } : {}),
    ...(raw.queued === true ? { queued: true as const } : {}),
    ...(raw.stalled === true ? { stalled: true as const } : {}),
    ...(subagent ? { subagent } : {}),
  };
}

function normalizeSubagent(raw: unknown): SubagentRef | null {
  return isRecord(raw) && str(raw.parent) ? { parent: raw.parent, stoppable: raw.stoppable === true } : null;
}

function normalizeStory(raw: unknown): StoryRef | null {
  if (!isRecord(raw) || !str(raw.id) || !str(raw.feature)) return null;
  return {
    id: raw.id,
    parent: str(raw.parent) ? raw.parent : null,
    feature: raw.feature,
    featureTitle: typeof raw.featureTitle === "string" ? raw.featureTitle : raw.feature,
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
