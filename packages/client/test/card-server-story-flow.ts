// The fake card server's Stop and Resume, Accept and Send back, and Merge of a story, with work-format's rules.
import {
  acceptanceRefusal,
  acceptedStory,
  DEFAULT_CONFIG,
  isStopped,
  mergedStory,
  mergeRefusal,
  resumedStory,
  resumeRefusal,
  sentBackStory,
  stageTone,
  stopRefusal,
  stoppedStory,
  type Card,
  type OwnedCard,
  type StoryTurn,
} from "@featra/work-format";
import type { CardBridge } from "../src/card-pane.ts";
import type { FeatureFakeContext } from "./card-server-features.ts";

export type StoryFlowActions = "stopStory" | "resumeStory" | "acceptStory" | "sendBackStory" | "mergeStory";

export interface StoryFlowFakeContext extends Omit<FeatureFakeContext, "review"> {
  review: Partial<Pick<CardBridge, StoryFlowActions>>;
  /** Where the server finds the card: its owner copy. */
  owned: (card: Card) => OwnedCard;
  /** The feature branch a story merges into. */
  featureBranch: (story: Card) => string;
  /** The server's side of a story's session for Stop and Resume: its turn, and taking it out of the queue. */
  agents: { turn: (dir: string, id: string) => StoryTurn; drop: (dir: string, id: string) => void };
}

export function storyFlowFakes({
  cardsIn,
  changed,
  calls,
  review,
  at,
  owned,
  featureBranch,
  agents,
}: StoryFlowFakeContext): Pick<CardBridge, StoryFlowActions> {
  const find = (dir: string, id: string) => cardsIn(dir).find((c) => c.id === id);
  return {
    // Stop and Resume are the server's to prove (the agent, the lane): the fake records the call and applies work-format's
    // rules to the card, as the server does once the agent has stopped or gone on.
    stopStory: async (dir, id) => {
      calls.push(`stopStory:${dir}:${id}`);
      if (review.stopStory) return review.stopStory(dir, id);
      const card = find(dir, id);
      const tone = card ? stageTone(card.status, DEFAULT_CONFIG) : "idle";
      // A story still queued, never started, just leaves the queue: its card is as it was.
      if (card?.type === "story" && card.agent === null && agents.turn(dir, id).queued) {
        agents.drop(dir, id);
        return { ok: true };
      }
      const why = stopRefusal(card, tone);
      if (why !== null || !card) return { ok: false, error: why ?? "That card is gone." };
      changed(dir, stoppedStory(card, "user", at));
      return { ok: true };
    },
    resumeStory: async (dir, id) => {
      calls.push(`resumeStory:${dir}:${id}`);
      if (review.resumeStory) return review.resumeStory(dir, id);
      const card = find(dir, id);
      const tone = card ? stageTone(card.status, DEFAULT_CONFIG) : "idle";
      const why = resumeRefusal(card, tone, agents.turn(dir, id));
      if (why !== null || !card) return { ok: false, error: why ?? "That card is gone." };
      // Only a Stopped story has a mark to clear; an idle session that ended without finishing just goes on.
      if (isStopped(card)) changed(dir, resumedStory(card, "user", at));
      return { ok: true };
    },
    // Accept and Send back are the server's to prove (the lane, the session): the fake records the call and applies
    // work-format's rules to the card, as the server does.
    acceptStory: async (dir, id) => {
      calls.push(`acceptStory:${dir}:${id}`);
      if (review.acceptStory) return review.acceptStory(dir, id);
      const card = find(dir, id);
      const why = acceptanceRefusal(card, id, DEFAULT_CONFIG);
      if (why !== null || !card) return { ok: false, error: why ?? "That card is gone." };
      changed(dir, acceptedStory(card, DEFAULT_CONFIG, "user", at));
      return { ok: true };
    },
    sendBackStory: async (dir, id, reason, addCriterion) => {
      calls.push(`sendBackStory:${dir}:${id}:${reason}:${addCriterion}`);
      if (review.sendBackStory) return review.sendBackStory(dir, id, reason, addCriterion);
      const card = find(dir, id);
      const why = acceptanceRefusal(card, id, DEFAULT_CONFIG);
      if (why !== null || !card) return { ok: false, error: why ?? "That card is gone." };
      changed(dir, sentBackStory(card, DEFAULT_CONFIG, reason, addCriterion, "user", at));
      return { ok: true, recorded: true };
    },
    // Merging is the server's to prove (git, gh, the worktree): the fake refuses with work-format's rule, as the server
    // does for a card main owns, unless the test sets the answer.
    mergeStory: async (dir, id) => {
      calls.push(`mergeStory:${dir}:${id}`);
      if (review.mergeStory) return review.mergeStory(dir, id);
      const card = find(dir, id);
      const why = mergeRefusal(card && owned(card), id, DEFAULT_CONFIG, true);
      if (why !== null || !card) return { ok: false, error: why ?? "That card is gone." };
      changed(dir, mergedStory(card, featureBranch(card), "system", at));
      return { ok: true, remains: [] };
    },
  };
}
