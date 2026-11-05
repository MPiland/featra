import { describe, expect, it } from "vitest";
import { cardFileName, idFromFileName, newCard, nextId, routeProblem, slugify, validateCards } from "../src/index.ts";
import { at, config, feature, moves, pbi } from "./fixtures.ts";

describe("routeProblem", () => {
  const cards = [
    feature("FEAT-1", "active"),
    feature("FEAT-0", "done"),
    moves(pbi("PBI-1", "FEAT-1"), [1, "In Progress"]),
    moves(pbi("PBI-2", "FEAT-1"), [1, "Done"]),
    moves(pbi("PBI-3", "FEAT-0"), [1, "Done"]),
    newCard({ id: "EPIC-1", type: "epic", title: "E", status: "active" }, "user", at(0)),
  ];

  it.each([
    ["a PBI still being worked → task on it", "PBI-1", { kind: "task", card: "PBI-1" }],
    ["a finished PBI of the in-progress feature → bug under that feature", "PBI-2", { kind: "feature-bug", feature: "FEAT-1" }],
    ["the in-progress feature itself → bug under it", "FEAT-1", { kind: "feature-bug", feature: "FEAT-1" }],
    ["a PBI of a Done feature → project bug (Done stays Done)", "PBI-3", { kind: "project-bug" }],
    ["a Done feature → project bug", "FEAT-0", { kind: "project-bug" }],
    ["an epic → project bug", "EPIC-1", { kind: "project-bug" }],
    ["unknown card → project bug", "PBI-404", { kind: "project-bug" }],
  ])("%s", (_, cause, expected) => {
    expect(routeProblem(cause, cards, config)).toEqual(expected);
  });

  it("no known cause → project bug", () => {
    expect(routeProblem(null, cards, config)).toEqual({ kind: "project-bug" });
  });
});

describe("ids", () => {
  it("allocates one past the highest number for the type", () => {
    expect(nextId("pbi", ["PBI-1", "PBI-17", "PBI-3", "FEAT-40", "junk"])).toBe("PBI-18");
    expect(nextId("bug", [])).toBe("BUG-1");
    expect(nextId("feature", ["FEAT-9"])).toBe("FEAT-10");
  });

  it("names files <ID>-<slug>.md and reads the id back", () => {
    expect(slugify("Side panel: view & edit!")).toBe("side-panel-view-edit");
    expect(cardFileName({ id: "PBI-4", title: "Side panel: view & edit!" })).toBe("PBI-4-side-panel-view-edit.md");
    expect(cardFileName({ id: "PBI-4", title: "!!!" })).toBe("PBI-4.md");
    expect(idFromFileName("PBI-4-side-panel-view-edit.md")).toBe("PBI-4");
    expect(idFromFileName("PBI-4.md")).toBe("PBI-4");
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
      pbi("PBI-1", "FEAT-1"),
      pbi("BUG-1", null, { type: "bug" }),
    ];
    expect(validateCards(cards, config)).toEqual([]);
  });

  it("reports every structural problem", () => {
    const cards = [
      feature("FEAT-1", "wip", null),
      pbi("PBI-1", null),
      pbi("PBI-2", "FEAT-404"),
      pbi("PBI-3", "PBI-2"),
      { ...pbi("PBI-4", "FEAT-1"), status: "Shipped" },
      pbi("PBI-4", "FEAT-1"),
      { ...pbi("BUG-9", "FEAT-1"), type: "bug" as const, id: "PBI-99" },
    ];
    expect(validateCards(cards, config).map((i) => `${i.id}: ${i.message}`)).toEqual([
      "PBI-4: duplicate id",
      "FEAT-1: status must be one of draft, approved, active, done, cancelled",
      "PBI-1: pbi needs a parent",
      "PBI-2: parent FEAT-404 not found",
      "PBI-3: a pbi cannot sit under a pbi",
      'PBI-4: unknown stage "Shipped"',
      "PBI-99: id should look like BUG-<n>",
    ]);
  });
});
