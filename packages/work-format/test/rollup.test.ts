import { describe, expect, it } from "vitest";
import {
  burnUp,
  epicProgress,
  featureProgress,
  originForNewItem,
  progressLabel,
  scopeBaseline,
  scopeSummary,
} from "../src/index.ts";
import { at, config, feature, moves, story, reparent } from "./fixtures.ts";

const tasksMode = { ...config, progress: "tasks" as const };

const withTasks = (c: ReturnType<typeof story>, done: number, total: number) => ({
  ...c,
  tasks: Array.from({ length: total }, (_, i) => ({ text: `t${i}`, done: i < done })),
});

describe("featureProgress", () => {
  const cards = [
    feature("FEAT-1"),
    withTasks(moves(story("STORY-1", "FEAT-1"), [5, "Done"]), 1, 3),
    withTasks(moves(story("STORY-2", "FEAT-1"), [5, "In Progress"]), 2, 4),
    withTasks(story("STORY-3", "FEAT-1"), 0, 2),
    moves(story("STORY-4", "FEAT-1"), [5, "Cancelled"]),
    story("STORY-5", "FEAT-2"),
  ];

  it("counts stories, excluding cancelled and other features", () => {
    expect(featureProgress("FEAT-1", cards, config)).toEqual({
      done: 1,
      total: 3,
      unit: "stories",
      label: "1 of 3 stories done",
    });
  });

  it("counts tasks in tasks mode; a done story counts all its tasks", () => {
    expect(featureProgress("FEAT-1", cards, tasksMode)).toMatchObject({
      done: 5,
      total: 9,
      label: "5 of 9 tasks done",
    });
  });

  it("labels are counts, never percentages", () => {
    expect(progressLabel(1, 1, "stories")).toBe("1 of 1 story done");
    expect(progressLabel(0, 0, "tasks")).toBe("0 of 0 tasks done");
    expect(progressLabel(3, 10, "stories")).not.toMatch(/%/);
  });
});

describe("epicProgress", () => {
  it("counts done features, excluding cancelled", () => {
    const cards = [
      feature("FEAT-1", "done"),
      feature("FEAT-2", "active"),
      feature("FEAT-3", "cancelled"),
      feature("FEAT-4", "done", "EPIC-2"),
    ];
    expect(epicProgress("EPIC-1", cards)).toEqual({ done: 1, total: 2, label: "1 of 2 features done" });
  });
});

