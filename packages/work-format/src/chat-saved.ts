/**
 * The chats Featra keeps in its app data (STORY-44, ADR 0018), so they come back after a restart: each chat's project,
 * its provider's session id, and its row in the chat list. The transcript isn't kept here: the provider's own session
 * holds it, and the provider adapter reads it back.
 */
import { normalizeSettings, type ChatSettings } from "./chat-controls.ts";
import { idleSummary, normalizeSummary, type ChatSummary } from "./chat-list.ts";
import { isRecord } from "./utils/guards.ts";

/** What the composer last set (STORY-22), kept so a reopened chat goes on with it. */
export interface SavedComposer {
  settings: ChatSettings;
  /** The model's window the last turn reported; null when the provider gave none, or the model has changed since. */
  window: number | null;
  /** The chat started in full access, so it may go back to it; a chat that didn't never can. */
  fullAccess: boolean;
}

export interface SavedChat {
  /** The project folder the chat runs in. */
  dir: string;
  /** The provider's session id, once the agent reported one; null for a chat that never started its agent. */
  session: string | null;
  /** Its row: title, role, provider, when it started and whether it waits on the user. */
  summary: ChatSummary;
  /** Absent for a chat saved before the composer, or one whose agent never started. */
  composer?: SavedComposer;
}

/** `chats.json`: every saved chat, in the order they started. */
export interface SavedChats {
  version: 1;
  chats: SavedChat[];
}

/**
 * A chat as it is saved. A saved chat never runs and waits on no request: a turn doesn't outlive the server, so a
 * chat that was waiting on an approval comes back waiting for the user's reply.
 */
export const savedChat = (
  dir: string,
  session: string | null,
  summary: ChatSummary,
  composer: SavedComposer | null = null,
): SavedChat => ({
  dir,
  session,
  summary: idleSummary(summary),
  ...(composer ? { composer } : {}),
});

function normalizeComposer(raw: unknown): SavedComposer | null {
  if (!isRecord(raw)) return null;
  const settings = normalizeSettings(raw.settings);
  if (!settings) return null;
  const window = typeof raw.window === "number" && Number.isFinite(raw.window) && raw.window > 0 ? raw.window : null;
  return { settings, window, fullAccess: raw.fullAccess === true };
}

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.length > 0;

function normalizeSaved(raw: unknown): SavedChat | null {
  if (!isRecord(raw) || !nonEmpty(raw.dir)) return null;
  const summary = normalizeSummary(raw.summary);
  if (!summary) return null;
  return savedChat(raw.dir, nonEmpty(raw.session) ? raw.session : null, summary, normalizeComposer(raw.composer));
}

/** The saved chats read from the file; anything malformed in it is dropped, and a missing file is no chats. */
export function normalizeSavedChats(raw: unknown): SavedChats {
  const chats = isRecord(raw) && Array.isArray(raw.chats) ? raw.chats : [];
  const read = chats.map(normalizeSaved).filter((c): c is SavedChat => c !== null);
  // One chat per id: the first wins, so a hand-edited duplicate can't make two rows with one id.
  const seen = new Set<string>();
  return { version: 1, chats: read.filter((c) => !seen.has(c.summary.id) && seen.add(c.summary.id)) };
}
