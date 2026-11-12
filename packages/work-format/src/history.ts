import type { Card, HistoryEvent, HistoryField } from "./types.ts";

/** ISO-8601 UTC to the second, the format used in card files. */
export function toIso(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Returns a new card with the event appended. History is append-only: nothing here edits or removes events. */
export function appendHistory(card: Card, event: HistoryEvent): Card {
  return { ...card, history: [...card.history, { ...event }] };
}

function change(card: Card, field: HistoryField, from: string | null, to: string | null, by: string, at: string): Card {
  return appendHistory(card, { at, field, from, to, by });
}

/** Moves a card to a new status and records it. A no-op when the status is unchanged. */
export function setStatus(card: Card, to: string, by: string, at: string): Card {
  if (card.status === to) return card;
  return { ...change(card, "status", card.status, to, by, at), status: to };
}

/** Moves a card under a new parent and records it. A no-op when the parent is unchanged. */
export function setParent(card: Card, to: string | null, by: string, at: string): Card {
  if (card.parent === to) return card;
  return { ...change(card, "parent", card.parent, to, by, at), parent: to };
}

/** Records an evidence fact (see evidence.ts for the vocabulary). Evidence comes from `system` (CI, test runs). */
export function recordEvidence(card: Card, to: string, by: string, at: string): Card {
  return change(card, "evidence", null, to, by, at);
}

/** Records the story's PR (STORY-11): its URL, by `system`. A no-op when it is the same one. */
export function setPr(card: Card, to: string, by: string, at: string): Card {
  if (card.pr === to) return card;
  return { ...change(card, "pr", card.pr, to, by, at), pr: to };
}

/** Records the user's Accept (or its withdrawal). */
export function recordAcceptance(card: Card, accepted: boolean, by: string, at: string): Card {
  return change(card, "accepted", null, accepted ? "accepted" : "withdrawn", by, at);
}

/** Records that the user sent a draft back, with the reason (trimmed) as written: STORY-50. */
export function recordSentBack(card: Card, reason: string, by: string, at: string): Card {
  return change(card, "sent-back", null, reason.trim(), by, at);
}

/** The longest reason a send-back takes, in characters. */
export const SEND_BACK_MAX = 2000;

/** What a send-back refuses with, for a draft and for a story alike (STORY-50, STORY-23). */
export const SEND_BACK_REFUSALS = {
  noReason: "Say why you're sending it back.",
  tooLong: `Keep it under ${SEND_BACK_MAX.toLocaleString("en-US")} characters.`,
  gone: "That card is gone.",
  readOnly: "Can't edit it here.",
} as const;

/** What the chat is told when a draft feature or a story is sent back: short, and naming the card it refers to. */
export const sendBackMessage = (card: string, reason: string): string => `Sent back ${card}: ${reason.trim()}`;

const ms = (iso: string) => Date.parse(iso);

/** When the card came into existence; cards without any timestamp are treated as always existing. */
export function createdMs(card: Card): number {
  const at = card.created || card.history[0]?.at;
  return at ? ms(at) : Number.NEGATIVE_INFINITY;
}

export function existsAt(card: Card, t: number): boolean {
  return createdMs(card) <= t;
}

/** Value of a tracked field at time `t`, replayed from history. Falls back to the current value when untracked. */
function valueAt(card: Card, field: "status" | "parent", t: number): string | null {
  const events = card.history.filter((e) => e.field === field);
  const [first] = events;
  if (!first) return card[field];
  let value: string | null = first.from;
  for (const e of events) {
    if (ms(e.at) <= t) value = e.to;
  }
  return value;
}

export function statusAt(card: Card, t: number): string | null {
  return valueAt(card, "status", t);
}

export function parentAt(card: Card, t: number): string | null {
  return valueAt(card, "parent", t);
}
