import { describe, expect, it } from "vitest";
import {
  buildWorkList,
  CANCELLED,
  DEFAULT_CONFIG,
  needsReview,
  planDraft,
  MAIN,
  type DraftStory,
  type Resolution,
} from "../src/index.ts";
import { apply, existing, firstDraft, input, patched, story, T2 } from "./draft-fixtures.ts";

describe("a later call from the same chat revises the draft in place", () => {
  it("keeps the feature and the story IDs, and records what changed in each changed card's history", () => {
    const { cards, plan } = firstDraft();
    const [one, two] = plan.result.stories;
    const second = apply(
      cards,
      input(
        [
          story({ id: one ?? null, criteria: ["The draft shows in Work", "It has a Review badge"] }),
          story({ id: two ?? null, title: "Review it" }),
        ],
        "Shaping, revised",
      ),
      "chat-1",
      T2,
    );
    expect(second.plan.result).toMatchObject({
      created: false,
      feature: plan.result.feature,
      stories: plan.result.stories,
    });
    expect(second.plan.result.changed).toEqual([plan.result.feature, one]);
    const feature = second.cards.find((c) => c.id === plan.result.feature);
    expect(feature?.title).toBe("Shaping, revised");
    expect(feature?.history.at(-1)).toEqual({
      at: T2,
      field: "content",
      from: null,
      to: "title",
      by: "session:chat-1",
    });
    const changed = second.cards.find((c) => c.id === one);
    expect(changed?.acs).toHaveLength(2);
    expect(changed?.history.at(-1)).toEqual({
      at: T2,
      field: "content",
      from: null,
      to: "criteria",
      by: "session:chat-1",
    });
    // The story the call didn't change is not written, so its history stays as it was.
    expect(second.cards.find((c) => c.id === two)?.history).toHaveLength(1);
    expect(second.cards.filter((c) => c.type === "feature" && c.status === "draft")).toHaveLength(1);
  });

  it("names every part that changed, and writes nothing for a call that changes nothing", () => {
    const { cards, plan } = firstDraft();
    const [one, two] = plan.result.stories;
    const same = [story({ id: one ?? null }), story({ id: two ?? null, title: "Review it" })];
    expect(apply(cards, input(same), "chat-1", T2).plan.writes).toEqual([]);
    const all = apply(
      cards,
      input([
        story({ id: one ?? null, title: "T", story: "As a builder, I s.", criteria: ["z"], tasks: [] }),
        same[1] as DraftStory,
      ]),
      "chat-1",
      T2,
    );
    expect(all.cards.find((c) => c.id === one)?.history.at(-1)?.to).toBe("title, story, criteria, tasks");
  });

  it("adds a story under the same feature with the next ID, and records it on the feature", () => {
    const { cards, plan } = firstDraft();
    const stories = plan.result.stories.map((id) => story({ id }));
    const second = apply(
      cards,
      input([
        ...stories.map((s, i) => Object.assign({}, s, { title: i ? "Review it" : s.title })),
        story({ title: "Send back" }),
      ]),
      "chat-1",
      T2,
    );
    expect(second.plan.result.stories).toEqual([...plan.result.stories, "STORY-10"]);
    expect(second.cards.find((c) => c.id === "STORY-10")).toMatchObject({
      parent: plan.result.feature,
      order: 3,
      status: "New",
    });
    expect(second.cards.find((c) => c.id === plan.result.feature)?.history.at(-1)?.to).toBe("stories");
  });

  it("cancels a story the call leaves out, and brings it back when a later call names it again", () => {
    const { cards, plan } = firstDraft();
    const [one, two] = plan.result.stories;
    const second = apply(cards, input([story({ id: one ?? null })]), "chat-1", T2);
    expect(second.plan.result).toMatchObject({ stories: [one], cancelled: [two] });
    const gone = second.cards.find((c) => c.id === two);
    expect(gone?.status).toBe(CANCELLED);
    expect(gone?.history.at(-1)).toEqual({ at: T2, field: "status", from: "New", to: CANCELLED, by: "session:chat-1" });
    const third = apply(
      second.cards,
      input([story({ id: one ?? null }), story({ id: two ?? null, title: "Review it" })]),
      "chat-1",
      "2026-11-10T11:00:00Z",
    );
    expect(third.cards.find((c) => c.id === two)?.status).toBe("New");
    expect(third.plan.result.cancelled).toEqual([]);
  });

  it("keeps a task's tick and an AC's test link when its text is unchanged", () => {
    const { cards, plan } = firstDraft();
    const [one] = plan.result.stories;
    const ticked = patched(cards, one ?? "", {
      tasks: [{ text: "Add the tool", done: true }],
      acs: [{ text: "The draft shows in Work", done: true, test: "a.test.ts" }],
    });
    const next = apply(
      ticked,
      input([
        story({ id: one ?? null, criteria: ["The draft shows in Work"], tasks: ["Add the tool", "Test it"] }),
        story({ id: plan.result.stories[1] ?? null, title: "Review it" }),
      ]),
      "chat-1",
      T2,
    );
    const card = next.cards.find((c) => c.id === one);
    expect(card?.tasks).toEqual([
      { text: "Add the tool", done: true },
      { text: "Test it", done: false },
    ]);
    expect(card?.acs).toEqual([{ text: "The draft shows in Work", done: true, test: "a.test.ts" }]);
  });

  it("refuses a story id that belongs to another feature", () => {
    const { cards } = firstDraft();
    const planned = planDraft(input([story({ id: "STORY-7" })]), {
      cards,
      config: DEFAULT_CONFIG,
      chat: "chat-1",
      at: T2,
    });
    expect(planned).toMatchObject({ ok: false, error: expect.stringContaining("isn't a story of FEAT-4") });
  });
});

describe("a draft in the Work list", () => {
  it("is a draft feature with a Review badge, in the needs-review and backlog filters, and says which chat drafted it", () => {
    const { cards, plan } = apply(existing(), input());
    const resolution: Resolution = {
      cards: cards.map((card) => ({ card, owner: MAIN, shownFrom: MAIN, path: `.featra/cards/${card.id}.md` })),
      stale: [],
      problems: [],
    };
    const list = buildWorkList(resolution, DEFAULT_CONFIG);
    const row = list.epics.flatMap((e) => e.features).find((f) => f.id === plan.result.feature);
    expect(row).toMatchObject({ status: "draft", review: true, draftedBy: "chat-1" });
    expect(row?.filters).toEqual(["needs-review", "backlog"]);
    expect(row?.stories.map((s) => s.id)).toEqual(plan.result.stories);
  });

  it("is no review once it is approved, or when nobody drafted the card", () => {
    expect(needsReview({ status: "draft", extra: { "drafted-by": "chat-1" } })).toBe(true);
    expect(needsReview({ status: "approved", extra: { "drafted-by": "chat-1" } })).toBe(false);
    expect(needsReview({ status: "draft", extra: {} })).toBe(false);
  });
});
