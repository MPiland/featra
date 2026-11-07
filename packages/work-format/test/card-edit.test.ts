import { describe, expect, it } from "vitest";
import {
  applyCardEdit,
  CHANGED_ELSEWHERE,
  parentChoices,
  parseCard,
  recordAcceptance,
  recordEvidence,
  serializeCard,
  setParent,
  setStatus,
  statusChoices,
  VERIFIED,
  type Card,
} from "../src/index.ts";
import { at, config, feature, story } from "./fixtures.ts";

const base: Card = {
  ...story("STORY-1", "FEAT-1", { status: "In Progress" }),
  description: "As a builder, I open a card.",
  acs: [{ text: "Opens a pane", done: false, test: "e2e/card-pane.spec.ts" }],
  tasks: [{ text: "Pane", done: false }],
  notes: "first notes",
};
const cards = [feature("FEAT-1"), feature("FEAT-2"), { ...feature("EPIC-1"), type: "epic" as const }, base];
const ctx = { config, cards };
const edit = (c: Card, e: Parameters<typeof applyCardEdit>[1]) => applyCardEdit(c, e, ctx, "user", at(30));

describe("applyCardEdit: text fields", () => {
  it("replaces the user story and appends no history", () => {
    const r = edit(base, { field: "description", from: base.description, to: "As a builder, I edit a card.\r\n" });
    expect(r).toEqual({ ok: true, card: { ...base, description: "As a builder, I edit a card." } });
  });

  it("edits the title, notes, one AC and one task, keeping each AC's test link", () => {
    expect(edit(base, { field: "title", from: base.title, to: " New\ntitle " })).toEqual({
      ok: true,
      card: { ...base, title: "New title" },
    });
    expect(edit(base, { field: "notes", from: "first notes", to: "more" })).toEqual({
      ok: true,
      card: { ...base, notes: "more" },
    });
    const ac = edit(base, { field: "ac", index: 0, from: "Opens a pane", to: "Opens a docked pane" });
    expect(ac.ok && ac.card.acs).toEqual([{ text: "Opens a docked pane", done: false, test: "e2e/card-pane.spec.ts" }]);
    const task = edit(base, { field: "task", index: 0, from: "Pane", to: "Docked pane" });
    expect(task.ok && task.card.tasks).toEqual([{ text: "Docked pane", done: false }]);
  });

  it("refuses when the owner's value is no longer what the pane showed", () => {
    const owner = { ...base, description: "Changed in the worktree." };
    expect(edit(owner, { field: "description", from: base.description, to: "mine" })).toEqual({
      ok: false,
      error: CHANGED_ELSEWHERE,
    });
    expect(edit(base, { field: "task", index: 3, from: "gone", to: "x" })).toEqual({
      ok: false,
      error: CHANGED_ELSEWHERE,
    });
  });

  it("refuses an empty title or item, and text that would read back as a new section", () => {
    expect(edit(base, { field: "title", from: base.title, to: "  " })).toEqual({
      ok: false,
      error: "A card needs a title.",
    });
    expect(edit(base, { field: "task", index: 0, from: "Pane", to: "" })).toEqual({
      ok: false,
      error: "An item needs text.",
    });
    expect(edit(base, { field: "notes", from: "first notes", to: "a\n## Heading" })).toEqual({
      ok: false,
      error: "That text can't be saved as typed.",
    });
  });

  it("writes text that reads back from the file as it was typed", () => {
    const r = edit(base, { field: "description", from: base.description, to: "Line one\n\n- a list" });
    expect(r.ok && parseCard(serializeCard(r.card)).description).toBe("Line one\n\n- a list");
  });
});

describe("applyCardEdit: status and parent", () => {
  it("moves the status through setStatus, appending a history event", () => {
    const r = edit(base, { field: "status", from: "In Progress", to: "In Review" });
    expect(r).toEqual({ ok: true, card: setStatus(base, "In Review", "user", at(30)) });
    expect(r.ok && r.card.history.at(-1)).toEqual({
      at: at(30),
      field: "status",
      from: "In Progress",
      to: "In Review",
      by: "user",
    });
  });

  it("moves the parent through setParent, appending a history event", () => {
    const r = edit(base, { field: "parent", from: "FEAT-1", to: "FEAT-2" });
    expect(r).toEqual({ ok: true, card: setParent(base, "FEAT-2", "user", at(30)) });
    expect(r.ok && r.card.history.at(-1)).toMatchObject({ field: "parent", from: "FEAT-1", to: "FEAT-2" });
  });

  it("refuses Done without Verified and Accepted, as the transition rules say", () => {
    expect(edit(base, { field: "status", from: "In Progress", to: "Done" })).toEqual({
      ok: false,
      error: "Can't move to Done: needs Verified: the PR's CI checks have not passed.",
    });
    const verified = recordEvidence(base, VERIFIED, "system", at(10));
    expect(edit(verified, { field: "status", from: "In Progress", to: "Done" })).toEqual({
      ok: false,
      error: "Can't move to Done: needs your Accept.",
    });
  });

  it("refuses a status or parent move from a value the owner no longer has", () => {
    const moved = setStatus(base, "In Review", "session:1", at(20));
    expect(edit(moved, { field: "status", from: "In Progress", to: "Ready" })).toEqual({
      ok: false,
      error: CHANGED_ELSEWHERE,
    });
    expect(edit(base, { field: "parent", from: "FEAT-9", to: "FEAT-2" })).toEqual({
      ok: false,
      error: CHANGED_ELSEWHERE,
    });
  });

  it("refuses a parent that isn't a feature, and treats an unchanged value as no change", () => {
    expect(edit(base, { field: "parent", from: "FEAT-1", to: "EPIC-1" })).toEqual({
      ok: false,
      error: "Can't move under EPIC-1.",
    });
    expect(edit(base, { field: "status", from: "In Progress", to: "In Progress" })).toEqual({ ok: true, card: base });
  });
});

describe("statusChoices and parentChoices", () => {
  it("offers only the stages the rules allow: no Done before Verified and Accepted", () => {
    expect(statusChoices(base, ctx).map((o) => o.value)).toEqual([
      "New",
      "Ready",
      "In Progress",
      "In Review",
      "Acceptance",
      "Cancelled",
    ]);
    const ready = recordAcceptance(recordEvidence(base, VERIFIED, "system", at(10)), true, "user", at(11));
    expect(statusChoices(ready, ctx).map((o) => o.value)).toContain("Done");
  });

  it("labels a feature's statuses, without Done while a story is open, and offers the right parents", () => {
    // FEAT-1 still has STORY-1 In Progress, so the feature rules don't allow Done.
    expect(statusChoices(feature("FEAT-1", "active"), ctx).map((o) => o.label)).toEqual([
      "Draft",
      "Approved",
      "In progress",
      "Cancelled",
    ]);
    expect(parentChoices(base, ctx)).toEqual([
      { value: null, label: "No feature" },
      { value: "FEAT-1", label: "FEAT-1 · FEAT-1" },
      { value: "FEAT-2", label: "FEAT-2 · FEAT-2" },
    ]);
    expect(parentChoices(feature("FEAT-1"), ctx).map((o) => o.value)).toEqual([null, "EPIC-1"]);
    expect(parentChoices(cards[2] as Card, ctx)).toEqual([]);
  });
});
