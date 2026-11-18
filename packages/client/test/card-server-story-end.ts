// The fake card server's Hold (STORY-61) and Abandon (STORY-58), with work-format's rules.
import {
  abandonedStory,
  abandonRefusal,
  DEFAULT_CONFIG,
  heldStory,
  holdRefusal,
  type Card,
  type OwnedCard,
} from "@featra/work-format";
import type { CardBridge } from "../src/card-pane.ts";
import type { FeatureFakeContext } from "./card-server-features.ts";

export type StoryEndActions = "holdStory" | "abandonCheck" | "abandonStory";

export interface StoryEndFakeContext extends Omit<FeatureFakeContext, "review"> {
  review: Partial<Pick<CardBridge, StoryEndActions>>;
  /** Where the server finds the card: its owner copy. */
  owned: (card: Card) => OwnedCard;
  /** The server sees cards deleted and pushes the change. */
  removed: (dir: string, ids: string[]) => void;
}

export function storyEndFakes({
  cardsIn,
  changed,
  removed,
  calls,
  review,
  at,
  owned,
}: StoryEndFakeContext): Pick<CardBridge, StoryEndActions> {
  const find = (dir: string, id: string) => cardsIn(dir).find((c) => c.id === id);
  return {
    // Hold is the server's to prove (the lane, the owner copy): the fake applies work-format's rules to the card.
    holdStory: async (dir, id, held) => {
      calls.push(`holdStory:${dir}:${id}:${held}`);
      if (review.holdStory) return review.holdStory(dir, id, held);
      const card = find(dir, id);
      const why = holdRefusal(card && owned(card), id, DEFAULT_CONFIG, true);
      if (why !== null || !card) return { ok: false, error: why ?? "That card is gone." };
      changed(dir, heldStory(card, held, "user", at));
      return { ok: true };
    },
    // Abandoning is the server's to prove (the session, git, gh): the fake refuses with work-format's rule and, unless
    // a test sets the answer, warns of nothing but the card, then keeps it as Cancelled or deletes it.
    abandonCheck: async (dir, id) => {
      calls.push(`abandonCheck:${dir}:${id}`);
      if (review.abandonCheck) return review.abandonCheck(dir, id);
      const card = find(dir, id);
      const why = abandonRefusal(card && owned(card), id, DEFAULT_CONFIG, true);
      if (why !== null) return { ok: false, error: why };
      return { ok: true, warning: { files: [], unpushed: [], pr: null, branch: null, remotes: [], token: "t" } };
    },
    abandonStory: async (dir, id, keep, token) => {
      calls.push(`abandonStory:${dir}:${id}:${keep}:${token}`);
      if (review.abandonStory) return review.abandonStory(dir, id, keep, token);
      const card = find(dir, id);
      const why = abandonRefusal(card && owned(card), id, DEFAULT_CONFIG, true);
      if (why !== null || !card) return { ok: false, error: why ?? "That card is gone." };
      if (keep) changed(dir, abandonedStory(card, "user", at));
      else removed(dir, [id]);
      return { ok: true, remains: [] };
    },
  };
}
