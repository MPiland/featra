import { describe, expect, it } from "vitest";
import {
  BUG_COPY,
  MAIN,
  REPORT_BUG_MESSAGES,
  bugAsk,
  bugCommitMessage,
  bugFileParams,
  bugPlacements,
  bugProposeParams,
  bugTaskText,
  buildWorkList,
  causeLine,
  chatApproveParams,
  fileBug,
  newCard,
  normalizeBugPlacements,
  parseBugReport,
  parseCard,
  placementRefusal,
  routeOf,
  routeProblem,
  scopeSummary,
  serializeCard,
  type Card,
  type OwnedCard,
} from "../src/index.ts";
import { at, config, feature, moves, story } from "./fixtures.ts";

// FEAT-1 is in progress (STORY-1 went active at minute 1), FEAT-0 is Done, FEAT-2 is approved and not started.
const cards: Card[] = [
  newCard({ id: "EPIC-1", type: "epic", title: "E", status: "active" }, "user", at(0)),
  feature("FEAT-1", "active"),
  feature("FEAT-0", "done"),
  feature("FEAT-2", "approved"),
  moves(story("STORY-1", "FEAT-1"), [1, "In Progress"]),
  moves(story("STORY-2", "FEAT-1"), [1, "In Progress"], [2, "Done"]),
  moves(story("STORY-3", "FEAT-0"), [1, "In Progress"], [2, "Done"]),
  story("STORY-4", "FEAT-2"),
];
const report = (cause: string | null = null) => ({
  title: "Saves twice",
  description: "Pressing Save writes two copies.",
  cause,
});
const ctx = (id = "BUG-1") => ({ cards, config, id, by: "user", at: at(10) });

describe("bugPlacements", () => {
  it("offers a bug under each feature in progress, a task on each story being worked, then the project list", () => {
    expect(bugPlacements(null, cards, config).choices).toEqual([
      { key: "feature:FEAT-1", label: BUG_COPY.feature("FEAT-1", "FEAT-1") },
      { key: "task:STORY-1", label: BUG_COPY.task("STORY-1", "STORY-1") },
      { key: "project", label: BUG_COPY.project },
    ]);
  });

  it.each([
    ["a story still being worked", "STORY-1"],
    ["a finished story of the feature in progress", "STORY-2"],
    ["the feature in progress", "FEAT-1"],
    ["a story of a Done feature", "STORY-3"],
    ["a Done feature", "FEAT-0"],
    ["a story not started", "STORY-4"],
    ["no known cause", null],
  ])("proposes what routeProblem routes for %s", (_, cause) => {
    const { proposed, choices } = bugPlacements(cause, cards, config);
    expect(routeOf(proposed)).toEqual(routeProblem(cause, cards, config));
    expect(choices.map((c) => c.key)).toContain(proposed);
  });
});

describe("Done stays Done", () => {
  it("never offers a Done feature, nor a task on a Done story", () => {
    const keys = bugPlacements("STORY-3", cards, config).choices.map((c) => c.key);
    expect(keys).not.toContain("feature:FEAT-0");
    expect(keys).not.toContain("task:STORY-3");
    expect(bugPlacements("FEAT-0", cards, config).proposed).toBe("project");
  });

  it("refuses a Done feature or a finished story asked for by key", () => {
    expect(placementRefusal("feature:FEAT-0", cards, config)).toBe(REPORT_BUG_MESSAGES.placeGone("feature:FEAT-0"));
    expect(placementRefusal("task:STORY-2", cards, config)).toBe(REPORT_BUG_MESSAGES.placeGone("task:STORY-2"));
  });

  it("files a bug blamed on a Done feature on the project list, and leaves the feature as it was", () => {
    const filed = fileBug(report("FEAT-0"), bugPlacements("FEAT-0", cards, config).proposed, ctx());
    expect(filed.card.parent).toBeNull();
    expect(filed.card.id).toBe("BUG-1");
    const done = cards.find((c) => c.id === "FEAT-0");
    expect(done?.status).toBe("done");
    expect(scopeSummary("FEAT-0", [...cards, filed.card], config).bugs.total).toBe(0);
  });
});

