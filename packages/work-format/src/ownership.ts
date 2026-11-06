import type { Card } from "./types.ts";
import { assertNever } from "./utils/guards.ts";

/** Where a card's authoritative copy lives (ADR 0002). */
export type OwnerLocation =
  | { kind: "main" }
  | { kind: "feature"; branch: string }
  | { kind: "worktree"; branch: string; path: string };

export interface FeatureBranchState {
  branch: string;
  /** True once the feature branch has been merged to main. */
  merged: boolean;
}

export interface WorktreeState {
  branch: string;
  path: string;
  /** True once the story's work has been merged into its feature branch. */
  merged: boolean;
}

/** Git facts the server knows. Keys are card IDs. */
export interface BranchState {
  features: Record<string, FeatureBranchState>;
  worktrees: Record<string, WorktreeState>;
}

export const MAIN: OwnerLocation = { kind: "main" };

/**
 * The single owning location of a card:
 * - epics, drafts and backlog cards: main
 * - a started feature (branch exists, not merged): its feature branch
 * - a story or bug with a live worktree: that worktree
 * - a story or bug whose worktree merged (or never existed) under a started feature: the feature branch
 * - everything once its feature has merged to main: main
 */
export function ownerOf(card: Pick<Card, "id" | "type" | "parent">, state: BranchState): OwnerLocation {
  switch (card.type) {
    case "epic":
      return MAIN;
    case "feature":
      return activeFeature(card.id, state) ?? MAIN;
    case "story":
    case "bug": {
      const wt = state.worktrees[card.id];
      if (wt && !wt.merged) return { kind: "worktree", branch: wt.branch, path: wt.path };
      return (card.parent && activeFeature(card.parent, state)) || MAIN;
    }
    default:
      return assertNever(card.type);
  }
}

function activeFeature(featureId: string, state: BranchState): OwnerLocation | null {
  const f = state.features[featureId];
  return f && !f.merged ? { kind: "feature", branch: f.branch } : null;
}

export function sameLocation(a: OwnerLocation, b: OwnerLocation): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "main") return true;
  if (a.kind === "worktree" && b.kind === "worktree") return a.path === b.path;
  return a.kind === "feature" && b.kind === "feature" && a.branch === b.branch;
}

export function locationLabel(loc: OwnerLocation): string {
  switch (loc.kind) {
    case "main":
      return "main";
    case "feature":
      return `feature branch ${loc.branch}`;
    case "worktree":
      return `worktree ${loc.branch}`;
    default:
      return assertNever(loc);
  }
}
