/**
 * The stages a story is reviewed in, found by position so a project may rename them: the ceiling a report may move a
 * story to (Acceptance by default, STORY-10), and the review stage before it (In Review, STORY-56). Here, not in
 * card-report.ts or checks.ts, so the rules both use (and the design review's, STORY-73) import them without a cycle.
 */
import { stageCategory } from "./config.ts";
import type { Card, ProjectConfig } from "./types.ts";

/** The stage a report may move up to: the last one before the first that counts as done (Acceptance by default). */
export function stageCeiling(config: ProjectConfig): string | null {
  const firstDone = config.stages.findIndex((s) => stageCategory(s.name, config) === "done");
  return config.stages[(firstDone < 0 ? config.stages.length : firstDone) - 1]?.name ?? null;
}

/**
 * The stage a story is reviewed in: the one before Acceptance when that is active and not the first active stage
 * (In Review by default), else Acceptance itself. Found by position, so a project may rename its stages.
 */
export function reviewStage(config: ProjectConfig): string | null {
  const ceiling = stageCeiling(config);
  if (ceiling === null) return null;
  const at = config.stages.findIndex((s) => s.name === ceiling);
  const before = config.stages[at - 1];
  const firstActive = config.stages.findIndex((s) => s.category === "active");
  return before && before.category === "active" && at - 1 !== firstActive ? before.name : ceiling;
}

/** Whether `status` is in review: from the review stage up to the ceiling, and still active. */
export function inReview(status: string, config: ProjectConfig): boolean {
  const names = config.stages.map((s) => s.name);
  const from = names.indexOf(reviewStage(config) ?? "");
  const to = names.indexOf(stageCeiling(config) ?? "");
  const at = names.indexOf(status);
  return from >= 0 && at >= from && at <= to && stageCategory(status, config) === "active";
}

/** Whether checks apply to `card` now: a story in its review stage or in Acceptance. Not while it is being built. */
export const checksApply = (card: Card, config: ProjectConfig): boolean =>
  card.type === "story" && inReview(card.status, config);
