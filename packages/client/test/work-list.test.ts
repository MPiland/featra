import { describe, expect, it } from "vitest";
import { featureStatusLabel, filterCounts, filterEpics, LIST_FILTERS, noWork, type WorkUpdate } from "../src/bridge.ts";
import { PLAN, workList } from "./work-fixtures.ts";

const ids = (epics: ReturnType<typeof filterEpics>) => epics.map((e) => [e.id, e.features.map((f) => f.id)]);
const { epics } = workList(PLAN);

describe("filterEpics", () => {
  it("All keeps every epic and feature", () => {
    expect(ids(filterEpics(epics, "all"))).toEqual([
      ["EPIC-1", ["FEAT-1", "FEAT-2", "FEAT-3"]],
      [null, [null]],
    ]);
  });

  it("a filter keeps only matching features and drops epics left empty", () => {
    expect(ids(filterEpics(epics, "done"))).toEqual([["EPIC-1", ["FEAT-1"]]]);
    expect(ids(filterEpics(epics, "backlog"))).toEqual([
      ["EPIC-1", ["FEAT-3"]],
      [null, [null]],
    ]);
  });

  it("leaves the epic's own counts alone", () => {
    expect(filterEpics(epics, "done")[0]?.progress).toEqual(epics[0]?.progress);
  });
});

describe("filterCounts", () => {
  it("counts features per chip; a feature can count under more than one", () => {
    expect(filterCounts(epics)).toEqual({ all: 4, "in-progress": 1, "needs-review": 1, backlog: 2, done: 1 });
    expect(Object.keys(filterCounts([]))).toEqual(LIST_FILTERS.map((f) => f.id));
  });
});

describe("featureStatusLabel", () => {
  it.each([
    ["draft", "Draft"],
    ["approved", "Approved"],
    ["active", "In progress"],
    ["done", "Done"],
    ["cancelled", "Cancelled"],
    ["paused", "paused"],
    [null, "—"],
  ])("%s → %s", (status, label) => {
    expect(featureStatusLabel(status)).toBe(label);
  });
});

describe("noWork", () => {
  it("answers at once with an empty list and why, and refuses the copy actions", async () => {
    const heard: WorkUpdate[] = [];
    const bridge = noWork("No folders here.");
    bridge.watch("/p", (u) => heard.push(u))();
    expect(heard).toEqual([{ list: { epics: [], stale: [], problems: [] }, error: "No folders here." }]);
    expect(await bridge.applyCopy("/p", "k")).toEqual({ ok: false, error: "No folders here." });
    expect(await bridge.discardCopy("/p", "k")).toEqual({ ok: false, error: "No folders here." });
  });
});
