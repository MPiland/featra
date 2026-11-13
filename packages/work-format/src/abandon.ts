/**
 * Abandoning a story (STORY-58): pure rules over the card. Any story that isn't merged or done can be abandoned, by the
 * user only. Its card is kept as Cancelled, a status change in its history by the user (Cancelled is the user's call,
 * as for a status edit; ADR 0004), or discarded. A Cancelled story that still has its worktree can be abandoned again,
 * so whatever a first try left behind can still go.
 */
import { stageCategory } from "./config.ts";
import { isMerged, setStatus } from "./history.ts";
import type { OwnedCard } from "./owner-copies.ts";
import { CANCELLED, type Card, type ProjectConfig } from "./types.ts";

export const ABANDON_MESSAGES = {
  gone: "That card is gone.",
  notStory: (id: string) => `${id} isn't a story.`,
  merged: (id: string) => `${id} is merged, so it can't be abandoned.`,
  done: (id: string) => `${id} is done, so it can't be abandoned.`,
  cancelled: (id: string) => `${id} is already cancelled.`,
  readOnly: "Can't edit it here.",
  /** Abandon asked again while one runs. */
  abandoning: (id: string) => `${id} is already being abandoned.`,
  /** A message, Send back, Resume or Merge asked while the story is being abandoned: its session is about to end. */
  busy: (id: string) => `${id} is being abandoned. Try again once it's done.`,
  /** The story isn't as the warning showed it any more: something new would be lost. */
  changed: (id: string) => `${id} changed since the warning. Look again.`,
  /** GitHub couldn't say whether the story's PR is open, so what Abandon would close isn't known. */
  noPr: (id: string) => `Couldn't read ${id}'s PR. Try again.`,
  noFeature: (id: string) => `${id} has no feature branch to keep its card on.`,
  /** The feature branch couldn't take the card: nothing was removed. */
  featureBusy: (branch: string) => `${branch} has local changes to the card. Commit or stash them, then abandon again.`,
  failed: "Couldn't abandon",
} as const;

/**
 * Why story `id` can't be abandoned, or null when it can. `writable` says whether its owner copy is checked out, which
 * Abandon writes; a feature branch's copy is committed on the branch instead, so it needn't be.
 */
export function abandonRefusal(
  owned: OwnedCard | undefined,
  id: string,
  config: ProjectConfig,
  writable: boolean,
): string | null {
  const card = owned?.card;
  if (!owned || !card) return ABANDON_MESSAGES.gone;
  if (card.type !== "story") return ABANDON_MESSAGES.notStory(id);
  if (isMerged(card)) return ABANDON_MESSAGES.merged(id);
  if (stageCategory(card.status, config) === "done") return ABANDON_MESSAGES.done(id);
  if (card.status === CANCELLED && owned.owner.kind !== "worktree") return ABANDON_MESSAGES.cancelled(id);
  if (!writable && owned.owner.kind !== "feature") return ABANDON_MESSAGES.readOnly;
  return null;
}

/** The card kept after Abandon: Cancelled, logged in its history; unchanged when it is Cancelled already. */
export const abandonedStory = (card: Card, by: string, at: string): Card =>
  card.status === CANCELLED ? card : setStatus(card, CANCELLED, by, at);

/** The message of the commit that keeps the card as Cancelled, or deletes it, on the feature branch. */
export const abandonCommitMessage = (id: string, keep: boolean): string =>
  keep ? `${id}: abandoned, kept as Cancelled` : `${id}: abandoned, card discarded`;
