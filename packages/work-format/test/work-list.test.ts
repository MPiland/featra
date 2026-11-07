import { describe, expect, it } from "vitest";
import {
  MAIN,
  buildWorkList,
  copyKey,
  featureFilters,
  newCard,
  normalizeWorkList,
  stageTone,
  type Card,
  type OwnedCard,
  type Resolution,
} from "../src/index.ts";
import { at, config, feature, moves, story } from "./fixtures.ts";

const owned = (card: Card): OwnedCard => ({ card, owner: MAIN, shownFrom: MAIN, path: `.featra/cards/${card.id}.md` });
const resolution = (cards: Card[], extra: Partial<Resolution> = {}): Resolution => ({
  cards: cards.map(owned),
  stale: [],
  problems: [],
  ...extra,
});
const epic = (id: string, order = 0) => ({
  ...newCard({ id, type: "epic", title: id, status: "active" }, "user", at(0)),
  order,
});

describe("stageTone", () => {
  it.each([
    ["New", "idle"],
    ["Ready", "idle"],
    ["In Progress", "active"],
    ["In Review", "review"],
    ["Acceptance", "review"],
    ["Done", "done"],
    ["Cancelled", "cancelled"],
    ["Unknown stage", "idle"],
  ])("%s → %s", (stage, tone) => {
    expect(stageTone(stage, config)).toBe(tone);
  });
});

describe("featureFilters", () => {
  it.each([
    ["active", ["active"], ["in-progress"]],
    ["active", ["review", "idle"], ["in-progress", "needs-review"]],
    ["draft", ["idle"], ["backlog"]],
    ["approved", [], ["backlog"]],
    ["done", ["done"], ["done"]],
    ["cancelled", ["cancelled"], []],
  ] as const)("feature %s with stories %j → %j", (status, tones, filters) => {
    expect(featureFilters(status, tones)).toEqual(filters);
  });

  it("the no-feature row takes its filters from its stories", () => {
    expect(featureFilters(null, ["active", "idle"])).toEqual(["in-progress", "backlog"]);
    expect(featureFilters(null, ["done", "cancelled"])).toEqual(["done"]);
    expect(featureFilters(null, ["review"])).toEqual(["in-progress", "needs-review"]);
    expect(featureFilters(null, [])).toEqual([]);
  });
});

describe("buildWorkList", () => {
  const cards = [
    epic("EPIC-2", 1),
    epic("EPIC-1", 0),
    feature("FEAT-1", "active", "EPIC-1"),
    feature("FEAT-2", "done", "EPIC-1"),
    feature("FEAT-3", "draft", "EPIC-1"),
    { ...moves(story("STORY-1", "FEAT-1"), [5, "Done"]), acs: [{ text: "a", done: true, tests: [] }] },
    { ...moves(story("STORY-2", "FEAT-1"), [5, "In Review"]), pr: "#12" },
    moves(story("STORY-3", "FEAT-1"), [5, "Cancelled"]),
    story("STORY-4", null),
    feature("FEAT-9", "active", null),
  ] as Card[];
  const list = buildWorkList(resolution(cards), config);

  it("groups features under epics in order, with a no-epic group last", () => {
    expect(list.epics.map((e) => e.id)).toEqual(["EPIC-1", "EPIC-2", null]);
    expect(list.epics[0]?.features.map((f) => f.id)).toEqual(["FEAT-1", "FEAT-2", "FEAT-3"]);
    expect(list.epics[2]?.features.map((f) => f.id)).toEqual(["FEAT-9", null]);
  });

  it("counts epic progress in features and bars by feature status", () => {
    const e = list.epics[0];
    expect(e?.progress).toEqual({ done: 1, total: 3, label: "1 of 3 features done" });
    expect(e?.bar).toEqual([
      { tone: "done", count: 1 },
      { tone: "active", count: 1 },
      { tone: "idle", count: 1 },
    ]);
  });

  it("gives feature rows counts, a stage bar, filters and story rows", () => {
    const f = list.epics[0]?.features[0];
    expect(f).toMatchObject({
      status: "active",
      tone: "active",
      filters: ["in-progress", "needs-review"],
      progress: { done: 1, total: 2, label: "1 of 2 stories done" },
      bar: [
        { tone: "done", count: 1 },
        { tone: "review", count: 1 },
      ],
    });
    expect(f?.stories.map((s) => [s.id, s.stage, s.tone, s.pr])).toEqual([
      ["STORY-1", "Done", "done", null],
      ["STORY-2", "In Review", "review", "#12"],
      ["STORY-3", "Cancelled", "cancelled", null],
    ]);
    expect(f?.stories[0]?.criteria).toEqual({ done: 1, total: 1 });
  });

  it("puts stories without a feature on a no-feature row", () => {
    const row = list.epics[2]?.features[1];
    expect(row).toMatchObject({ id: null, status: null, filters: ["backlog"] });
    expect(row?.progress.label).toBe("0 of 1 story done");
    expect(row?.stories.map((s) => s.id)).toEqual(["STORY-4"]);
  });

  it("lists stale copies with keys and labels", () => {
    const loc = { kind: "worktree", branch: "claude/story-1", path: "/wt/s1" } as const;
    const l = buildWorkList(
      resolution(cards, { stale: [{ cardId: "STORY-1", location: MAIN, path: "p.md", owner: loc }] }),
      config,
    );
    expect(l.stale).toEqual([
      { key: "main|p.md", cardId: "STORY-1", where: "main", owner: "worktree claude/story-1", path: "p.md" },
    ]);
    expect(copyKey(loc, "p.md")).toBe("worktree:/wt/s1|p.md");
    expect(copyKey({ kind: "feature", branch: "feature/1" }, "p.md")).toBe("feature:feature/1|p.md");
  });

  it("survives a round trip through the client's normalizer", () => {
    expect(normalizeWorkList(JSON.parse(JSON.stringify(list)))).toEqual(list);
  });

  it("the normalizer drops junk", () => {
    expect(normalizeWorkList({ epics: [{ id: 3, features: [{ filters: ["nope"], bar: [{ tone: "x" }] }] }] })).toEqual({
      epics: [
        {
          id: null,
          title: "",
          progress: { done: 0, total: 0, label: "" },
          bar: [],
          features: [
            {
              id: null,
              title: "",
              status: null,
              tone: "idle",
              filters: [],
              progress: { done: 0, total: 0, label: "" },
              bar: [{ tone: "idle", count: 0 }],
              tasks: { done: 0, total: 0 },
              scope: { added: 0, openBugs: 0 },
              stories: [],
            },
          ],
        },
      ],
      stale: [],
      problems: [],
    });
  });
});
