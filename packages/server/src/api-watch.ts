/**
 * The local API's card watches: one card as the card pane shows it (ADR 0017), and a feature's review screen
 * (STORY-69). Both are picks over the project's scan, so each pushes again whenever the scan changes: a story moving,
 * a check finishing or proof arriving (both rescan), a PR read, or git's diff stats read for the review.
 */
import {
  buildFeatureReview,
  changesOf,
  featureApprovalOf,
  featureRowOf,
  summaryOf,
  type FeatureReview,
  type WorkList,
} from "@featra/work-format";
import type { AllowedProjects } from "./allowed-projects.ts";
import type { Connection } from "./api.ts";
import { cardViewIn, ownedIn } from "./card-actions.ts";
import type { DesignReviews } from "./design-reviews.ts";
import type { FeatureEnd } from "./feature-end.ts";
import type { ProofCapture } from "./proof-capture.ts";
import type { ReviewDiffs } from "./review-diffs.ts";
import type { StoryChecks } from "./story-checks.ts";
import type { StoryPrs } from "./story-prs.ts";
import type { Scan } from "./work-scan.ts";
import type { WorkWatches } from "./work-watch.ts";

export interface WatchApiDeps {
  watches: Pick<WorkWatches, "observe">;
  allowed: Pick<AllowedProjects, "has">;
  checks: Pick<StoryChecks, "checksFor">;
  prs: Pick<StoryPrs, "prState" | "decorate">;
  features?: Pick<FeatureEnd, "checksFor" | "prState" | "mergeState">;
  /** What each story changed, from git (STORY-69). Without it the review shows no diff stats. */
  diffs?: Pick<ReviewDiffs, "of" | "repo">;
  /** Adds a story's proof notes and Preview to its card (STORY-25). */
  proof?: Pick<ProofCapture, "decorate">;
  /** Adds where a story's design review stands to its card (STORY-73). */
  design?: Pick<DesignReviews, "decorate">;
  /** A card's folder, an open project, and its id; throws otherwise. */
  card: (params: unknown) => [dir: string, id: string];
}

export type WatchMethod = "card.watch" | "review.watch";

export function createWatchApi({ watches, allowed, checks, prs, features, diffs, card, proof, design }: WatchApiDeps) {
  /** Card `id` of `dir` as the card pane shows it, with its checks, PR and merge state as last read. */
  const viewIn = (dir: string, scan: Scan | null) => (id: string) => {
    const view = cardViewIn(
      scan,
      id,
      checks.checksFor(dir, id) ?? features?.checksFor(dir, id),
      prs.prState(dir, id) ?? features?.prState(dir, id),
    );
    const shown = proof ? proof.decorate(dir, scan, view) : view;
    return design ? design.decorate(dir, scan, shown) : shown;
  };

  /** Feature `id`'s review screen, with where its approval stands; null when `id` isn't a feature with a Work row. */
  function reviewIn(dir: string, scan: Scan | null, list: WorkList, id: string): FeatureReview | null {
    const view = viewIn(dir, scan);
    const feature = view(id);
    const owned = ownedIn(scan, id)?.owned.card;
    const row = featureRowOf(prs.decorate(dir, list), id);
    if (!scan || !feature || feature.type !== "feature" || !owned || !row) return null;
    return buildFeatureReview({
      row,
      feature,
      view,
      diff: diffs?.of(dir, scan, id) ?? (() => null),
      summary: summaryOf(owned),
      changes: changesOf(owned),
      repo: diffs?.repo(dir) ?? null,
      base: scan.collected.git.baseBranch,
      approval: featureApprovalOf(
        owned,
        scan.resolution.cards.map((c) => c.card),
        scan.collected.config,
        features?.mergeState(dir, id),
      ),
    });
  }

  return async (method: WatchMethod, params: unknown, watch: number, connection: Connection) => {
    const [dir, id] = card(params);
    if (method === "card.watch") {
      const { value, stop } = await watches.observe(
        dir,
        (scan) => viewIn(dir, scan)(id),
        (next) => allowed.has(dir) && connection.push("card.view", watch, next),
      );
      connection.keep(watch, stop);
      return value;
    }
    const { value, stop } = await watches.observe(
      dir,
      (scan, list) => reviewIn(dir, scan, list, id),
      (next) => allowed.has(dir) && connection.push("review.view", watch, next),
    );
    connection.keep(watch, stop);
    return value;
  };
}
