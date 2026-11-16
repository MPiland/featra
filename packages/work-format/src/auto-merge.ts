/**
 * Auto-merge (STORY-59, ADR 0034): a story merges into its feature branch on its own once it is Verified and Proven,
 * when the project's `autoMerge` is on. It is the merge Merge makes, by `system`, so it needs what Merge needs
 * (`mergeRefusal`) and every criterion proven as well. Accept gates Done, not the merge.
 */
import { evidenceState } from "./evidence.ts";
import { mergeRefusal } from "./merge.ts";
import type { OwnedCard } from "./owner-copies.ts";
import type { ProjectConfig } from "./types.ts";

/**
 * Whether story `owned` merges on its own now: auto-merge is `on`, Merge would take it (`writable` says whether its
 * owner copy is checked out), and it is Proven. A card whose owner copy can't be read never does: the copy shown may be
 * stale (BUG-24). The feature branch it merges into and the commit its evidence is for are the server's to check, as
 * for Merge.
 */
export function mergesOnItsOwn(
  owned: OwnedCard | undefined,
  config: ProjectConfig,
  writable: boolean,
  on: boolean,
): boolean {
  if (!on || !owned || owned.ownerUnread) return false;
  // STORY-61's Hold goes here: a held story never merges on its own.
  return mergeRefusal(owned, owned.card.id, config, writable) === null && evidenceState(owned.card).proven;
}

/** The summary of the Dev Lead's "merged" notice for a story that merged on its own into `into`. */
export const autoMergedSummary = (into: string, remains: readonly string[]): string =>
  [`${into}, on its own.`, ...remains].join(" ");