describe("placementRefusal", () => {
  it.each(["feature:FEAT-1", "task:STORY-1", "project"])("takes %s", (key) => {
    expect(placementRefusal(key, cards, config)).toBeNull();
  });

  it.each(["", "elsewhere", "feature:", "feature:FEAT-1:x", "task:nope", 7, null])("refuses %j", (key) => {
    expect(placementRefusal(key, cards, config)).toBe(REPORT_BUG_MESSAGES.badPlacement);
  });

  it("refuses a feature not started", () => {
    expect(placementRefusal("feature:FEAT-2", cards, config)).toBe(REPORT_BUG_MESSAGES.placeGone("feature:FEAT-2"));
  });
});

describe("fileBug", () => {
  it("makes a bug card under the feature in progress, at the first stage, counted as added scope", () => {
    const filed = fileBug(report("STORY-2"), "feature:FEAT-1", ctx("BUG-4"));
    expect(filed.kind).toBe("card");
    const bug = filed.card;
    expect(bug).toMatchObject({
      id: "BUG-4",
      type: "bug",
      title: "Saves twice",
      status: config.stages[0]?.name,
      parent: "FEAT-1",
      origin: "bug",
    });
    expect(bug.order).toBe(Math.max(...cards.filter((c) => c.parent === "FEAT-1").map((c) => c.order)) + 1);
    expect(bug.description).toBe(
      `Pressing Save writes two copies.\n\n${causeLine({ id: "STORY-2", title: "STORY-2" })}`,
    );
    const scope = scopeSummary("FEAT-1", [...cards, bug], config);
    expect(scope.added).toEqual([expect.objectContaining({ id: "BUG-4", origin: "bug" })]);
    expect(scope.bugs).toEqual({ total: 1, open: 1 });
  });

  it("writes a card that reads back the same, origin and all", () => {
    const { card } = fileBug(report("FEAT-1"), "feature:FEAT-1", ctx());
    expect(parseCard(serializeCard(card))).toEqual(card);
  });

  it("makes a project bug with no cause line when no cause is known", () => {
    const { card } = fileBug(report(), "project", ctx("BUG-2"));
    expect(card).toMatchObject({
      id: "BUG-2",
      parent: null,
      origin: "bug",
      description: "Pressing Save writes two copies.",
    });
  });

  it("adds a task to the story being worked, and records it in the story's history", () => {
    const filed = fileBug(report("STORY-1"), "task:STORY-1", ctx());
    expect(filed.kind).toBe("task");
    expect(filed.card.id).toBe("STORY-1");
    expect(filed.card.tasks.at(-1)).toEqual({ text: bugTaskText("Saves twice"), done: false });
    expect(filed.card.history.at(-1)).toMatchObject({ field: "content", to: "tasks", by: "user", at: at(10) });
  });

  it("names its commit by what it made", () => {
    expect(bugCommitMessage(fileBug(report(), "project", ctx("BUG-3")))).toBe("BUG-3: bug filed");
    expect(bugCommitMessage(fileBug(report(), "task:STORY-1", ctx()))).toBe("STORY-1: bug task added");
  });
});

