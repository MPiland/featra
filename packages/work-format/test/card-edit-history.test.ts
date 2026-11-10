/** STORY-49 AC4: every text edit from the card pane appends a `by: user` content event, and the draft guard sees it. */
import { describe, expect, it } from "vitest";
import { applyCardEdit, DEFAULT_CONFIG, planDraft, statusChoices, type Card, type CardEdit } from "../src/index.ts";
import { firstDraft, input, patched, story } from "./draft-fixtures.ts";

const T3 = "2026-11-10T11:00:00Z";
const T4 = "2026-11-10T12:00:00Z";

const get = (cards: Card[], id: string) => cards.find((c) => c.id === id) as Card;
const edited = (cards: Card[], id: string, edit: CardEdit, at = T3): Card[] => {
  const r = applyCardEdit(get(cards, id), edit, { config: DEFAULT_CONFIG, cards }, "user", at);
  if (!r.ok) throw new Error(r.error);
  return patched(cards, id, r.card);
};
const last = (cards: Card[], id: string) => get(cards, id).history.at(-1);

describe("a pane text edit appends a by:user content event naming the part and its old value", () => {
  const { cards, plan } = firstDraft();
  const [one] = plan.result.stories as [string];
  const feature = plan.result.feature;

  it("title, story and notes", () => {
    const old = get(cards, one);
    let next = edited(cards, one, { field: "title", from: old.title, to: "New title" });
    expect(last(next, one)).toEqual({
      at: T3,
      field: "content",
      from: JSON.stringify({ title: old.title }),
      to: "title",
      by: "user",
    });
    next = edited(next, one, { field: "description", from: old.description, to: "As a builder, I x." });
    expect(last(next, one)).toMatchObject({
      to: "story",
      by: "user",
      from: JSON.stringify({ story: old.description }),
    });
    next = edited(next, one, { field: "notes", from: "", to: "a note" });
    expect(last(next, one)).toMatchObject({ to: "notes", by: "user" });
  });

  it("a feature's description is named description", () => {
    const old = get(cards, feature);
    const next = edited(cards, feature, { field: "description", from: old.description, to: "Changed." });
    expect(last(next, feature)).toMatchObject({ to: "description", by: "user" });
  });

  it("an acceptance criterion and a task name the whole list as it was", () => {
    const old = get(cards, one);
    let next = edited(cards, one, { field: "ac", index: 0, from: old.acs[0]?.text ?? "", to: "A new criterion" });
    expect(last(next, one)).toMatchObject({
      to: "criteria",
      from: JSON.stringify({ criteria: old.acs.map((a) => a.text) }),
    });
    next = edited(next, one, { field: "task", index: 0, from: old.tasks[0]?.text ?? "", to: "A new task" });
    expect(last(next, one)).toMatchObject({
      to: "tasks",
      from: JSON.stringify({ tasks: old.tasks.map((t) => t.text) }),
    });
  });

  it("an edit that changes nothing writes no history", () => {
    const old = get(cards, one);
    const ctx = { config: DEFAULT_CONFIG, cards };
    const r = applyCardEdit(old, { field: "title", from: old.title, to: ` ${old.title} ` }, ctx, "user", T3);
    expect(r).toEqual({ ok: true, card: old });
  });
});

describe("ruling 5 still holds: a draft revision after a pane edit is refused", () => {
  const { cards, plan } = firstDraft();
  const ids = plan.result.stories as [string, string];
  const revise = (from: Card[], first: string) =>
    planDraft(input([story({ id: ids[0], title: first }), story({ id: ids[1], title: "Review it" })]), {
      cards: from,
      config: DEFAULT_CONFIG,
      chat: "chat-1",
      at: T4,
    });
  const userTitle = () => {
    const old = get(cards, ids[0]);
    return edited(cards, ids[0], { field: "title", from: old.title, to: "User's title" });
  };

  it("refuses, naming the edited card", () => {
    const planned = revise(userTitle(), "Agent's title");
    expect(planned.ok).toBe(false);
    expect(planned.ok ? "" : planned.error).toContain(`${ids[0]} "User's title"`);
  });

  it("refuses on the history entry alone, once the fingerprint no longer shows the edit", () => {
    // The user types the draft's text back: the fingerprint matches again, only the history shows they were here.
    const old = get(cards, ids[0]);
    const back = edited(userTitle(), ids[0], { field: "title", from: "User's title", to: old.title });
    expect(get(back, ids[0]).extra).toEqual(old.extra);
    expect(revise(back, "Agent's title").ok).toBe(false);
  });

  it("lets the agent through when the user only edited notes, which a draft does not write", () => {
    const next = edited(cards, ids[0], { field: "notes", from: "", to: "my note" });
    expect(revise(next, "Agent's title").ok).toBe(true);
  });

  it("lets a call that only repeats what the user wrote through, recorded as merged", () => {
    const planned = revise(userTitle(), "User's title");
    expect(planned.ok).toBe(true);
    const merged = planned.ok ? planned.value.writes.find((w) => w.card.id === ids[0])?.card : null;
    expect(merged?.history.at(-1)).toMatchObject({ to: "merged", by: "session:chat-1" });
  });
});

describe("a draft feature is approved by Approve (STORY-51), not by the status list", () => {
  it("offers only its current status", () => {
    const { cards, plan } = firstDraft();
    const draft = get(cards, plan.result.feature);
    expect(statusChoices(draft, { config: DEFAULT_CONFIG, cards }).map((o) => o.value)).toEqual(["draft"]);
  });
});

describe("card.update can't approve or reject a draft (STORY-51 has its own path)", () => {
  const { cards, plan } = firstDraft();
  const feature = get(cards, plan.result.feature);
  const ctx = { config: DEFAULT_CONFIG, cards };

  it("refuses every move out of draft, whatever the status is called", () => {
    for (const to of ["approved", "active", "cancelled", "Cancelled"]) {
      const r = applyCardEdit(feature, { field: "status", from: "draft", to }, ctx, "user", T3);
      expect(r.ok, to).toBe(false);
      expect(r.ok ? "" : r.error).toContain("Approve");
    }
  });

  it("still takes a status edit that changes nothing, and other cards' moves", () => {
    expect(applyCardEdit(feature, { field: "status", from: "draft", to: "draft" }, ctx, "user", T3)).toEqual({
      ok: true,
      card: feature,
    });
    const child = get(cards, plan.result.stories[0] as string);
    expect(applyCardEdit(child, { field: "status", from: "New", to: "Cancelled" }, ctx, "user", T3).ok).toBe(true);
  });
});
