// The local server's card side, as a fake: cards held in memory, edited with work-format's own rules.
import {
  applyCardEdit,
  notStartableReason,
  startedFeature,
  buildCardView,
  buildWorkList,
  DEFAULT_CONFIG,
  draftStories,
  MAIN,
  planApproval,
  type Card,
  type CardView,
  type OwnedCard,
  type WorkList,
} from "@featra/work-format";
import type { CardBridge, CardUpdate } from "../src/card-pane.ts";

/** The time the fake server stamps on a card edit. */
export const EDIT_AT = "2026-11-05T12:00:00Z";

const owned = (card: Card): OwnedCard => ({ card, owner: MAIN, shownFrom: MAIN, path: `.featra/cards/${card.id}.md` });
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
  review: Partial<Pick<CardBridge, "approve" | "reject" | "start">> = {},
) {
  const cardSets = new Map(Object.entries(given));
  const watchers = new Map<string, Set<(u: CardUpdate) => void>>();
  const viewOf = (dir: string, id: string): CardView | null => {
    const cards = cardSets.get(dir) ?? [];
    const card = cards.find((c) => c.id === id);
    return card ? buildCardView(owned(card), true, { config: DEFAULT_CONFIG, cards }) : null;
  };
  const listOf = (dir: string): WorkList | null => {
    const cards = cardSets.get(dir);
    return cards ? buildWorkList({ cards: cards.map(owned), stale: [], problems: [] }, DEFAULT_CONFIG) : null;
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