describe("parseBugReport", () => {
  it("tidies the title and the cause", () => {
    expect(parseBugReport({ title: "  Saves \n twice ", description: " x ", cause: " story-2 " })).toEqual({
      ok: true,
      value: { title: "Saves twice", description: "x", cause: "STORY-2" },
    });
    expect(parseBugReport({ title: "T" })).toEqual({ ok: true, value: { title: "T", description: "", cause: null } });
  });

  it.each([
    [{}, REPORT_BUG_MESSAGES.badTitle],
    [{ title: "  " }, REPORT_BUG_MESSAGES.badTitle],
    [{ title: "x".repeat(121) }, REPORT_BUG_MESSAGES.longTitle],
    [{ title: "T", description: 3 }, REPORT_BUG_MESSAGES.badDescription],
    [{ title: "T", description: "x".repeat(4001) }, REPORT_BUG_MESSAGES.longDescription],
    [{ title: "T", cause: 9 }, REPORT_BUG_MESSAGES.badCause],
    [{ title: "T", cause: "not an id" }, REPORT_BUG_MESSAGES.badCause],
  ])("refuses %j", (input, error) => {
    expect(parseBugReport(input)).toEqual({ ok: false, error });
  });

  it("reads the socket's params", () => {
    expect(bugProposeParams({ dir: "d", cause: "feat-1" })).toEqual({ dir: "d", cause: "FEAT-1" });
    expect(bugProposeParams({ dir: "d", cause: null })).toEqual({ dir: "d", cause: null });
    expect(bugProposeParams({ cause: null })).toBeNull();
    expect(bugFileParams({ dir: "d", title: "T", description: "", cause: null, placement: "project" })).toEqual({
      ok: true,
      dir: "d",
      report: { title: "T", description: "", cause: null },
      placement: "project",
    });
    expect(bugFileParams({ dir: "d", title: "", placement: "project" })).toEqual({
      ok: false,
      error: REPORT_BUG_MESSAGES.badTitle,
    });
  });
});

describe("the placement crossing to the client", () => {
  const placements = bugPlacements("STORY-1", cards, config);

  it("reads placements back whole, and refuses a proposal that isn't a choice", () => {
    expect(normalizeBugPlacements(JSON.parse(JSON.stringify(placements)))).toEqual(placements);
    expect(normalizeBugPlacements({ proposed: "x", choices: placements.choices })).toBeNull();
    expect(normalizeBugPlacements({ proposed: "project", choices: [{ key: "project" }] })).toBeNull();
  });

  it("reads the request card's input", () => {
    expect(bugAsk({ ...report("STORY-1"), ...placements })).toEqual({ ...report("STORY-1"), ...placements });
    expect(bugAsk({ title: "T", ...placements })).toBeNull();
  });

  it("carries the place the user picked on Allow, and only on Allow", () => {
    expect(chatApproveParams({ id: "c", tool: "t", choice: "allow", option: "task:STORY-1" })).toEqual({
      id: "c",
      tool: "t",
      answer: { choice: "allow", option: "task:STORY-1" },
    });
    expect(chatApproveParams({ id: "c", tool: "t", choice: "deny", option: "project" })?.answer).toEqual({
      choice: "deny",
    });
    expect(chatApproveParams({ id: "c", tool: "t", choice: "allow", option: "" })).toBeNull();
    expect(chatApproveParams({ id: "c", tool: "t", choice: "allow", option: 3 })).toBeNull();
  });
});

const owned = (card: Card): OwnedCard => ({ card, owner: MAIN, shownFrom: MAIN, path: `${card.id}.md` });
const bug = (id: string, parent: string | null, order: number) => ({
  ...story(id, parent, { type: "bug" }),
  order,
});

describe("the project bug list", () => {
  it("lists bugs under no feature apart, in order; a feature's bugs stay under it", () => {
    const list = buildWorkList(
      {
        cards: [
          ...cards,
          bug("BUG-2", null, 2),
          bug("BUG-1", null, 1),
          bug("BUG-3", "FEAT-1", 5),
          story("STORY-9", null),
        ].map(owned),
        stale: [],
        problems: [],
      },
      config,
    );
    expect(list.bugs?.map((b) => [b.id, b.type])).toEqual([
      ["BUG-1", "bug"],
      ["BUG-2", "bug"],
    ]);
    const features = list.epics.flatMap((e) => e.features);
    expect(features.find((f) => f.id === "FEAT-1")?.stories.map((s) => s.id)).toContain("BUG-3");
    expect(features.find((f) => f.id === null)?.stories.map((s) => s.id)).toEqual(["STORY-9"]);
  });

  it("leaves the list out when there are none", () => {
    expect(buildWorkList({ cards: cards.map(owned), stale: [], problems: [] }, config).bugs).toBeUndefined();
  });
});
