/**
 * Holding a story back from auto-merge (STORY-61, ADR 0034): pure rules over the card. Held is not a field: as Stopped
 * is, it is what the card's history says last about it, so the toggle's every turn is in the history and the last event
 * is the mark. A held story never merges on its own; Merge by hand still works on it.
 */
import { stageCategory } from "./config.ts";
import { appendHistory, isMerged } from "./history.ts";
import type { OwnedCard } from "./owner-copies.ts";
import { CANCELLED, type Card, type ProjectConfig } from "./types.ts";

/** The `to` of the history event that holds a story; the event that lets it go goes from it to null. */
export const HELD = "held";

/** Whether the card's last `held` event holds it. */
export function isHeld(card: Pick<Card, "history">): boolean {
  return card.history.findLast((e) => e.field === "held")?.to === HELD;
}

export const HOLD_MESSAGES = {
  gone: "That card is gone.",
  notStory: (id: string) => `${id} isn't a story.`,
  merged: (id: string) => `${id} is already merged.`,
  cancelled: (id: string) => `${id} is cancelled.`,
  notStarted: (id: string) => `${id} isn't started yet.`,
  /** Past its first stages and not merged, but its card isn't in a worktree of its own: nothing would merge. */
  noWorktree: (id: string) => `${id} has no worktree.`,
  off: "Auto-merge is off for this project.",
  readOnly: "Can't edit it here.",
} as const;

/**
 * Why story `id` takes no Hold now, or null when it does: Hold applies while the project's auto-merge is on
 * (`config.autoMerge`, the setting in effect), to a started story (its card in its own worktree, as merging needs) that
 * isn't merged or cancelled, whose owner copy is `writable`. A story not started can't merge on its own, so it shows no
 * toggle. Letting a held story go is refused the same way, so the toggle shows exactly when it works.
 */
export function holdRefusal(
  owned: OwnedCard | undefined,
  id: string,
  config: ProjectConfig,
  writable: boolean,
): string | null {
  const card = owned?.card;
  if (!owned || !card) return HOLD_MESSAGES.gone;
  if (card.type !== "story") return HOLD_MESSAGES.notStory(id);
  if (isMerged(card)) return HOLD_MESSAGES.merged(id);
  if (card.status === CANCELLED) return HOLD_MESSAGES.cancelled(id);
  if (owned.owner.kind !== "worktree") {
    const fresh = stageCategory(card.status, config) === "not-started";
    return fresh ? HOLD_MESSAGES.notStarted(id) : HOLD_MESSAGES.noWorktree(id);
  }
  if (!config.autoMerge) return HOLD_MESSAGES.off;
  if (owned.ownerUnread || !writable) return HOLD_MESSAGES.readOnly;
  return null;
}

/** Whether story `owned` is held, when Hold applies to it (the toggle shows, pressed or not); undefined when it doesn't. */
export function holdOf(owned: OwnedCard, config: ProjectConfig, writable: boolean): boolean | undefined {
  return holdRefusal(owned, owned.card.id, config, writable) === null ? isHeld(owned.card) : undefined;
}

/** The card held (`held`) or let go, with the history event; unchanged when it already is. */
export function heldStory(card: Card, held: boolean, by: string, at: string): Card {
  if (isHeld(card) === held) return card;
  return appendHistory(card, { at, field: "held", from: held ? null : HELD, to: held ? HELD : null, by });
}
