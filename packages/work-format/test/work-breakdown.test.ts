/**
 * STORY-15: what a bar says on hover or focus, and the "+N added" breakdown, on the Work list rows. Real cards through
 * the real rules and `buildWorkList`; the cards' times are the only thing chosen here.
 */
import { describe, expect, it } from "vitest";
import {
  MAIN,
  addedBreakdown,
  buildWorkList,
  newCard,
  recordAcceptance,
  stageBreakdown,
  STAGE_BREAKDOWN,
  statusBreakdown,
  type Card,
  type OwnedCard,
} from "../src/index.ts";
import { at, config, feature, moves, reparent, story } from "./fixtures.ts";

const owned = (card: Card): OwnedCard => ({ card, owner: MAIN, shownFrom: MAIN, path: `.featra/cards/${card.id}.md` });
const list = (cards: Card[]) => buildWorkList({ cards: cards.map(owned), stale: [], problems: [] }, config);
const epic = newCard({ id: "EPIC-1", type: "epic", title: "EPIC-1", status: "active" }, "user", at(0));

/** One story at each place it can stand, and one cancelled. */
const stories = (parent: string) => [
  moves(story("STORY-1", parent), [1, "In Progress"], [2, "In Review"], [3, "Acceptance"], [4, "Done"]),
  moves(story("STORY-2", parent), [1, "In Progress"], [2, "In Review"], [3, "Acceptance"]),
  moves(story("STORY-3", parent), [1, "In Progress"], [2, "In Review"]),
  moves(story("STORY-4", parent), [1, "In Progress"]),
  moves(story("STORY-5", parent), [1, "In Progress"]),
  story("STORY-6", parent),
  moves(story("STORY-7", parent), [1, "Ready"]),
  moves(story("STORY-8", parent), [1, "Cancelled"]),
];

describe("AC1: a feature's bar says its breakdown by stage", () => {
  it("counts done, needs your Accept, in review, in progress and not started, in bar order, without Cancelled", () => {
    expect(stageBreakdown(stories("FEAT-1"), config)).toBe(
      "1 done · 1 needs your Accept · 1 in review · 2 in progress · 2 not started",
    );
  });

  it("uses the wording the Done refusal uses for a story waiting on the user", () => {
    expect(STAGE_BREAKDOWN.accept).toBe("needs your Accept");
  });

  it("a story accepted while its CI runs no longer needs the Accept: it is in review", () => {
    const accepted = recordAcceptance(stories("FEAT-1")[1] as Card, true, "user", at(5));
    expect(stageBreakdown([accepted], config)).toBe("1 in review");
  });

  it("leaves out stages with none, and is empty with no items", () => {
    expect(stageBreakdown([story("STORY-1", "FEAT-1")], config)).toBe("1 not started");
    expect(stageBreakdown([], config)).toBe("");
  });

  it("is on the feature's Work row, from the same items as its counts", () => {
    const row = list([epic, feature("FEAT-1"), ...stories("FEAT-1")]).epics[0]?.features[0];
    expect(row?.progress.label).toBe("1 of 7 stories done");
    expect(row?.breakdown).toBe("1 done · 1 needs your Accept · 1 in review · 2 in progress · 2 not started");
  });
});

describe("AC1: an epic's bar says its breakdown by feature status", () => {
  const features = [
    feature("FEAT-1", "done"),
    feature("FEAT-2", "active"),
    feature("FEAT-3", "active"),
    feature("FEAT-4", "approved"),
    feature("FEAT-5", "draft"),
    feature("FEAT-6", "cancelled"),
  ];

  it("counts done, in progress, approved and draft, in bar order, without Cancelled", () => {
    expect(statusBreakdown(features)).toBe("1 done · 2 in progress · 1 approved · 1 draft");
    expect(statusBreakdown([])).toBe("");
  });

  it("is on the epic's Work row and on the group of features without an epic", () => {
    const loose = [feature("FEAT-7", "done", null), feature("FEAT-8", "approved", null)];
    const rows = list([epic, ...features, ...loose]).epics;
    expect(rows[0]?.breakdown).toBe("1 done · 2 in progress · 1 approved · 1 draft");
    expect(rows[1]).toMatchObject({ id: null, breakdown: "1 done · 1 approved" });
  });
});

describe("AC4: added items show their origin in the feature row's +N added", () => {
  // FEAT-1 is approved at 0 and started at 10; everything after that is added.
  const started = moves(feature("FEAT-1", "approved"), [10, "active"]);
  const planned = story("STORY-1", "FEAT-1", { created: 0 });
  const added = { ...story("STORY-2", "FEAT-1", { created: 15 }), origin: "added" as const };
  const movedIn = reparent(story("STORY-3", "FEAT-2", { created: 0 }), 20, "FEAT-1");
  const bug = story("BUG-1", "FEAT-1", { created: 25, type: "bug" });

  it("counts added stories and bugs apart", () => {
    const row = list([epic, started, planned, added, movedIn, bug]).epics[0]?.features[0];
    expect(row?.scope).toEqual({ added: 3, addedBreakdown: "+3 added: 2 stories · 1 bug", openBugs: 1 });
    expect(row?.stories.filter((s) => s.added).map((s) => [s.id, s.type])).toEqual([
      ["BUG-1", "bug"],
      ["STORY-2", "story"],
      ["STORY-3", "story"],
    ]);
  });

  it("names one kind alone, and says nothing when nothing was added", () => {
    expect(addedBreakdown({ stories: 0, bugs: 1 })).toBe("+1 added: 1 bug");
    expect(addedBreakdown({ stories: 1, bugs: 0 })).toBe("+1 added: 1 story");
    expect(addedBreakdown({ stories: 0, bugs: 0 })).toBe("");
    const row = list([epic, started, planned]).epics[0]?.features[0];
    expect(row?.scope).toEqual({ added: 0, addedBreakdown: "", openBugs: 0 });
  });

  it("before the feature goes in progress nothing is added, whenever it was made", () => {
    const row = list([epic, feature("FEAT-1", "approved"), planned, added, bug]).epics[0]?.features[0];
    expect(row?.scope).toMatchObject({ added: 0, addedBreakdown: "" });
  });
});
