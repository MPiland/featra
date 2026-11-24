/**
 * Changes asked on a feature (STORY-71): what the review screen shows after the user says "Not yet". The reasons asked
 * since the last round ended, and the Dev Lead's reply once it marked them handled through `mark_changes_handled`.
 * Types, copy and the check for data that crosses the socket only, so the client can import it without the card parser.
 */
import { isRecord } from "./utils/guards.ts";

/** A reason the user gave, or the Dev Lead's reply, with when it was written. */
export interface ChangesNote {
  text: string;
  at: string;
}

/** One round of changes asked: open while `reply` is null ("Changes asked"), handled once the Dev Lead replied. */
export interface FeatureChanges {
  /** Each reason asked in this round, oldest first; never empty. */
  asked: ChangesNote[];
  /** What the Dev Lead said it did; null while the changes are still asked. */
  reply: ChangesNote | null;
}

export const CHANGES_COPY = {
  notYet: "Not yet",
  reason: "What to change",
  hint: "What should the Dev Lead change?",
  send: "Send",
  cancel: "Cancel",
  asked: "Changes asked",
  dismiss: "Dismiss",
  handled: "Changes made",
  byLead: "Written by the Dev Lead",
} as const;

const noteOf = (raw: unknown): ChangesNote | null =>
  isRecord(raw) && typeof raw.text === "string" && raw.text.trim() && typeof raw.at === "string"
    ? { text: raw.text, at: raw.at }
    : null;

/** The changes as the socket carried them; null when there are none or they don't read as changes. */
export function normalizeFeatureChanges(raw: unknown): FeatureChanges | null {
  if (!isRecord(raw) || !Array.isArray(raw.asked)) return null;
  const asked = raw.asked.map(noteOf).filter((n): n is ChangesNote => n !== null);
  if (!asked.length) return null;
  return { asked, reply: noteOf(raw.reply) };
}
