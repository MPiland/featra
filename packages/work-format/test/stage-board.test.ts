import { describe, expect, it } from "vitest";
import {
  boardFeatures,
  boardFilter,
  buildWorkList,
  DEFAULT_CONFIG,
  MAIN,
  normalizeWorkList,
  stageBoard,
  type Card,
  type OwnedCard,
  type ProjectConfig,
} from "../src/index.ts";
import { config, feature, story } from "./fixtures.ts";

const owned = (card: Card): OwnedCard => ({ card, owner: MAIN, shownFrom: MAIN, path: `.featra/cards/${card.id}.md` });
const listOf = (cards: Card[], cfg: ProjectConfig = config) =>
  buildWorkList({ cards: cards.map(owned), stale: [], problems: [] }, cfg);
const ordered = (card: Card, order: number): Card => ({ ...card, order });

const CARDS = [
  feature("FEAT-1", "active", null),
  { ...feature("FEAT-2", "approved", null), title: "Burn-up" },
  feature("FEAT-3", "draft", null),
  ordered(story("STORY-2", "FEAT-1", { status: "In Progress" }), 2),
  ordered(story("STORY-1", "FEAT-1", { status: "In Progress" }), 1),
  ordered(story("STORY-3", "FEAT-1", { status: "Done" }), 3),
  ordered(story("BUG-1", "FEAT-1", { type: "bug", status: "In Review" }), 4),
  story("STORY-4", "FEAT-2"),
  story("STORY-5", "FEAT-2", { status: "Cancelled" }),
  story("STORY-6", null, { status: "Ready" }),
  story("BUG-2", null, { type: "bug" }),
];
const LIST = listOf(CARDS);
const ids = (list = LIST, feat: string | null = null) =>
  Object.fromEntries(stageBoard(list, feat).map((c) => [c.name, c.cards.map((x) => x.story.id)]));

describe("AC2: one column per stage, New through Done, in the project's stage order, each with its count", () => {
  it("is the default stages in order, an empty one included, each with its stories in the list's order", () => {
    expect(stageBoard(LIST, null).map((c) => [c.name, c.cards.length])).toEqual([
      ["New", 1],
      ["Ready", 1],
      ["In Progress", 2],
      ["In Review", 1],
      ["Acceptance", 0],
      ["Done", 1],
    ]);
    expect(ids()["In Progress"]).toEqual(["STORY-1", "STORY-2"]);
  });

  it("follows the project's own stages and their order", () => {
    const cfg: ProjectConfig = {
      ...DEFAULT_CONFIG,
      stages: [
        { name: "Todo", category: "not-started" },
        { name: "Doing", category: "active" },
        { name: "QA", category: "active" },
        { name: "Shipped", category: "done" },
      ],
    };
    const list = listOf([feature("FEAT-1", "active", null), story("STORY-1", "FEAT-1", { status: "QA" })], cfg);
    expect(list.stages?.map((s) => s.name)).toEqual(["Todo", "Doing", "QA", "Shipped"]);
    expect(stageBoard(list, null).map((c) => [c.name, c.cards.length])).toEqual([
      ["Todo", 0],
      ["Doing", 0],
      ["QA", 1],
      ["Shipped", 0],
    ]);
  });

  it("sends the stages to the client", () => {
    expect(normalizeWorkList(JSON.parse(JSON.stringify(LIST))).stages).toEqual(LIST.stages);
  });

  it("leaves out a card whose stage the project's config does not list", () => {
    const list = listOf([...CARDS, story("STORY-7", "FEAT-1", { status: "Blocked" })]);
    const all = stageBoard(list, null).flatMap((c) => c.cards.map((x) => x.story.id));
    expect(all).not.toContain("STORY-7");
    expect(stageBoard(list, null).map((c) => c.name)).not.toContain("Blocked");
  });

  it("leaves out a cancelled story and the project's bugs, which are under no feature", () => {
    const all = stageBoard(LIST, null).flatMap((c) => c.cards.map((x) => x.story.id));
    expect(all).not.toContain("STORY-5");
    expect(all).not.toContain("BUG-2");
    expect(all.toSorted()).toEqual(["BUG-1", "STORY-1", "STORY-2", "STORY-3", "STORY-4", "STORY-6"]);
  });

  it("shows a bug under a feature as a card in its stage", () => {
    const bug = stageBoard(LIST, null).find((c) => c.name === "In Review")?.cards[0];
    expect(bug?.story).toMatchObject({ id: "BUG-1", type: "bug" });
  });
});

describe("the columns' tones", () => {
  it("are the stage pills' tones: not started, in progress, in review, done", () => {
    expect(stageBoard(LIST, null).map((c) => [c.name, c.tone])).toEqual([
      ["New", "idle"],
      ["Ready", "idle"],
      ["In Progress", "active"],
      ["In Review", "review"],
      ["Acceptance", "review"],
      ["Done", "done"],
    ]);
  });
});

describe("AC3: all features' stories or one feature's", () => {
  it("offers each feature with stories, by id and title, in the list's order", () => {
    expect(boardFeatures(LIST)).toEqual([
      { id: "FEAT-1", title: "FEAT-1" },
      { id: "FEAT-2", title: "Burn-up" },
    ]);
  });

  it("narrows every column to one feature, and tags each card with its feature", () => {
    expect(ids(LIST, "FEAT-2")).toEqual({
      New: ["STORY-4"],
      Ready: [],
      "In Progress": [],
      "In Review": [],
      Acceptance: [],
      Done: [],
    });
    const cards = stageBoard(LIST, null).flatMap((c) => c.cards);
    expect(cards.find((c) => c.story.id === "STORY-4")?.feature).toEqual({ id: "FEAT-2", title: "Burn-up" });
    expect(cards.find((c) => c.story.id === "STORY-6")?.feature).toBeNull();
  });

  it("falls back to all features when the chosen one is gone or has no stories", () => {
    expect(boardFilter(LIST, "FEAT-1")).toBe("FEAT-1");
    expect(boardFilter(LIST, "FEAT-3")).toBeNull();
    expect(boardFilter(LIST, "FEAT-9")).toBeNull();
    expect(boardFilter(LIST, null)).toBeNull();
  });
});
