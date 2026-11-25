/**
 * Auto-merge (STORY-59, ADR 0034): a story merges into its feature branch on its own once it is Verified and Proven,
 * when the project's `autoMerge` is on. It is the merge Merge makes, by `system`, so it needs what Merge needs
 * (`mergeRefusal`), every criterion proven at the commit it merges, and a feature still being built. Accept gates Done,
 * not the merge.
 */
import { designReviewState } from "./design-review.ts";
import { checkedEvent, provenAt } from "./evidence.ts";
import { appendHistory } from "./history.ts";
import { mergeRefusal } from "./merge.ts";
import type { OwnedCard } from "./owner-copies.ts";
import { isHeld } from "./story-hold.ts";
import type { Card, ProjectConfig } from "./types.ts";

/** Where a story would merge from and into: the commit Merge would merge, and the story's feature card. */
export interface AutoMergeTarget {
  /** The tip of the story's branch, which Merge merges; null when unknown. */
  head: string | null;
  feature: Card | undefined;
}

/**
 * Whether story `owned` merges on its own now: auto-merge is `on`, it isn't held (STORY-61) or waiting for its design review (STORY-73), Merge would take it (`writable` says whether its
 * owner copy is checked out), every criterion is proven at `target.head`, and its feature is active (not Cancelled or
 * Done). A card whose owner copy can't be read never does: the copy shown may be stale (BUG-24). The feature branch it
 * merges into, and whether that is merged to main, are the server's to check, as for Merge.
 */
export function mergesOnItsOwn(
  owned: OwnedCard | undefined,
  config: ProjectConfig,
  writable: boolean,
  on: boolean,
  target: AutoMergeTarget,
): boolean {
  if (!on || !owned || owned.ownerUnread || target.feature?.status !== "active") return false;
  // A held story never merges on its own (STORY-61); Merge by hand still takes it.
  if (isHeld(owned.card)) return false;
  // Nor does one waiting for its design review (STORY-73): it stays in review until the Dev Lead clears it. Merge by
  // hand is the user's call, as for a held story.
  const review = designReviewState(owned.card, config);
  if (review !== null && review.status !== "cleared") return false;
  return mergeRefusal(owned, owned.card.id, config, writable) === null && provenAt(owned.card, target.head);
}

/** The summary of the Dev Lead's "merged" notice for a story that merged on its own into `into`. */
export const autoMergedSummary = (into: string, remains: readonly string[]): string =>
  [`${into}, on its own.`, ...remains].join(" ");

/**
 * An automatic merge that didn't happen (STORY-60): a `not-merged` event by `system`, from the commit it was tried at,
 * to why. A conflict also names the feature branch's tip it conflicted with (`<head>@<tip>`). The story isn't tried
 * again at that commit (and, for a conflict, that tip), and its card and chat say why.
 */
export const notMergedStory = (card: Card, head: string, reason: string, by: string, at: string, tip?: string): Card =>
  appendHistory(card, { at, field: "not-merged", from: tip ? `${head}@${tip}` : head, to: reason, by });

/**
 * The automatic merge that didn't happen, while it still stands: the commit it was tried at, and why; for a conflict,
 * the feature branch's tip it conflicted with.
 */
export interface NotMerged {
  head: string | null;
  tip?: string;
  reason: string;
}

/** The commit and, for a conflict, the feature tip a `not-merged` event's `from` names. */
function triedAt(from: string | null): Pick<NotMerged, "head" | "tip"> {
  const at = from?.indexOf("@") ?? -1;
  return from === null || at < 0 ? { head: from } : { head: from.slice(0, at), tip: from.slice(at + 1) };
}

/**
 * The latest automatic merge of `card` that didn't happen, until the story changes: its checks settle on another
 * commit (`checked:`), or it merges. A move between stages doesn't change it, as it doesn't change the commit tried.
 * Whether a conflict still stands also depends on the feature branch's tip, which auto-merge compares.
 */
export function notMergedOf(card: Pick<Card, "history">): NotMerged | null {
  let standing: NotMerged | null = null;
  for (const e of card.history) {
    if (e.field === "not-merged") standing = { ...triedAt(e.from), reason: e.to ?? "" };
    else if (e.field === "merged") standing = null;
    else if (standing && e.field === "evidence" && e.to?.startsWith(checkedEvent("")))
      standing = e.to === checkedEvent(standing.head ?? "") ? standing : null;
  }
  return standing;
}

/** The summary of the Dev Lead's "not merged" notice for a story that didn't merge on its own into `into`. */
export const notMergedSummary = (into: string, reason: string): string => `${into}, on its own. ${reason}`;
