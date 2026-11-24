// The local server's review side (STORY-69), as a fake: the review built with work-format's own builder from the fake
// card server's Work list and cards, pushed again on every change. Git's diff stats are the test's to give.
import {
  buildFeatureReview,
  DEFAULT_CONFIG,
  featureApprovalOf,
  featureRowOf,
  summaryOf,
  type Card,
  type CardView,
  type DiffStat,
  type FeatureMergeState,
  type WorkList,
} from "@featra/work-format";
import type { ReviewBridge } from "../src/review-screen.ts";

export interface ReviewSource {
  listOf: (dir: string) => WorkList | null;
  viewOf: (dir: string, id: string) => CardView | null;
  cardsIn: (dir: string) => Card[];
  onChange: (listener: (dir: string) => void) => () => void;
  /** What stops a feature's merge, as the test sets it (STORY-70's Approve). */
  mergeOf: (dir: string, id: string) => FeatureMergeState | undefined;
}

/** The fake project's GitHub repository, for the feature's Files changed before it has a PR. */
export const REVIEW_REPO = "acme/app";

export function fakeReviewServer(cards: ReviewSource, diffs: Record<string, DiffStat> = {}): ReviewBridge {
  const reviewOf = (dir: string, id: string) => {
    const list = cards.listOf(dir);
    const row = list ? featureRowOf(list, id) : null;
    const feature = cards.viewOf(dir, id);
    const card = cards.cardsIn(dir).find((c) => c.id === id);
    if (!row || !feature || feature.type !== "feature" || !card) return null;
    return buildFeatureReview({
      row,
      feature,
      view: (s) => cards.viewOf(dir, s),
      diff: (s) => diffs[s] ?? null,
      summary: summaryOf(card),
      repo: REVIEW_REPO,
      base: "main",
      approval: featureApprovalOf(card, cards.cardsIn(dir), DEFAULT_CONFIG, cards.mergeOf(dir, id)),
    });
  };
  return {
    watchReview(dir, id, listener) {
      const push = () => listener({ review: reviewOf(dir, id), loading: false, error: null });
      queueMicrotask(push);
      return cards.onChange((d) => d === dir && push());
    },
  };
}
