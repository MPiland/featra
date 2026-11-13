/**
 * What story PRs (STORY-11) follow of a project between scans: each story's review state, PR and owner, and the
 * project's PR settings. A move into review is told from the scan before.
 */
import { checksApply, type Card } from "@featra/work-format";
import type { Scan } from "./work-scan.ts";

/** A story as story PRs follow it. */
export interface Followed {
  id: string;
  inReview: boolean;
  pr: string | null;
  /** Its owner copy is its own worktree, where the branch is pushed from. */
  worktree: boolean;
}

export interface ProjectSeen {
  auto: boolean;
  minutes: number;
  stories: Followed[];
}

/** The key of story `id` of the project at `dir` in the per-story maps; every key of a project starts `keyOf(dir, "")`. */
export const keyOf = (dir: string, id: string) => `${dir}\0${id}`;

/** The branch a story's PR goes into: its feature's branch, else the project's base branch. */
export const baseOf = (scan: Scan, card: Card) =>
  (card.parent && scan.collected.state.features[card.parent]?.branch) || scan.collected.git.baseBranch;

export function seenOf(scan: Scan | null): ProjectSeen {
  if (!scan) return { auto: false, minutes: 2, stories: [] };
  const { config } = scan.collected;
  const stories = scan.resolution.cards.flatMap(({ card, owner }): Followed[] =>
    card.type === "story"
      ? [{ id: card.id, inReview: checksApply(card, config), pr: card.pr, worktree: owner.kind === "worktree" }]
      : [],
  );
  return { auto: config.openStoryPrs, minutes: config.prRefreshMinutes, stories };
}
