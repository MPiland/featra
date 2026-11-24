// The local server's review side (STORY-69), as a fake: the review built with work-format's own builder from the fake
// card server's Work list and cards, pushed again on every change. Git's diff stats are the test's to give. "Not yet"
// and its Dismiss (STORY-71) change the feature's history with work-format's own rules; sending the reason to the Dev
// Lead's chat is the server's to prove, so the fake answers what the test sets.
import {
  buildFeatureReview,
  CHANGES_REFUSALS,
  changesOf,
  changesOpen,
  checkReason,
  DEFAULT_CONFIG,
  featureApprovalOf,
  featureRowOf,
  recordChangesAsked,
  recordChangesDismissed,
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
  /** The server sees a card change and pushes it. */
  changed: (dir: string, card: Card) => void;
}

export interface ReviewFakeOptions {
  diffs?: Record<string, DiffStat>;
  /** What "Not yet" answers when the server refuses it; unset, it is sent and logged. */
  askRefusal?: string;
  calls: string[];
  /** The time the fake server stamps on a history entry. */
  at: string;
}

/** The fake project's GitHub repository, for the feature's Files changed before it has a PR. */
export const REVIEW_REPO = "acme/app";

export function fakeReviewServer(cards: ReviewSource, options: ReviewFakeOptions): ReviewBridge {
  const { diffs = {}, askRefusal, calls, at } = options;
  const cardOf = (dir: string, id: string) => cards.cardsIn(dir).find((c) => c.id === id);
  const reviewOf = (dir: string, id: string) => {
    const list = cards.listOf(dir);
    const row = list ? featureRowOf(list, id) : null;
    const feature = cards.viewOf(dir, id);
    const card = cardOf(dir, id);
    if (!row || !feature || feature.type !== "feature" || !card) return null;
    return buildFeatureReview({
      row,
      feature,
      view: (s) => cards.viewOf(dir, s),
      diff: (s) => diffs[s] ?? null,
      summary: summaryOf(card),
      changes: changesOf(card),
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
    askChanges: async (dir, id, reason) => {
      calls.push(`askChanges:${dir}:${id}:${reason}`);
      const why = askRefusal ?? checkReason(reason);
      const card = cardOf(dir, id);
      if (why !== null || !card) return { ok: false, error: why ?? CHANGES_REFUSALS.gone };
      cards.changed(dir, recordChangesAsked(card, reason, "user", at));
      return { ok: true, recorded: true };
    },
    dismissChanges: async (dir, id) => {
      calls.push(`dismissChanges:${dir}:${id}`);
      const card = cardOf(dir, id);
      if (!card || !changesOpen(card)) return { ok: false, error: CHANGES_REFUSALS.nothingAsked };
      cards.changed(dir, recordChangesDismissed(card, "user", at));
      return { ok: true };
    },
  };
}
