// The fake card server's feature end (STORY-14): Accept, Create PR, Run again and Merge to main, with work-format's rules.
import { DEFAULT_CONFIG, doneFeature, featureAcceptRefusal, withFeatureAccepted, type Card } from "@featra/work-format";
import type { CardBridge } from "../src/card-pane.ts";

export type FeatureActions = "acceptFeature" | "createFeaturePr" | "rerunFeatureChecks" | "mergeFeature";

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
    // Accepting a feature is the server's to prove (the lane, its PR): the fake applies work-format's rule and records
    // Accepted, as the server does, unless the test sets the answer.
    acceptFeature: async (dir, id) => {
      calls.push(`acceptFeature:${dir}:${id}`);
      if (review.acceptFeature) return review.acceptFeature(dir, id);
      const cards = cardsIn(dir);
      const card = cards.find((c) => c.id === id);
      const why = featureAcceptRefusal(card, id, cards, DEFAULT_CONFIG);
      if (why !== null || !card) return { ok: false, error: why ?? "That card is gone." };
      changed(dir, withFeatureAccepted(card, "user", at));
      return { ok: true };
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
