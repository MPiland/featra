/**
 * What a revision of a draft must not touch (STORY-8 review, ADR 0021): the user's own edits, a feature that has left
 * draft, and stories that have started. Pure checks over cards; `planDraft` asks them before it plans anything.
 */
import type { DraftStory } from "./card-draft-input.ts";
import { parseId } from "./ids.ts";
import { CANCELLED, type Card } from "./types.ts";

/** The frontmatter key that names the chat that drafted a feature: how a review finds its way back to that chat. */
export const DRAFTED_BY = "drafted-by";

/** The frontmatter key of a draft card's content fingerprint, as the draft last wrote it. */
export const DRAFT_HASH = "drafted-content";

/** Who a draft's history names: the chat's session. */
export const draftAuthor = (chat: string) => `session:${chat}`;

/** The chat that drafted a feature, or null for a card nobody drafted. */
export function draftedBy(card: Card): string | null {
  const chat = card.extra[DRAFTED_BY];
  return typeof chat === "string" && chat ? chat : null;
}

/** Whether a feature waits for a review: a draft an agent made. */
export const needsReview = (card: Pick<Card, "status" | "extra">): boolean =>
  card.status === "draft" && typeof card.extra[DRAFTED_BY] === "string";

/**
 * The newest of a chat's drafts, by id number (an item without an id is skipped): the one rule for which draft belongs
 * to a chat. The server revises it, and the chat's pane shows it, so the two can't disagree.
 */
export function newestDraft<T extends { id: string | null; chat: string | null }>(
  chat: string,
  items: readonly T[],
): T | null {
  let newest: T | null = null;
  let best = -1;
  for (const item of items) {
    const n = item.id === null ? null : (parseId(item.id)?.n ?? 0);
    if (item.chat === chat && n !== null && n >= best) {
      newest = item;
      best = n;
    }
  }
  return newest;
}

/** The latest feature a chat drafted, whatever its status now. */
export function draftedFeature(chat: string, cards: readonly Card[]): Card | null {
  return (
    newestDraft(
      chat,
      cards.filter((c) => c.type === "feature").map((c) => ({ id: c.id, chat: draftedBy(c), card: c })),
    )?.card ?? null
  );
}

/** A draft feature a chat made and nobody has approved yet: the one its next `draft_cards` call revises. */
export function openDraft(chat: string, cards: readonly Card[]): Card | null {
  const feature = draftedFeature(chat, cards);
  return feature?.status === "draft" ? feature : null;
}

/** A small pure string hash (cyrb53), as hex: enough to tell whether a card's text moved. */
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/** A fingerprint of the text a draft writes: title, description, criteria and tasks (not ticks, status or order). */
export const contentKey = (card: Pick<Card, "title" | "description" | "acs" | "tasks">): string =>
  hash(JSON.stringify([card.title, card.description, card.acs.map((a) => a.text), card.tasks.map((t) => t.text)]));

/** `card` carrying the fingerprint of its current text, so a later call can tell whether anyone else changed it. */
export const stamped = (card: Card): Card => ({ ...card, extra: { ...card.extra, [DRAFT_HASH]: contentKey(card) } });

/**
 * Whether a history entry is a change to what a draft says. Moves between stages, evidence and acceptance are not,
 * a send-back is not (it asks the agent to revise, so it must never block it), and neither are the notes (a draft
 * doesn't write them).
 */
const notDraftText = (e: { field: string; to: string | null }) =>
  ["status", "evidence", "accepted", "sent-back"].includes(e.field) || (e.field === "content" && e.to === "notes");

/**
 * Whether someone other than the drafting chat changed a card since the draft last wrote it: a text edit made in the
 * app (it leaves no history, so the fingerprint shows it) or a user history entry newer than the draft's last one.
 */
export function userEdited(card: Card, chat: string): boolean {
  const stored = card.extra[DRAFT_HASH];
  if (typeof stored === "string" && stored !== contentKey(card)) return true;
  const author = draftAuthor(chat);
  const last = card.history.findLastIndex((e) => e.by === author);
  return card.history.some((e, i) => i > last && e.by === "user" && !notDraftText(e));
}

const list = (label: string, items: readonly { text: string }[]) =>
  `  ${label}: ${items.length ? items.map((i) => i.text).join("; ") : "none"}`;

/** The refusal for cards the user edited: each with its current text, so the agent can merge and call again. */
export function editedError(cards: readonly Card[]): string {
  const lines = cards.flatMap((c) => [
    `- ${c.id} "${c.title}"`,
    c.type === "feature" ? `  Description: ${c.description || "none"}` : `  Story: ${c.description || "none"}`,
    ...(c.type === "feature" ? [] : [list("Criteria", c.acs), list("Tasks", c.tasks)]),
  ]);
  return [
    "The user edited these cards since your last draft, so nothing was written. Merge their text into your draft and call again:",
    ...lines,
  ].join("\n");
}

/** Whether a story has gone past its first stage (Cancelled counts as not started: it can be revived). */
export const started = (card: Card, first: string): boolean => card.status !== CANCELLED && card.status !== first;

/** The refusal for started stories a call leaves out or changes. */
export function startedError(left: readonly Card[], changed: readonly Card[]): string {
  return [
    ...left.map((c) => `${c.id} is ${c.status}, so it can't be left out. Send it unchanged.`),
    ...changed.map((c) => `${c.id} is ${c.status}, so it can't be changed. Send it unchanged.`),
  ].join("\n");
}

/** The refusal for a call to a chat's feature once it has left draft. */
export const leftDraftError = (feature: Card): string =>
  `${feature.id} is already ${feature.status}; drafts can't be changed after approval. Ask the user to add scope in Work.`;

/** Whether a story's content (what a draft writes) is what `story` says. */
export const sameContent = (card: Card, story: DraftStory): boolean =>
  contentKey(card) ===
  contentKey({
    title: story.title,
    description: story.story,
    acs: story.criteria.map((text) => ({ text, done: false, test: null })),
    tasks: story.tasks.map((text) => ({ text, done: false })),
  });
