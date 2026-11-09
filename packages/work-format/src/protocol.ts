/**
 * The local server's WebSocket API (ADR 0015): the shapes both ends check. One JSON text frame per message. The
 * client sends `{ id, method, params }`; the server answers each with `{ id, ok: true, result }` or
 * `{ id, ok: false, error }`. Pure, so the server, the client and the tests share one copy.
 */
import type { CardEdit, CardUpdateResult, CardView } from "./card-view-types.ts";
import type { ChatEvent, ChatSnapshot } from "./chat-events.ts";
import type { ChatList } from "./chat-list.ts";
import type { Role } from "./roles.ts";
import type { SetupItemId, SetupPlan } from "./setup-plan.ts";
import { isOneOf, isRecord } from "./utils/guards.ts";
import type { WorkList } from "./work-list-types.ts";

/** Only loopback, always: the server must not be reachable from another machine (docs/architecture.md). */
export const SERVER_HOST = "127.0.0.1";

/** The URL path the server answers on: the protocol version. A breaking change gets a new path. */
export const SERVER_PATH = "/v1";

/** Where a project stands: not a git repository, a repository without `.featra/`, or set up. */
export type ProjectSetup =
  | { state: "no-git" }
  | { state: "no-featra" }
  | { state: "ready" }
  | { state: "error"; error: string };

/** What Featra init did: the paths it created and the ones it found and kept, relative to the project. */
export type InitResult = { ok: true; created: string[]; kept: string[] } | { ok: false; error: string };

/** What applying or discarding a stale copy did. */
export type CopyActionResult = { ok: true } | { ok: false; error: string };

/** Every method, its params and its result. A new method is added here first. */
export interface ServerMethods {
  /** Whether the project folder is a git repository and holds `.featra/`. */
  "project.setupStatus": { params: { dir: string }; result: ProjectSetup };
  /** Runs `git init` in a folder that is not yet in a repository; answers with the new status. */
  "project.gitInit": { params: { dir: string }; result: ProjectSetup };
  /** Scaffolds `.featra/` and the knowledge files that are missing, in a git repository. */
  "project.init": { params: { dir: string }; result: InitResult };
  /** Before one-screen setup (STORY-42): whether the folder is a repository and which setup items it already has. */
  "project.setupPlan": { params: { dir: string }; result: SetupPlan };
  /** One-screen setup: `git init` if needed, then the chosen items (required ones always), creating only what is missing. */
  "project.setup": { params: { dir: string; items: SetupItemId[] }; result: InitResult };
  /**
   * The project's Work list now; then, until `work.unwatch`, a `work.list` push on this socket each time it changes.
   * The request's id names the watch.
   */
  "work.watch": { params: { dir: string }; result: WorkList };
  /** Stops the watch the `work.watch` request with id `watch` started. */
  "work.unwatch": { params: { watch: number }; result: null };
  /** Applies a stale copy's edit to the owner's file, then restores the copy from git (ADR 0016). */
  "work.applyCopy": { params: { dir: string; key: string }; result: CopyActionResult };
  /** Throws a stale copy's edit away: restores the copy from git. */
  "work.discardCopy": { params: { dir: string; key: string }; result: CopyActionResult };
  /**
   * One card as the card pane shows it, from its owner (null when there is no such card); then, until
   * `work.unwatch`, a `card.view` push each time it changes (ADR 0017). The request's id names the watch.
   */
  "card.watch": { params: { dir: string; id: string }; result: CardView | null };
  /** Applies one edit to the card's owner copy, on disk; answers with the card as it is after (ADR 0017). */
  "card.update": { params: { dir: string; id: string; edit: CardEdit }; result: CardUpdateResult };
  /** The roles a chat in this project can start from (ADR 0018). */
  "chat.roles": { params: { dir: string }; result: Role[] };
  /** Starts a chat from a role in the project folder; answers with its id. Its agent starts with the first message. */
  "chat.start": { params: { dir: string; role: string }; result: { id: string } };
  /**
   * The chat's event log so far; then, until `work.unwatch`, a `chat.event` push for each new event. The request's id
   * names the watch.
   */
  "chat.watch": { params: { id: string }; result: ChatSnapshot };
  /** Sends the user's message: starts a turn. */
  "chat.send": { params: { id: string; text: string }; result: null };
  /** Interrupts the running turn. */
  "chat.stop": { params: { id: string }; result: null };
  /**
   * The project's chats and the providers they group under (STORY-21); then, until `work.unwatch`, a `chat.list` push
   * each time a row changes. The request's id names the watch.
   */
  "chat.list": { params: { dir: string }; result: ChatList };
}

