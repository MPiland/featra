/**
 * Auto-merge (STORY-59, ADR 0034): a story merges into its feature branch on its own once it is Verified and Proven,
 * when the project's `autoMerge` is on. It is the merge Merge makes, by `system`, so it needs what Merge needs
 * (`mergeRefusal`), every criterion proven at the commit it merges, and a feature still being built. Accept gates Done,
 * not the merge.
 */
import { provenAt } from "./evidence.ts";
import { mergeRefusal } from "./merge.ts";
import type { OwnedCard } from "./owner-copies.ts";
import type { Card, ProjectConfig } from "./types.ts";

/** Where a story would merge from and into: the commit Merge would merge, and the story's feature card. */
export interface AutoMergeTarget {
  /** The tip of the story's branch, which Merge merges; null when unknown. */
  head: string | null;
  feature: Card | undefined;
}

/**
 * Whether story `owned` merges on its own now: auto-merge is `on`, Merge would take it (`writable` says whether its
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
  // STORY-61's Hold goes here: a held story never merges on its own.
  return mergeRefusal(owned, owned.card.id, config, writable) === null && provenAt(owned.card, target.head);
}

/** The summary of the Dev Lead's "merged" notice for a story that merged on its own into `into`. */
export const autoMergedSummary = (into: string, remains: readonly string[]): string =>
  [`${into}, on its own.`, ...remains].join(" ");
