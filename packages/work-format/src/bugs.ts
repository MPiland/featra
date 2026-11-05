import { stageCategory } from "./config.ts";
import type { Card, ProjectConfig } from "./types.ts";

export type ProblemRoute =
  /** The cause is a story (or bug) still being worked: add a task to it. */
  | { kind: "task"; card: string }
  /** The cause is in a feature currently in progress: a bug card under that feature (added scope). */
  | { kind: "feature-bug"; feature: string }
  /** No in-progress cause: the project bug list. Done features stay Done. */
  | { kind: "project-bug" };

/**
 * Decides where a newly found problem goes. `causedBy` is the card believed to have caused it
 * (a story, bug or feature), or null when unknown.
 */
export function routeProblem(causedBy: string | null, cards: readonly Card[], config: ProjectConfig): ProblemRoute {
  const cause = causedBy ? cards.find((c) => c.id === causedBy) : undefined;
  if (!cause) return { kind: "project-bug" };

  let featureId: string | null;
  if (cause.type === "story" || cause.type === "bug") {
    if (stageCategory(cause.status, config) === "active") return { kind: "task", card: cause.id };
    featureId = cause.parent;
  } else if (cause.type === "feature") {
    featureId = cause.id;
  } else {
    return { kind: "project-bug" };
  }

  const feature = featureId ? cards.find((c) => c.id === featureId && c.type === "feature") : undefined;
  return feature?.status === "active" ? { kind: "feature-bug", feature: feature.id } : { kind: "project-bug" };
}
