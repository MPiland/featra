import { stageCategory } from "./config.ts";
import { ownerOf, type BranchState } from "./ownership.ts";
import type { Card, ProjectConfig } from "./types.ts";

/**
 * Whether `card` is a story or bug still being worked, so a problem it caused is a task on it: in an active stage, and
 * its card still owned by its worktree. Once merged into its feature (owned by the feature branch) it isn't (ADR 0036).
 */
export const takesTask = (card: Card, config: ProjectConfig, state: BranchState): boolean =>
  (card.type === "story" || card.type === "bug") &&
  stageCategory(card.status, config) === "active" &&
  ownerOf(card, state).kind === "worktree";

/** Whether `card` is a feature in progress, so a problem it caused is a bug card under it. A Done one never is. */
export const takesBug = (card: Card): boolean => card.type === "feature" && card.status === "active";

export type ProblemRoute =
  /** The cause is a story (or bug) still being worked: add a task to it. */
  | { kind: "task"; card: string }
  /** The cause is in a feature currently in progress: a bug card under that feature (added scope). */
  | { kind: "feature-bug"; feature: string }
  /** No in-progress cause: the project bug list. Done features stay Done. */
  | { kind: "project-bug" };

/**
 * Decides where a newly found problem goes. `causedBy` is the card believed to have caused it
 * (a story, bug or feature), or null when unknown. `state` says which stories are still in their worktrees.
 */
export function routeProblem(
  causedBy: string | null,
  cards: readonly Card[],
  config: ProjectConfig,
  state: BranchState,
): ProblemRoute {
  const cause = causedBy ? cards.find((c) => c.id === causedBy) : undefined;
  if (!cause) return { kind: "project-bug" };

  let featureId: string | null;
  if (cause.type === "story" || cause.type === "bug") {
    if (takesTask(cause, config, state)) return { kind: "task", card: cause.id };
    featureId = cause.parent;
  } else if (cause.type === "feature") {
    featureId = cause.id;
  } else {
    return { kind: "project-bug" };
  }

  const feature = featureId ? cards.find((c) => c.id === featureId) : undefined;
  return feature && takesBug(feature) ? { kind: "feature-bug", feature: feature.id } : { kind: "project-bug" };
}