describe("scope baseline and added items", () => {
  // FEAT-1 is approved at 0 and goes in progress (Start feature) at 10 (ADR 0038).
  const base = [
    moves(feature("FEAT-1", "approved"), [10, "active"]),
    moves(story("STORY-1", "FEAT-1", { created: 0 }), [12, "In Progress"], [30, "Done"]),
    moves(story("STORY-2", "FEAT-1", { created: 0 }), [20, "In Progress"]),
  ];

  it("is null until the feature goes in progress", () => {
    expect(scopeBaseline("FEAT-1", [feature("FEAT-1", "approved"), story("STORY-1", "FEAT-1")])).toBeNull();
    expect(originForNewItem("FEAT-1", "story", [feature("FEAT-1", "approved")])).toBe("planned");
  });

  it("is set by the feature going in progress and never moves", () => {
    const backAgain = base.map((c) => (c.id === "FEAT-1" ? moves(c, [40, "approved"], [50, "active"]) : c));
    expect(scopeBaseline("FEAT-1", base)).toBe(at(10));
    expect(scopeBaseline("FEAT-1", backAgain)).toBe(at(10));
  });

  it("is the creation of a feature written already in progress, whose history never records the move", () => {
    const handWritten = { ...feature("FEAT-1", "approved"), status: "active", created: at(3) };
    expect(scopeBaseline("FEAT-1", [handWritten])).toBe(at(3));
    expect(scopeBaseline("FEAT-1", [{ ...handWritten, status: "approved" }])).toBeNull();
  });

  it("is never set by a story starting: a feature still approved has none", () => {
    const approved = [feature("FEAT-1", "approved"), ...base.slice(1)];
    expect(scopeBaseline("FEAT-1", approved)).toBeNull();
    expect(scopeSummary("FEAT-1", [...approved, story("STORY-3", "FEAT-1", { created: 15 })], config).added).toEqual(
      [],
    );
  });

  it("lists items created or moved in after the baseline, with origin, and counts bugs", () => {
    const added = { ...story("STORY-3", "FEAT-1", { created: 15 }), origin: "added" as const };
    const bug = moves(story("BUG-1", "FEAT-1", { created: 25, type: "bug" }), [35, "Done"]);
    const openBug = story("BUG-2", "FEAT-1", { created: 26, type: "bug" });
    const movedIn = reparent(story("STORY-4", "FEAT-2", { created: 0 }), 40, "FEAT-1");
    const cancelled = moves(story("STORY-5", "FEAT-1", { created: 15 }), [16, "Cancelled"]);
    const s = scopeSummary("FEAT-1", [...base, added, bug, openBug, movedIn, cancelled], config);
    expect(s.baseline).toBe(at(10));
    expect(s.added.map((a) => [a.id, a.origin, a.at])).toEqual([
      ["STORY-3", "added", at(15)],
      ["BUG-1", "bug", at(25)],
      ["BUG-2", "bug", at(26)],
      ["STORY-4", "planned", at(40)],
    ]);
    expect(s.addedLabel).toBe("+4 added since start");
    expect(s.bugs).toEqual({ total: 2, open: 1 });
    expect(s.addedCounts).toEqual({ stories: 2, bugs: 2 });
    expect(s.addedBreakdown).toBe("+4 added: 2 stories · 2 bugs");
  });

  it("new items are `added` after the baseline and bugs are always `bug`", () => {
    expect(originForNewItem("FEAT-1", "story", base)).toBe("added");
    expect(originForNewItem("FEAT-1", "bug", [])).toBe("bug");
  });
});

describe("burnUp", () => {
  it("builds scope and done lines from history, including moves and cancellations", () => {
    const cards = [
      feature("FEAT-1"),
      moves(story("STORY-1", "FEAT-1", { created: 0 }), [10, "In Progress"], [30, "Done"]),
      moves(story("STORY-2", "FEAT-1", { created: 0 }), [20, "In Progress"], [50, "Done"]),
      story("STORY-3", "FEAT-1", { created: 40 }),
      moves(story("STORY-4", "FEAT-1", { created: 0 }), [45, "Cancelled"]),
      reparent(story("STORY-5", "FEAT-1", { created: 0 }), 60, "FEAT-2"),
    ];
    expect(burnUp("FEAT-1", cards, config)).toEqual([
      { at: at(0), scope: 4, done: 0 },
      { at: at(30), scope: 4, done: 1 },
      { at: at(40), scope: 5, done: 1 },
      { at: at(45), scope: 4, done: 1 },
      { at: at(50), scope: 4, done: 2 },
      { at: at(60), scope: 3, done: 2 },
    ]);
  });

  it("is empty for a feature with no items", () => {
    expect(burnUp("FEAT-1", [feature("FEAT-1")], config)).toEqual([]);
  });

  it("starts at the scope baseline: empty before the feature goes in progress, then scope from that moment", () => {
    const stories = [
      moves(story("STORY-1", "FEAT-1", { created: 0 }), [5, "In Progress"], [30, "Done"]),
      story("STORY-2", "FEAT-1", { created: 8 }),
      story("STORY-3", "FEAT-1", { created: 20 }),
    ];
    expect(burnUp("FEAT-1", [feature("FEAT-1", "approved"), ...stories], config)).toEqual([]);
    const cards = [moves(feature("FEAT-1", "approved"), [10, "active"]), ...stories];
    expect(burnUp("FEAT-1", cards, config)).toEqual([
      { at: at(10), scope: 2, done: 0 },
      { at: at(20), scope: 3, done: 0 },
      { at: at(30), scope: 3, done: 1 },
    ]);
    // The scope line rises by exactly what "+N added" counts.
    expect(scopeSummary("FEAT-1", cards, config).added.map((a) => a.id)).toEqual(["STORY-3"]);
  });
});
