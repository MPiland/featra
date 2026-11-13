// The local server's card side, as a fake: cards held in memory, edited with work-format's own rules.
import {
  abandonedStory,
  abandonRefusal,
  acceptanceRefusal,
  acceptedStory,
  applyCardEdit,
  notStartableReason,
  notSpawnableReason,
  startedFeature,
  startedStory,
  storyBranchName,
  buildCardView,
  buildWorkList,
  DEFAULT_CONFIG,
  draftStories,
  isMerged,
  isStopped,
  MAIN,
  mergedStory,
  mergeRefusal,
  planApproval,
  resumedStory,
  resumeRefusal,
  sentBackStory,
  stageTone,
  stopRefusal,
  stoppedStory,
  type StoryTurn,
  type Card,
  type CardChecks,
  withPrStatus,
  type CardPr,
  type CardView,
  type OwnedCard,
  type OwnerLocation,
  type WorkList,
} from "@featra/work-format";
import type { CardBridge, CardUpdate } from "../src/card-pane.ts";

/** The card actions a test can set the server's answer to; each left out, the fake does what the server does. */
export type ReviewAnswers = Partial<
  Pick<
    CardBridge,
    | "approve"
    | "reject"
    | "start"
    | "startStory"
    | "stopStory"
    | "resumeStory"
    | "acceptStory"
    | "sendBackStory"
    | "rerunChecks"
    | "createPr"
    | "mergeStory"
    | "abandonCheck"
    | "abandonStory"
  >
>;

/** The time the fake server stamps on a card edit. */
export const EDIT_AT = "2026-11-05T12:00:00Z";

/**
 * Where a card lives, as the server resolves it (ADR 0002): a started story in its worktree until it merges, then on
 * its feature branch (STORY-12); everything else on main. Every location is checked out here.
 */
function ownerOf(card: Card): OwnerLocation {
  if (!card.branch) return MAIN;
  if (isMerged(card)) return { kind: "feature", branch: featureBranch(card) };
  return { kind: "worktree", branch: card.branch, path: `/worktrees/${card.id}` };
}
const featureBranch = (story: Card) => `feature/${story.parent ?? ""}`;
const owned = (card: Card): OwnedCard => {
  const owner = ownerOf(card);
  return { card, owner, shownFrom: owner, path: `.featra/cards/${card.id}.md` };
};
const replace = (cards: Card[], card: Card) => cards.map((c) => (c.id === card.id ? card : c));

/**
 * Each folder's cards, owned by main and checked out. `listChanged` hears the folder's new Work list, built by
 * work-format, whenever its cards change; `calls` records each update.
 */
