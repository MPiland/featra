import { describe, expect, it } from "vitest";
import {
  cardFileName,
  idFromFileName,
  newCard,
  nextId,
  routeProblem,
  slugify,
  validateCards,
  type BranchState,
} from "../src/index.ts";
import { at, config, feature, moves, story } from "./fixtures.ts";

describe("routeProblem", () => {
  const cards = [
    feature("FEAT-1", "active"),
    feature("FEAT-0", "done"),
    moves(story("STORY-1", "FEAT-1"), [1, "In Progress"]),
    moves(story("STORY-2", "FEAT-1"), [1, "Done"]),
    moves(story("STORY-3", "FEAT-0"), [1, "Done"]),
    newCard({ id: "EPIC-1", type: "epic", title: "E", status: "active" }, "user", at(0)),
  ];
  // FEAT-1 is started; STORY-1 is still in its worktree.
  const state: BranchState = {
    features: { "FEAT-1": { branch: "feature/1-f", merged: false } },
    worktrees: { "STORY-1": { branch: "story/1-s", path: "/wt/story-1", merged: false } },
  };

  it.each([
    ["a story still being worked → task on it", "STORY-1", { kind: "task", card: "STORY-1" }],
    [
      "a finished story of the in-progress feature → bug under that feature",
      "STORY-2",
      { kind: "feature-bug", feature: "FEAT-1" },
    ],
    ["the in-progress feature itself → bug under it", "FEAT-1", { kind: "feature-bug", feature: "FEAT-1" }],
    ["a story of a Done feature → project bug (Done stays Done)", "STORY-3", { kind: "project-bug" }],
    ["a Done feature → project bug", "FEAT-0", { kind: "project-bug" }],
    ["an epic → project bug", "EPIC-1", { kind: "project-bug" }],
    ["unknown card → project bug", "STORY-404", { kind: "project-bug" }],
  ])("%s", (_, cause, expected) => {
    expect(routeProblem(cause, cards, config, state)).toEqual(expected);
  });

  it("no known cause → project bug", () => {
    expect(routeProblem(null, cards, config, state)).toEqual({ kind: "project-bug" });
  });

  // Ruling 7: "still being worked" means the story's card is still owned by its worktree.
  it.each([
    [
      "merged into its feature (the feature branch owns it)",
      { "STORY-1": { ...state.worktrees["STORY-1"]!, merged: true } },
    ],
    ["with no worktree", {}],
  ])("a story in progress %s → bug under its feature, not a task", (_, worktrees) => {
    expect(routeProblem("STORY-1", cards, config, { ...state, worktrees })).toEqual({
      kind: "feature-bug",
      feature: "FEAT-1",
    });
  });
});

describe("ids", () => {
  it("allocates one past the highest number for the type", () => {
    expect(nextId("story", ["STORY-1", "STORY-17", "STORY-3", "FEAT-40", "junk"])).toBe("STORY-18");
    expect(nextId("bug", [])).toBe("BUG-1");
    expect(nextId("feature", ["FEAT-9"])).toBe("FEAT-10");
  });

  it("names files <ID>-<slug>.md and reads the id back", () => {
    expect(slugify("Side panel: view & edit!")).toBe("side-panel-view-edit");
    expect(cardFileName({ id: "STORY-4", title: "Side panel: view & edit!" })).toBe("STORY-4-side-panel-view-edit.md");
    expect(cardFileName({ id: "STORY-4", title: "!!!" })).toBe("STORY-4.md");
    expect(idFromFileName("STORY-4-side-panel-view-edit.md")).toBe("STORY-4");
    expect(idFromFileName("STORY-4.md")).toBe("STORY-4");
    expect(idFromFileName("README.md")).toBeNull();
  });

  it("slugs never end in a dash after truncation", () => {
    expect(slugify("a".repeat(47) + " b")).not.toMatch(/-$/);
  });
});

describe("validateCards", () => {
  it("accepts a well-formed tree", () => {
    const cards = [
      newCard({ id: "EPIC-1", type: "epic", title: "E", status: "active" }, "user", at(0)),
      feature("FEAT-1"),
      story("STORY-1", "FEAT-1"),
      story("BUG-1", null, { type: "bug" }),
    ];
    expect(validateCards(cards, config)).toEqual([]);
  });

  it("reports every structural problem", () => {
    const cards = [
      feature("FEAT-1", "wip", null),
      story("STORY-1", null),
      story("STORY-2", "FEAT-404"),
      story("STORY-3", "STORY-2"),
      { ...story("STORY-4", "FEAT-1"), status: "Shipped" },
      story("STORY-4", "FEAT-1"),
      { ...story("BUG-9", "FEAT-1"), type: "bug" as const, id: "STORY-99" },
    ];
    expect(validateCards(cards, config).map((i) => `${i.id}: ${i.message}`)).toEqual([
      "STORY-4: duplicate id",
      "FEAT-1: status must be one of draft, approved, active, done, cancelled",
      "STORY-1: story needs a parent",
      "STORY-2: parent FEAT-404 not found",
      "STORY-3: a story cannot sit under a story",
      'STORY-4: unknown stage "Shipped"',
      "STORY-99: id should look like BUG-<n>",
    ]);
  });
});
