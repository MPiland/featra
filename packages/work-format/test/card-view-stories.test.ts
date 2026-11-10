/** STORY-49: a feature's card view lists its stories, so the pane can open each one. */
import { describe, expect, it } from "vitest";
import { buildCardView, DEFAULT_CONFIG, MAIN, setStatus, type Card } from "../src/index.ts";
import { firstDraft, patched, T2 } from "./draft-fixtures.ts";

const viewOf = (cards: Card[], id: string) =>
  buildCardView({ card: cards.find((c) => c.id === id) as Card, owner: MAIN, shownFrom: MAIN, path: "x.md" }, true, {
    config: DEFAULT_CONFIG,
    cards,
  });

describe("CardView.stories", () => {
  it("lists a feature's stories in order, with title and stage, and leaves out Cancelled ones", () => {
    const { cards, plan } = firstDraft();
    const [one, two] = plan.result.stories as [string, string];
    const gone = setStatus(cards.find((c) => c.id === two) as Card, "Cancelled", "user", T2);
    expect(viewOf(cards, plan.result.feature).stories).toEqual([
      { id: one, title: "Draft a feature", status: "New" },
      { id: two, title: "Review it", status: "New" },
    ]);
    expect(viewOf(patched(cards, two, gone), plan.result.feature).stories.map((s) => s.id)).toEqual([one]);
  });

  it("is empty for a story", () => {
    const { cards, plan } = firstDraft();
    expect(viewOf(cards, plan.result.stories[0] as string).stories).toEqual([]);
  });
});
