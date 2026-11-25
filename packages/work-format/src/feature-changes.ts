/**
 * Asking for changes before approving a feature (STORY-71). "Not yet" sends the user's reason to the feature's Dev
 * Lead chat and records it as a `changes-asked` event; the Dev Lead says what it did through the Featra MCP's
 * `mark_changes_handled`, a `changes-handled` event by its session; the user can dismiss the changes asked, a
 * `changes-dismissed` event. What the review screen shows is read back from those events alone, so it survives a
 * restart. Pure.
 */
import type { ChangesNote, FeatureChanges } from "./changes-types.ts";
import { notLeadOf } from "./feature-summary.ts";
import { appendHistory, SEND_BACK_MAX } from "./history.ts";
import { parseId } from "./ids.ts";
import type { Card, HistoryEvent } from "./types.ts";
import { isRecord } from "./utils/guards.ts";

export const MARK_CHANGES_HANDLED_TOOL = "mark_changes_handled";
/** The longest reason, and the longest reply, in characters. */
export const CHANGES_MAX = SEND_BACK_MAX;
const LIMIT = CHANGES_MAX.toLocaleString("en-US");

/** What "Not yet" and Dismiss refuse with. */
export const CHANGES_REFUSALS = {
  noReason: "Say what to change.",
  tooLong: `Keep it under ${LIMIT} characters.`,
  notActive: (id: string) => `${id} isn't a feature in progress.`,
  noLead: "This feature has no Dev Lead chat.",
  leadGone: "The Dev Lead's chat is gone.",
  nothingAsked: "No changes are asked.",
} as const;

/** What `mark_changes_handled` answers the Dev Lead with. */
export const CHANGES_MESSAGES = {
  badFeature: "Give the feature's id, such as FEAT-9, as `feature`.",
  empty: "Say what you changed as `reply`, in plain language for the user.",
  tooLong: `Keep the reply under ${LIMIT} characters.`,
  notLead: notLeadOf,
  nothingAsked: (id: string) =>
    `No changes are asked on ${id}: the user dismissed them, or their ask wasn't recorded. Nothing was recorded; answer the user in the chat.`,
  handled: (id: string) => `Marked the changes on ${id} handled. The user sees your reply on its review screen.`,
} as const;

/** Text as it is kept and sent: plain newlines, trimmed. */
const clean = (text: string): string => text.replace(/\r\n/g, "\n").trim();

/** What the Dev Lead's chat is told, as the user's message: short, and naming the feature. */
export const changesMessage = (feature: string, reason: string): string =>
  `Changes asked on ${feature}: ${clean(reason)}`;
/** A `mark_changes_handled` call: the feature and what the Dev Lead did. */
export interface ChangesHandledInput {
  feature: string;
  reply: string;
}

/** A `mark_changes_handled` call's input, or what to fix. */
export function parseChangesHandledInput(
  input: unknown,
): { ok: true; value: ChangesHandledInput } | { ok: false; error: string } {
  const raw = isRecord(input) ? input : {};
  const feature = (typeof raw.feature === "string" ? raw.feature.trim() : "").toUpperCase();
  if (parseId(feature)?.prefix !== "FEAT") return { ok: false, error: CHANGES_MESSAGES.badFeature };
  const reply = typeof raw.reply === "string" ? clean(raw.reply) : "";
  if (!reply) return { ok: false, error: CHANGES_MESSAGES.empty };
  if (reply.length > CHANGES_MAX) return { ok: false, error: CHANGES_MESSAGES.tooLong };
  return { ok: true, value: { feature, reply } };
}

/** The reason the user gave, or why it can't be sent. */
export function checkReason(reason: string): string | null {
  const length = clean(reason).length;
  if (!length) return CHANGES_REFUSALS.noReason;
  return length > CHANGES_MAX ? CHANGES_REFUSALS.tooLong : null;
}

const note = (e: HistoryEvent): ChangesNote => ({ text: e.to ?? "", at: e.at });

/**
 * The changes asked on the feature, replayed from its history: the reasons since the last reply or dismissal, and the
 * reply that ended the round when it ended so. Asking again after a reply starts a new round; null with none.
 */
export function changesOf(card: Pick<Card, "history">): FeatureChanges | null {
  return card.history.reduce(step, null);
}

function step(round: FeatureChanges | null, e: HistoryEvent): FeatureChanges | null {
  const open = round !== null && round.reply === null;
  if (e.field === "changes-asked")
    return open ? { asked: [...round.asked, note(e)], reply: null } : { asked: [note(e)], reply: null };
  if (e.field === "changes-handled") return open ? { asked: round.asked, reply: note(e) } : round;
  return e.field === "changes-dismissed" ? null : round;
}

/** Whether changes are asked and the Dev Lead hasn't replied: the screen shows "Changes asked". */
export const changesOpen = (card: Pick<Card, "history">): boolean => {
  const changes = changesOf(card);
  return changes !== null && changes.reply === null;
};

/** Records the user's reason, trimmed, with plain newlines. */
export const recordChangesAsked = (card: Card, reason: string, by: string, at: string): Card =>
  appendHistory(card, { at, field: "changes-asked", from: null, to: clean(reason), by });

/** Records the Dev Lead's reply, ending the round; only while changes are asked (`changesOpen`). */
export const recordChangesHandled = (card: Card, reply: string, by: string, at: string): Card =>
  appendHistory(card, { at, field: "changes-handled", from: null, to: clean(reply), by });

/** Records that the user dismissed the changes asked; only while they are asked (`changesOpen`). */
export const recordChangesDismissed = (card: Card, by: string, at: string): Card =>
  appendHistory(card, { at, field: "changes-dismissed", from: null, to: null, by });
