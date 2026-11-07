/**
 * How git facts become the `BranchState` that `ownerOf` reads (ADR 0016). Git doesn't say which branch belongs to
 * which card, or when a branch merged, so these rules do. Pure: the server gathers the facts and passes them in.
 */
import type { BranchState, FeatureBranchState, WorktreeState } from "./ownership.ts";

/** FEAT-<n> for a branch named `feature/<n>` or `feature/<n>-…`, else null. */
export function featureIdOfBranch(branch: string): string | null {
  const m = /^feature\/(\d+)(?:-.*)?$/.exec(branch);
  return m?.[1] ? `FEAT-${Number(m[1])}` : null;
}

/**
 * STORY-<n> or BUG-<n> for a branch with a segment that starts `story-<n>` or `bug-<n>`, followed by `-` or the end
 * of the segment (case-insensitive): `claude/story-2-init-86a6bd` is STORY-2, and `story-24` is never STORY-2.
 */
export function itemIdOfBranch(branch: string): string | null {
  for (const segment of branch.split("/")) {
    const m = /^(story|bug)-(\d+)(?:-|$)/i.exec(segment);
    if (m?.[1] && m[2]) return `${m[1].toUpperCase()}-${Number(m[2])}`;
  }
  return null;
}

/** A worktree as `git worktree list` reports it. `branch` is null for a detached HEAD. */
export interface GitWorktree {
  path: string;
  branch: string | null;
}

/** A local branch, and whether its tip is already in the base branch. */
export interface GitBranch {
  name: string;
  inBase: boolean;
}

export interface BranchFacts {
  baseBranch: string;
  worktrees: readonly GitWorktree[];
  branches: readonly GitBranch[];
  /** The `branch:` field of every card copy that sets one: card ID → branch names. */
  cardBranches: ReadonlyMap<string, readonly string[]>;
}

/**
 * - A feature branch is active unless it has no worktree and its tip is in the base branch. A branch made at the
 *   base with no commits reads as merged: its cards are the base's, byte for byte.
 * - A story or bug owns the worktree its `branch:` field names; failing that, the worktree whose branch name has its
 *   ID (see `itemIdOfBranch`). A worktree some card's field names is that card's alone. A live worktree is never
 *   merged; detached worktrees and those on the base or a feature branch belong to no story.
 */
export function branchStateOf(facts: BranchFacts): BranchState {
  const checkedOut = new Set(facts.worktrees.flatMap((w) => (w.branch ? [w.branch] : [])));
  const features: Record<string, FeatureBranchState> = {};
  for (const b of facts.branches) {
    const id = featureIdOfBranch(b.name);
    if (id) features[id] = { branch: b.name, merged: b.inBase && !checkedOut.has(b.name) };
  }

  const storyTrees = facts.worktrees.filter(
    (w): w is { path: string; branch: string } =>
      w.branch !== null && w.branch !== facts.baseBranch && featureIdOfBranch(w.branch) === null,
  );
  const worktrees: Record<string, WorktreeState> = {};
  const claimed = new Set<string>();
  for (const [id, branches] of facts.cardBranches) {
    const tree = storyTrees.find((w) => branches.includes(w.branch));
    if (!tree) continue;
    worktrees[id] = { branch: tree.branch, path: tree.path, merged: false };
    claimed.add(tree.path);
  }
  for (const tree of storyTrees) {
    const id = itemIdOfBranch(tree.branch);
    if (!id || claimed.has(tree.path) || worktrees[id]) continue;
    worktrees[id] = { branch: tree.branch, path: tree.path, merged: false };
  }
  return { features, worktrees };
}
