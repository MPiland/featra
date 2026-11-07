import { describe, expect, it } from "vitest";
import {
  buildCardView,
  cardUpdateParams,
  normalizeCardUpdateResult,
  normalizeCardView,
  parseCardEdit,
  provenEvent,
  readOnlyReason,
  recordEvidence,
  setStatus,
  type Card,
  type OwnedCard,
} from "../src/index.ts";
import { at, config, feature, story } from "./fixtures.ts";

const card: Card = {
  ...setStatus(story("STORY-4", "FEAT-2", { status: "Ready" }), "In Progress", "session:abc", at(5)),
  description: "As a builder, I open a story.",
  acs: [
    { text: "Opens", done: true, test: "e2e/card-pane.spec.ts" },
    { text: "Saves", done: false, test: "test/x.test.ts" },
    { text: "History", done: false, test: null },
  ],
  tasks: [{ text: "Pane", done: true }],
  pr: "#15",
};
const worktree = { kind: "worktree" as const, branch: "story-4", path: "/w/story-4" };
const owned: OwnedCard = { card, owner: worktree, shownFrom: worktree, path: ".featra/cards/STORY-4.md" };
const ctx = { config, cards: [feature("FEAT-2"), card] };

describe("buildCardView", () => {
  it("shows the user story, evidence marks, each AC's proof, tasks, notes, PR and owner", () => {
    const view = buildCardView({ ...owned, card: recordEvidence(card, provenEvent(1), "system", at(9)) }, true, ctx);
    expect(view).toMatchObject({
      id: "STORY-4",
      description: "As a builder, I open a story.",
      evidence: { reported: true, verified: false, proven: false, accepted: false },
      acs: [
        { text: "Opens", proof: "passed" },
        { text: "Saves", proof: "linked" },
        { text: "History", proof: "none" },
      ],
      tasks: [{ text: "Pane", done: true }],
      pr: "#15",
      owner: "worktree story-4",
      readOnly: null,
      parent: "FEAT-2",
    });
    expect(view.statusOptions.map((o) => o.value)).not.toContain("Done");
  });

  it("round-trips through the client's check", () => {
    const view = buildCardView(owned, true, ctx);
    expect(normalizeCardView(JSON.parse(JSON.stringify(view)))).toEqual(view);
    expect(normalizeCardView({ id: "" })).toBeNull();
  });
});

describe("readOnlyReason", () => {
  it("is read-only when the owner isn't checked out, naming the branch to check out", () => {
    const feat = { kind: "feature" as const, branch: "feature/2" };
    expect(readOnlyReason({ ...owned, owner: feat, shownFrom: feat }, false, "main")).toBe(
      "Check out feature/2 to edit it.",
    );
    expect(readOnlyReason({ ...owned, owner: { kind: "main" }, shownFrom: { kind: "main" } }, false, "trunk")).toBe(
      "Check out trunk to edit it.",
    );
  });

  it("is read-only when the owner has no copy, and editable at a checked-out owner", () => {
    expect(readOnlyReason({ ...owned, shownFrom: { kind: "main" } }, true, "main")).toBe(
      "Its owner, worktree story-4, has no copy.",
    );
    expect(readOnlyReason(owned, true, "main")).toBeNull();
  });
});

describe("card params", () => {
  it("reads each edit shape and refuses anything else", () => {
    expect(parseCardEdit({ field: "description", from: "a", to: "b" })).toEqual({
      field: "description",
      from: "a",
      to: "b",
    });
    expect(parseCardEdit({ field: "ac", index: 1, from: "a", to: "b" })).toEqual({
      field: "ac",
      index: 1,
      from: "a",
      to: "b",
    });
    expect(parseCardEdit({ field: "parent", from: null, to: "FEAT-1" })).toEqual({
      field: "parent",
      from: null,
      to: "FEAT-1",
    });
    expect(parseCardEdit({ field: "ac", index: -1, from: "a", to: "b" })).toBeNull();
    expect(parseCardEdit({ field: "history", from: "a", to: "b" })).toBeNull();
    expect(parseCardEdit({ field: "title", from: "a", to: 3 })).toBeNull();
    expect(cardUpdateParams({ dir: "/p", id: "STORY-4", edit: { field: "notes", from: "", to: "x" } })).toEqual({
      dir: "/p",
      id: "STORY-4",
      edit: { field: "notes", from: "", to: "x" },
    });
    expect(cardUpdateParams({ dir: "/p", edit: { field: "notes", from: "", to: "x" } })).toBeNull();
  });

  it("reads a refusal with the current view", () => {
    const view = buildCardView(owned, true, ctx);
    expect(normalizeCardUpdateResult({ ok: false, error: "No.", view })).toEqual({ ok: false, error: "No.", view });
    expect(normalizeCardUpdateResult({ ok: true })).toEqual({ ok: false, error: "Something went wrong.", view: null });
  });
});
