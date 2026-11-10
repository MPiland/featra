/** STORY-49: the draft guard lets a notes edit through, because a draft revision leaves the user's notes exactly alone. */
import { describe, expect, it } from "vitest";
import { applyCardEdit, DEFAULT_CONFIG, planDraft, type Card } from "../src/index.ts";
import { firstDraft, input, patched, story } from "./draft-fixtures.ts";

const get = (cards: Card[], id: string) => cards.find((c) => c.id === id) as Card;

describe("a draft revision and the user's notes", () => {
  const { cards, plan } = firstDraft();
  const [one, two] = plan.result.stories as [string, string];
  const feature = plan.result.feature;

  /** The user's notes on every draft card, then a revision that changes text everywhere. */
  const revised = () => {
    let next = cards;
    for (const id of [feature, one, two]) {
      const r = applyCardEdit(
        get(next, id),
        { field: "notes", from: "", to: `mine on ${id}` },
        { config: DEFAULT_CONFIG, cards: next },
        "user",
        "2026-11-10T11:00:00Z",
      );
      if (!r.ok) throw new Error(r.error);
      next = patched(next, id, r.card);
    }
    const planned = planDraft(
      {
        feature: { title: "Shaping, v2", description: "Changed." },
        stories: [
          story({ id: one, title: "Changed one" }),
          story({ id: two, title: "Review it", criteria: ["Other"] }),
        ],
      },
      { cards: next, config: DEFAULT_CONFIG, chat: "chat-1", at: "2026-11-10T12:00:00Z" },
    );
    if (!planned.ok) throw new Error(planned.error);
    return planned.value.writes;
  };

  it("is allowed, and leaves each card's notes exactly as the user wrote them", () => {
    const writes = revised();
    expect(writes.map((w) => w.card.id).toSorted()).toEqual([feature, one, two].toSorted());
    for (const w of writes) expect(w.card.notes).toBe(`mine on ${w.card.id}`);
  });

  it("still goes through for a new story added in the same call", () => {
    const planned = planDraft(
      input([story({ id: one }), story({ id: two, title: "Review it" }), story({ title: "New" })]),
      {
        cards,
        config: DEFAULT_CONFIG,
        chat: "chat-1",
        at: "2026-11-10T12:00:00Z",
      },
    );
    expect(planned.ok).toBe(true);
  });
});
