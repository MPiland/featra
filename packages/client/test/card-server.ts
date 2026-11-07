// The local server's card side, as a fake: cards held in memory, edited with work-format's own rules.
import {
  applyCardEdit,
  buildCardView,
  buildWorkList,
  DEFAULT_CONFIG,
  MAIN,
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
    cardSets.set(dir, replace(cardSets.get(dir) ?? [], card));
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