export function fakeCardServer(
  given: Record<string, Card[]>,
  calls: string[],
  listChanged: (dir: string, list: WorkList) => void,
  /** What the server answers to Send back. */
  sendBack: CardBridge["sendBack"] = async () => ({ ok: true, recorded: true }),
  /** What the server answers to Approve and Reject; left out, the fake does what the server does to the cards. */
  review: ReviewAnswers = {},
  /** The chat the server starts for a story, and whether it waits for a slot: what a Start makes besides the card change. */
  storySession: (dir: string, story: Card, feature: Card) => { chat: string; queued: boolean } = () => ({
    chat: "story-chat",
    queued: false,
  }),
  /** The server's side of a story's session for Stop and Resume: its turn, and taking it out of the queue. */
  agents: { turn: (dir: string, id: string) => StoryTurn; drop: (dir: string, id: string) => void } = {
    turn: () => ({ running: false, queued: false, stalled: false }),
    drop: () => {},
  },
  /** What the server's checks say about a story's card: absent when CI runs them. */
  checksOf: (dir: string, id: string) => CardChecks | undefined = () => undefined,
  /** What the server knows of a story's PR (STORY-11): on its card, and its state on the story's Work row. */
  prOf: (dir: string, id: string) => CardPr | undefined = () => undefined,
) {
  const cardSets = new Map(Object.entries(given));
  const watchers = new Map<string, Set<(u: CardUpdate) => void>>();
  const viewOf = (dir: string, id: string): CardView | null => {
    const cards = cardSets.get(dir) ?? [];
    const card = cards.find((c) => c.id === id);
    return card
      ? buildCardView(owned(card), true, { config: DEFAULT_CONFIG, cards }, checksOf(dir, id), prOf(dir, id))
      : null;
  };
  const listOf = (dir: string): WorkList | null => {
    const cards = cardSets.get(dir);
    if (!cards) return null;
    const list = buildWorkList({ cards: cards.map(owned), stale: [], problems: [] }, DEFAULT_CONFIG);
    return withPrStatus(list, (id) => prOf(dir, id)?.status ?? undefined);
  };
  /** The server sees the folder's cards change: it pushes the list and each watched card. */
  const changed = (dir: string, card: Card) => {
    const cards = cardSets.get(dir) ?? [];
    // A card the folder doesn't have yet is one an agent just made (a draft).
    cardSets.set(dir, cards.some((c) => c.id === card.id) ? replace(cards, card) : [...cards, card]);
    listChanged(dir, listOf(dir) as WorkList);
    for (const [key, set] of watchers) {
      const [d, id] = JSON.parse(key) as [string, string];
      if (d === dir) for (const l of set) l({ view: viewOf(dir, id), loading: false, error: null });
    }
  };
  /** The server deletes cards: it pushes the new list, and each watched card that is gone is null. */
  const removed = (dir: string, ids: string[]) => {
    cardSets.set(
      dir,
      (cardSets.get(dir) ?? []).filter((c) => !ids.includes(c.id)),
    );
    listChanged(dir, listOf(dir) as WorkList);
    for (const [key, set] of watchers) {
      const [d, id] = JSON.parse(key) as [string, string];
      if (d === dir) for (const l of set) l({ view: viewOf(dir, id), loading: false, error: null });
    }
  };
  const bridge: CardBridge = {
    watchCard: (dir, id, listener) => {
      const key = JSON.stringify([dir, id]);
      const set = watchers.get(key) ?? new Set();
      watchers.set(key, set.add(listener));
      queueMicrotask(() => listener({ view: viewOf(dir, id), loading: false, error: null }));
      return () => {
        set.delete(listener);
      };
    },
    // What the server does: apply the edit to the owner's card with work-format's rules, then push the change.
    updateCard: async (dir, id, edit) => {
      calls.push(`updateCard:${dir}:${id}:${edit.field}`);
      const cards = cardSets.get(dir) ?? [];
      const card = cards.find((c) => c.id === id);
      if (!card) return { ok: false, error: "That card is gone.", view: null };
      const r = applyCardEdit(card, edit, { config: DEFAULT_CONFIG, cards }, "user", EDIT_AT);
      if (!r.ok) return { ok: false, error: r.error, view: viewOf(dir, id) };
      changed(dir, r.card);
      return { ok: true, view: viewOf(dir, id) as CardView };
    },
    // Send back is the server's to prove (ordering, validation, history): the fake only records the call and answers
    // what the test sets, by default that the chat has it and history does too.
    sendBack: async (dir, id, reason) => {
      calls.push(`sendBack:${dir}:${id}:${reason}`);
      return sendBack(dir, id, reason);
    },
    // Approve and Reject are the server's to prove (git, the commit, the files): the fake records the call and, unless a
    // test sets the answer, changes the cards as the server does, with work-format's own rules.
    approve: async (dir, id) => {
      calls.push(`approve:${dir}:${id}`);
      if (review.approve) return review.approve(dir, id);
      const plan = planApproval(id, cardSets.get(dir) ?? [], EDIT_AT);
      if (!plan.ok) return { ok: false, error: plan.error };
      removed(
        dir,
        plan.drop.map((c) => c.id),
      );
      changed(dir, plan.feature);
      return { ok: true };
    },
    // Start is the server's to prove (git, the branch): the fake records the call and, unless a test sets the answer,
    // makes the feature active as work-format's rules say.
    start: async (dir, id) => {
      calls.push(`start:${dir}:${id}`);
      if (review.start) return review.start(dir, id);
      const feature = (cardSets.get(dir) ?? []).find((c) => c.id === id);
      const why = notStartableReason(feature, id);
      if (why !== null || !feature) return { ok: false, error: why ?? "That card is gone." };
      changed(dir, startedFeature(feature, "user", EDIT_AT));
      return { ok: true };
    },
    // Starting a story is the server's to prove (git, the worktree, the queue): the fake records the call and, unless a
    // test sets the answer, applies work-format's rules and the story's card as started.
    startStory: async (dir, id) => {
      calls.push(`startStory:${dir}:${id}`);
      if (review.startStory) return review.startStory(dir, id);
      const cards = cardSets.get(dir) ?? [];
      const story = cards.find((c) => c.id === id);
      const feature = cards.find((c) => c.id === story?.parent);
      const why = notSpawnableReason(story, feature, feature ? `feature/${feature.id}` : null, id);
      if (why !== null || !story || !feature) return { ok: false, error: why ?? "That card is gone." };
      const session = storySession(dir, story, feature);
      if (!session.queued) {
        changed(
          dir,
          startedStory(
            story,
            {
              agent: "claude",
              role: "developer",
              model: "opus",
              reasoning: "high",
              session: session.chat,
              branch: storyBranchName(story),
            },
            "user",
            EDIT_AT,
          ),
        );
      }
      return { ok: true, ...session };
    },
    // Stop and Resume are the server's to prove (the agent, the lane): the fake records the call and applies work-format's
    // rules to the card, as the server does once the agent has stopped or gone on.
    stopStory: async (dir, id) => {
      calls.push(`stopStory:${dir}:${id}`);
      if (review.stopStory) return review.stopStory(dir, id);
      const card = (cardSets.get(dir) ?? []).find((c) => c.id === id);
      const tone = card ? stageTone(card.status, DEFAULT_CONFIG) : "idle";
      // A story still queued, never started, just leaves the queue: its card is as it was.
      if (card?.type === "story" && card.agent === null && agents.turn(dir, id).queued) {
        agents.drop(dir, id);
        return { ok: true };
      }
      const why = stopRefusal(card, tone);
      if (why !== null || !card) return { ok: false, error: why ?? "That card is gone." };
      changed(dir, stoppedStory(card, "user", EDIT_AT));
      return { ok: true };
    },
    resumeStory: async (dir, id) => {
      calls.push(`resumeStory:${dir}:${id}`);
      if (review.resumeStory) return review.resumeStory(dir, id);
      const card = (cardSets.get(dir) ?? []).find((c) => c.id === id);
      const tone = card ? stageTone(card.status, DEFAULT_CONFIG) : "idle";
      const why = resumeRefusal(card, tone, agents.turn(dir, id));
      if (why !== null || !card) return { ok: false, error: why ?? "That card is gone." };
      // Only a Stopped story has a mark to clear; an idle session that ended without finishing just goes on.
      if (isStopped(card)) changed(dir, resumedStory(card, "user", EDIT_AT));
      return { ok: true };
    },
    // Accept and Send back are the server's to prove (the lane, the session): the fake records the call and applies
    // work-format's rules to the card, as the server does.
    acceptStory: async (dir, id) => {
      calls.push(`acceptStory:${dir}:${id}`);
      if (review.acceptStory) return review.acceptStory(dir, id);
      const card = (cardSets.get(dir) ?? []).find((c) => c.id === id);
      const why = acceptanceRefusal(card, id, DEFAULT_CONFIG);
      if (why !== null || !card) return { ok: false, error: why ?? "That card is gone." };
      changed(dir, acceptedStory(card, DEFAULT_CONFIG, "user", EDIT_AT));
      return { ok: true };
    },
    sendBackStory: async (dir, id, reason, addCriterion) => {
      calls.push(`sendBackStory:${dir}:${id}:${reason}:${addCriterion}`);
      if (review.sendBackStory) return review.sendBackStory(dir, id, reason, addCriterion);
      const card = (cardSets.get(dir) ?? []).find((c) => c.id === id);
      const why = acceptanceRefusal(card, id, DEFAULT_CONFIG);
      if (why !== null || !card) return { ok: false, error: why ?? "That card is gone." };
      changed(dir, sentBackStory(card, DEFAULT_CONFIG, reason, addCriterion, "user", EDIT_AT));
      return { ok: true, recorded: true };
    },
    // Re-run is the server's to prove (the run, the lane): the fake records the call.
    rerunChecks: async (dir, id) => {
      calls.push(`rerunChecks:${dir}:${id}`);
      return review.rerunChecks ? review.rerunChecks(dir, id) : { ok: true };
    },
    // Create PR is the server's to prove (git, gh, the lane): the fake records the call.
    createPr: async (dir, id) => {
      calls.push(`createPr:${dir}:${id}`);
      return review.createPr ? review.createPr(dir, id) : { ok: true };
    },
    // Merging is the server's to prove (git, gh, the worktree): the fake refuses with work-format's rule, as the server
    // does for a card main owns, unless the test sets the answer.
    mergeStory: async (dir, id) => {
      calls.push(`mergeStory:${dir}:${id}`);
      if (review.mergeStory) return review.mergeStory(dir, id);
      const card = (cardSets.get(dir) ?? []).find((c) => c.id === id);
      const why = mergeRefusal(card && owned(card), id, DEFAULT_CONFIG, true);
      if (why !== null || !card) return { ok: false, error: why ?? "That card is gone." };
      changed(dir, mergedStory(card, featureBranch(card), "system", EDIT_AT));
      return { ok: true, remains: [] };
    },
    // Abandoning is the server's to prove (the session, git, gh): the fake refuses with work-format's rule and, unless
    // a test sets the answer, warns of nothing but the card, then keeps it as Cancelled or deletes it.
    abandonCheck: async (dir, id) => {
      calls.push(`abandonCheck:${dir}:${id}`);
      if (review.abandonCheck) return review.abandonCheck(dir, id);
      const card = (cardSets.get(dir) ?? []).find((c) => c.id === id);
      const why = abandonRefusal(card && owned(card), id, DEFAULT_CONFIG, true);
      if (why !== null) return { ok: false, error: why };
      return { ok: true, warning: { files: [], unpushed: [], pr: null, branch: null, remotes: [], token: "t" } };
    },
    abandonStory: async (dir, id, keep, token) => {
      calls.push(`abandonStory:${dir}:${id}:${keep}:${token}`);
      if (review.abandonStory) return review.abandonStory(dir, id, keep, token);
      const card = (cardSets.get(dir) ?? []).find((c) => c.id === id);
      const why = abandonRefusal(card && owned(card), id, DEFAULT_CONFIG, true);
      if (why !== null || !card) return { ok: false, error: why ?? "That card is gone." };
      if (keep) changed(dir, abandonedStory(card, "user", EDIT_AT));
      else removed(dir, [id]);
      return { ok: true, remains: [] };
    },
    reject: async (dir, id) => {
      calls.push(`reject:${dir}:${id}`);
      if (review.reject) return review.reject(dir, id);
      const cards = cardSets.get(dir) ?? [];
      removed(dir, [id, ...draftStories(id, cards).map((c) => c.id)]);
      return { ok: true };
    },
  };
  return {
    bridge,
    listOf,
    /** A card changes outside the pane (an agent, an editor). */
    changed,
    /** The folder's cards as the server holds them now. */
    cardsIn: (dir: string) => cardSets.get(dir) ?? [],
    /** How many card watches are open. */
    watching: () => [...watchers.values()].reduce((n, s) => n + s.size, 0),
  };
}
