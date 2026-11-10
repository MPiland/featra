/** STORY-8 review rulings: what a revision may and may not change, and what it records. Real planner, plain cards. */
import { describe, expect, it } from "vitest";
import { appendHistory, DEFAULT_CONFIG, planDraft, setStatus, type Card } from "../src/index.ts";
import { apply, firstDraft, input, patched, story, T1, T2 } from "./draft-fixtures.ts";

const T3 = "2026-11-10T11:00:00Z";
const get = (cards: Card[], id: string) => cards.find((c) => c.id === id) as Card;
const plan = (cards: Card[], stories: ReturnType<typeof story>[], title = "Shaping") =>
  planDraft(input(stories, title), { cards, config: DEFAULT_CONFIG, chat: "chat-1", at: T3 });
const keepAll = (ids: string[]) => ids.map((id, i) => story({ id, title: i ? "Review it" : "Draft a feature" }));

/** A draft whose second story has started. */
const started = () => {
  const { cards, plan: first } = firstDraft();
  const [one, two] = first.result.stories as [string, string];
  return { cards: patched(cards, two, setStatus(get(cards, two), "Ready", "session:dev", T2)), one, two };
};
const failure = (planned: ReturnType<typeof plan>) => (planned.ok ? "" : planned.error);

describe("ruling 2 and 3: only stories still in New can be left out or changed", () => {
  it("refuses a call that leaves out a started story, naming it and its stage, and writes nothing", () => {
    const { cards, one, two } = started();
    const planned = plan(cards, keepAll([one]));
    expect(planned).toEqual({ ok: false, error: `${two} is Ready, so it can't be left out. Send it unchanged.` });
  });

  it("refuses a call that changes a started story, naming it", () => {
    const { cards, one, two } = started();
    const changed = [story({ id: one, title: "Draft a feature" }), story({ id: two, title: "Renamed" })];
    expect(plan(cards, changed)).toEqual({
      ok: false,
      error: `${two} is Ready, so it can't be changed. Send it unchanged.`,
    });
  });

  it("names every such story, and accepts a started story sent unchanged", () => {
    const { cards, one, two } = started();
    const both = patched(cards, one, setStatus(get(cards, one), "In Progress", "session:dev", T2));
    const refused = plan(both, []);
    expect(failure(refused)).toContain(`${one} is In Progress, so it can't be left out.`);
    expect(failure(refused)).toContain(`${two} is Ready, so it can't be left out.`);
    expect(plan(both, keepAll([one, two])).ok).toBe(true);
  });
});

describe("ruling 4: a feature that has left draft is not revised, and no second feature is made", () => {
  it("refuses with the feature and its status", () => {
    const { cards, plan: first } = firstDraft();
    const feature = first.result.feature;
    const approved = patched(cards, feature, setStatus(get(cards, feature), "approved", "user", T2));
    expect(plan(approved, keepAll(first.result.stories))).toEqual({
      ok: false,
      error: `${feature} is already approved; drafts can't be changed after approval. Ask the user to add scope in Work.`,
    });
  });
});

describe("ruling 5: the user's edits are not overwritten", () => {
  it("refuses when the user changed a card's text since the last draft, listing its current title, criteria and tasks", () => {
    const { cards, plan: first } = firstDraft();
    const [one] = first.result.stories as [string];
    const edited = patched(cards, one, {
      title: "User's title",
      acs: [{ text: "User criterion", done: false, test: null }],
      tasks: [{ text: "User task", done: false }],
    });
    const planned = plan(edited, keepAll(first.result.stories));
    expect(planned.ok).toBe(false);
    const error = planned.ok ? "" : planned.error;
    expect(error).toContain(`${one} "User's title"`);
    expect(error).toContain("Criteria: User criterion");
    expect(error).toContain("Tasks: User task");
    expect(error).toContain("call again");
  });

  it("refuses when the user's history entry is newer than the last draft entry", () => {
    const { cards, plan: first } = firstDraft();
    const feature = first.result.feature;
    const touched = patched(
      cards,
      feature,
      appendHistory(get(cards, feature), {
        at: T2,
        field: "parent",
        from: null,
        to: "EPIC-1",
        by: "user",
      }),
    );
    const planned = plan(touched, keepAll(first.result.stories), "Shaping, renamed");
    expect(failure(planned)).toContain(`${feature} "Shaping"`);
  });

  it("lets a call that only repeats what the user wrote through, and then moves on", () => {
    const { cards, plan: first } = firstDraft();
    const [one, two] = first.result.stories as [string, string];
    const edited = patched(cards, one, { title: "User's title" });
    const merged = apply(
      edited,
      input([story({ id: one, title: "User's title" }), story({ id: two, title: "Review it" })]),
      "chat-1",
      T3,
    );
    expect(get(merged.cards, one).history.at(-1)).toMatchObject({ to: "merged", by: "session:chat-1" });
    expect(
      plan(merged.cards, [story({ id: one, title: "Mine again" }), story({ id: two, title: "Review it" })]).ok,
    ).toBe(true);
  });

  it("does not mind a ticked task, and accepts a draft the user has not touched", () => {
    const { cards, plan: first } = firstDraft();
    const [one] = first.result.stories as [string];
    const ticked = patched(cards, one, {
      tasks: get(cards, one).tasks.map((t) => Object.assign({}, t, { done: true })),
    });
    expect(plan(ticked, keepAll(first.result.stories)).ok).toBe(true);
  });

  it("records the old values in the history entry of what it changed", () => {
    const { cards, plan: first } = firstDraft();
    const [one, two] = first.result.stories as [string, string];
    const next = apply(
      cards,
      input([story({ id: one, title: "New title" }), story({ id: two, title: "Review it" })]),
      "chat-1",
      T3,
    );
    const entry = get(next.cards, one).history.at(-1);
    expect(entry).toMatchObject({ field: "content", to: "title", by: "session:chat-1" });
    expect(JSON.parse(entry?.from ?? "null")).toEqual({ title: "Draft a feature" });
  });

  it("keeps a revision after a revision consistent: the next call is not mistaken for a user edit", () => {
    const { cards, plan: first } = firstDraft();
    const [one, two] = first.result.stories as [string, string];
    const second = apply(
      cards,
      input([story({ id: one, title: "Second" }), story({ id: two, title: "Review it" })]),
      "chat-1",
      T2,
    );
    expect(plan(second.cards, [story({ id: one, title: "Third" }), story({ id: two, title: "Review it" })]).ok).toBe(
      true,
    );
  });
});

describe("ruling 6: a change of order is a history entry", () => {
  it("records order on each story whose place moved", () => {
    const { cards, plan: first } = firstDraft();
    const [one, two] = first.result.stories as [string, string];
    const swapped = apply(cards, input([story({ id: two, title: "Review it" }), story({ id: one })]), "chat-1", T3);
    for (const id of [one, two]) {
      const entry = get(swapped.cards, id).history.at(-1);
      expect(entry).toMatchObject({ field: "content", to: "order", at: T3 });
    }
    expect(JSON.parse(get(swapped.cards, one).history.at(-1)?.from ?? "")).toEqual({ order: 1 });
  });
});

describe("ruling 7: IDs the caller knows are taken are never handed out", () => {
  it("allocates past IDs whose files the scan has not seen", () => {
    const planned = planDraft(input([story()]), {
      cards: [],
      config: DEFAULT_CONFIG,
      chat: "c",
      at: T1,
      taken: ["FEAT-1", "STORY-1", "STORY-2"],
    });
    expect(planned.ok && planned.value.result).toMatchObject({ feature: "FEAT-2", stories: ["STORY-3"] });
  });
});
