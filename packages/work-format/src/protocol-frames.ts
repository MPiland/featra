/**
 * The local server's WebSocket framing (ADR 0015): the request, response and pushed frames, read defensively. The
 * methods and pushes they carry are in protocol.ts. Pure, so the server, the client and the tests share one copy.
 */
import type { ServerMethods, ServerPushes } from "./protocol.ts";
import { isOneOf, isRecord } from "./utils/guards.ts";

export type PushEvent = keyof ServerPushes;
const PUSH_EVENTS: readonly PushEvent[] = [
  "work.list",
  "card.view",
  "chat.event",
  "chat.list",
  "roles.list",
  "inbox.list",
  "inbox.asked",
];

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
  "draft.sendBack",
  "draft.approve",
  "feature.start",
  "story.start",
  "story.stop",
  "story.resume",
  "story.accept",
  "story.rerunChecks",
  "story.createPr",
  "prs.refresh",
  "checks.load",
  "checks.set",
  "story.sendBack",
  "draft.reject",
  "chat.roles",
  "roles.watch",
  "roles.edit",
  "chat.start",
  "chat.watch",
  "chat.controls",
  "chat.configure",
  "chat.send",
  "chat.stop",
  "chat.archive",
  "chat.approve",
  "chat.answer",
  "chat.undoLog",
  "chat.list",
  "inbox.watch",
  "inbox.asked",
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

export const isId = (id: unknown): id is number => typeof id === "number" && Number.isSafeInteger(id);

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
