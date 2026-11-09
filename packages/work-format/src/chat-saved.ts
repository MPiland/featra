/**
 * The chats Featra keeps in its app data (STORY-44, ADR 0018), so they come back after a restart: each chat's project,
 * its provider's session id, and its row in the chat list. The transcript isn't kept here: the provider's own session
 * holds it, and the provider adapter reads it back.
 */
import { normalizeSummary, type ChatSummary } from "./chat-list.ts";
import { isRecord } from "./utils/guards.ts";

export interface SavedChat {
  /** The project folder the chat runs in. */
  dir: string;
  /** The provider's session id, once the agent reported one; null for a chat that never started its agent. */
  session: string | null;
  /** Its row: title, role, provider, when it started and whether it waits on the user. */
  summary: ChatSummary;
}

/** `chats.json`: every saved chat, in the order they started. */
export interface SavedChats {
  version: 1;
  chats: SavedChat[];
}

/** A chat as it is saved. A saved chat never runs: a turn doesn't outlive the server. */
export const savedChat = (dir: string, session: string | null, summary: ChatSummary): SavedChat => ({
  dir,
  session,
  summary: { ...summary, running: false },
});

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.length > 0;

function normalizeSaved(raw: unknown): SavedChat | null {
  if (!isRecord(raw) || !nonEmpty(raw.dir)) return null;
  const summary = normalizeSummary(raw.summary);
  if (!summary) return null;
  return savedChat(raw.dir, nonEmpty(raw.session) ? raw.session : null, summary);
}

/** The saved chats read from the file; anything malformed in it is dropped, and a missing file is no chats. */
export function normalizeSavedChats(raw: unknown): SavedChats {
  const chats = isRecord(raw) && Array.isArray(raw.chats) ? raw.chats : [];
  const read = chats.map(normalizeSaved).filter((c): c is SavedChat => c !== null);
  // One chat per id: the first wins, so a hand-edited duplicate can't make two rows with one id.
  const seen = new Set<string>();
  return { version: 1, chats: read.filter((c) => !seen.has(c.summary.id) && seen.add(c.summary.id)) };
}