/** Frames the server sends unasked, and the data each carries. */
export interface ServerPushes {
  /** The Work list changed: the whole new list, for the watch the frame names. */
  "work.list": WorkList;
  /** The watched card changed: the whole new view, or null when the card is gone. */
  "card.view": CardView | null;
  /** A watched chat has a new event. */
  "chat.event": ChatEvent;
  /** A row of the watched chat list changed, or a chat came or went: the whole new list. */
  "chat.list": ChatList;
}

export type PushEvent = keyof ServerPushes;
const PUSH_EVENTS: readonly PushEvent[] = ["work.list", "card.view", "chat.event", "chat.list"];

/**
 * A pushed frame: `{ event, watch, data }`. It never has an `id`, so neither end can take it for an answer, and a
 * client that doesn't know the event ignores it.
 */
export interface ServerPush {
  event: PushEvent;
  watch: number;
  data: unknown;
}

export type ServerMethod = keyof ServerMethods;
export const SERVER_METHODS: readonly ServerMethod[] = [
  "project.setupStatus",
  "project.gitInit",
  "project.init",
  "project.setupPlan",
  "project.setup",
  "work.watch",
  "work.unwatch",
  "work.applyCopy",
  "work.discardCopy",
  "card.watch",
  "card.update",
  "chat.roles",
  "chat.start",
  "chat.watch",
  "chat.send",
  "chat.stop",
  "chat.list",
];

export interface ServerRequest {
  id: number;
  method: ServerMethod;
  params: unknown;
}

export type ServerResponse = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

const json = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const isId = (id: unknown): id is number => typeof id === "number" && Number.isSafeInteger(id);

/** A request frame, or why it can't be answered (`id` is null when even that can't be read). */
export function parseRequest(text: string): ServerRequest | { id: number | null; error: string } {
  const raw = json(text);
  if (!isRecord(raw) || !isId(raw.id)) return { id: null, error: "Malformed request." };
  if (!isOneOf(SERVER_METHODS, raw.method)) return { id: raw.id, error: "Unknown method." };
  return { id: raw.id, method: raw.method, params: raw.params };
}

export function parseResponse(text: string): ServerResponse | null {
  const raw = json(text);
  if (!isRecord(raw) || !isId(raw.id)) return null;
  if (raw.ok === true) return { id: raw.id, ok: true, result: raw.result };
  return { id: raw.id, ok: false, error: typeof raw.error === "string" && raw.error ? raw.error : "Request failed." };
}

/** A pushed frame, or null for anything else (an answer has an `id`; a push never does). */
export function parsePush(text: string): ServerPush | null {
  const raw = json(text);
  if (!isRecord(raw) || "id" in raw || !isOneOf(PUSH_EVENTS, raw.event) || !isId(raw.watch)) return null;
  return { event: raw.event, watch: raw.watch, data: raw.data };
}

/** The `{ dir }` params every project method takes, or null. */
export function dirParams(params: unknown): { dir: string } | null {
  return isRecord(params) && typeof params.dir === "string" && params.dir ? { dir: params.dir } : null;
}

const SETUP_STATES = ["no-git", "no-featra", "ready"] as const;

export function normalizeProjectSetup(raw: unknown): ProjectSetup {
  const r = isRecord(raw) ? raw : {};
  if (isOneOf(SETUP_STATES, r.state)) return { state: r.state };
  return { state: "error", error: typeof r.error === "string" && r.error ? r.error : "Something went wrong." };
}

const strings = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((s): s is string => typeof s === "string") : [];

export function normalizeInitResult(raw: unknown): InitResult {
  const r = isRecord(raw) ? raw : {};
  if (r.ok === true) return { ok: true, created: strings(r.created), kept: strings(r.kept) };
  return { ok: false, error: typeof r.error === "string" && r.error ? r.error : "Something went wrong." };
}

/** The `{ dir, key }` params of the stale-copy actions, or null. */
export function copyParams(params: unknown): { dir: string; key: string } | null {
  const dir = dirParams(params);
  return dir && isRecord(params) && typeof params.key === "string" && params.key ? { ...dir, key: params.key } : null;
}

/** The `{ watch }` params of `work.unwatch`, or null. */
export function unwatchParams(params: unknown): { watch: number } | null {
  return isRecord(params) && isId(params.watch) ? { watch: params.watch } : null;
}

export function normalizeCopyActionResult(raw: unknown): CopyActionResult {
  const r = isRecord(raw) ? raw : {};
  if (r.ok === true) return { ok: true };
  return { ok: false, error: typeof r.error === "string" && r.error ? r.error : "Something went wrong." };
}
