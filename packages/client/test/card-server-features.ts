// The fake card server's feature end (STORY-14, STORY-70): Approve, Create PR, Run again and Merge to main, with
// work-format's rules.
import { DEFAULT_CONFIG, doneFeature, featureAcceptRefusal, withFeatureAccepted, type Card } from "@featra/work-format";
import type { CardBridge } from "../src/card-pane.ts";

export type FeatureActions = "approveFeature" | "createFeaturePr" | "rerunFeatureChecks" | "mergeFeature";

export interface FeatureFakeContext {
  /** The folder's cards as the fake server holds them now. */
  cardsIn: (dir: string) => Card[];
  /** The server sees a card change and pushes it. */
  changed: (dir: string, card: Card) => void;
  calls: string[];
  /** The answers a test sets; each left out, the fake does what the server does. */
  review: Partial<Pick<CardBridge, FeatureActions>>;
  /** The time the fake server stamps on a card edit. */
  at: string;
}

export function featureEndFakes({
  cardsIn,
  changed,
  calls,
  review,
  at,
}: FeatureFakeContext): Pick<CardBridge, FeatureActions> {
  return {
    // Approving a feature is the server's to prove (the lane, git, gh): the fake applies work-format's Accept rule and
    // makes the feature Done with the user's Accept in it, as the server does, unless the test sets the answer.
    approveFeature: async (dir, id) => {
      calls.push(`approveFeature:${dir}:${id}`);
      if (review.approveFeature) return review.approveFeature(dir, id);
      const cards = cardsIn(dir);
      const card = cards.find((c) => c.id === id);
      const why = featureAcceptRefusal(card, id, cards, DEFAULT_CONFIG);
      if (why !== null || !card) return { ok: false, error: why ?? "That card is gone." };
      changed(dir, doneFeature(withFeatureAccepted(card, "user", at), `feature/${id}`, "main", null, "system", at));
      return { ok: true, remains: [] };
    },
    createFeaturePr: async (dir, id) => {
      calls.push(`createFeaturePr:${dir}:${id}`);
      return review.createFeaturePr ? review.createFeaturePr(dir, id) : { ok: true };
    },
    rerunFeatureChecks: async (dir, id) => {
      calls.push(`rerunFeatureChecks:${dir}:${id}`);
      return review.rerunFeatureChecks ? review.rerunFeatureChecks(dir, id) : { ok: true };
    },
    // Merging a feature is the server's to prove (git, gh): the fake makes it Done, as the server does, unless the test
    // sets the answer.
    mergeFeature: async (dir, id) => {
      calls.push(`mergeFeature:${dir}:${id}`);
      if (review.mergeFeature) return review.mergeFeature(dir, id);
      const card = cardsIn(dir).find((c) => c.id === id);
      if (!card) return { ok: false, error: "That card is gone." };
      changed(dir, doneFeature(card, `feature/${id}`, "main", null, "system", at));
      return { ok: true, remains: [] };
    },
  };
}
