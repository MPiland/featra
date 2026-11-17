/** STORY-62 AC1, AC2: which of the Work list's columns show, with the card pane open or closed, at any width. */
import { describe, expect, it } from "vitest";
import { paneWidthFor } from "../src/pane-width.ts";
import { shownCells, WORK_COLUMNS, WORK_GRID, workColumns, workGridTemplate } from "../src/work-columns.ts";

/** The work area beside the sidebar in a window `width` px wide, and the list beside a pane at its default width. */
const SIDEBAR = 272;
const area = (width: number) => width - SIDEBAR;
const listBesidePane = (width: number) => area(width) - paneWidthFor(null, area(width));

/** The width the grid's fixed tracks, gaps and the name column's minimum take. */
const needed = (columns: readonly (keyof typeof WORK_GRID)[]) => {
  const g = WORK_GRID;
  return g.frame + g.caret + g.gap + g.name + g.gap + g.status + columns.reduce((n, c) => n + g.gap + g[c], 0);
};

describe("the Work list's columns", () => {
  it("shows every column at 1280 px wide with the pane closed", () => {
    expect(workColumns(area(1280), false)).toEqual(["progress", "tasks", "scope"]);
  });

  it("hides Tasks and Scope with the pane open, and brings them back when it closes", () => {
    const wide = 4000;
    expect(workColumns(wide, true)).toEqual(["progress"]);
    expect(workColumns(wide, false)).toEqual(["progress", "tasks", "scope"]);
  });

  it("drops Progress too when the list beside the open pane can't fit it, as at 1280 x 800", () => {
    expect(workColumns(listBesidePane(1280), true)).toEqual([]);
  });

  it("drops what doesn't fit, least important first: Tasks, then Scope, then Progress", () => {
    expect(workColumns(needed(["progress", "scope", "tasks"]), false)).toEqual(["progress", "tasks", "scope"]);
    expect(workColumns(needed(["progress", "scope", "tasks"]) - 1, false)).toEqual(["progress", "scope"]);
    expect(workColumns(needed(["progress", "scope"]) - 1, false)).toEqual(["progress"]);
    expect(workColumns(needed(["progress"]) - 1, false)).toEqual([]);
    expect(workColumns(320, false)).toEqual([]);
  });

  it("never needs more width than the list has, at any window width", () => {
    for (let width = 720; width <= 2560; width += 8) {
      for (const open of [false, true]) {
        const list = open ? listBesidePane(width) : area(width);
        expect(needed(workColumns(list, open))).toBeLessThanOrEqual(Math.max(list, needed([])));
      }
    }
  });

  it("shows what the pane allows until the list is measured", () => {
    expect(workColumns(0, false)).toEqual(WORK_COLUMNS);
    expect(workColumns(0, true)).toEqual(["progress"]);
  });

  it("builds one template for feature and story rows: caret, name, Status, then the columns shown", () => {
    expect(workGridTemplate(["progress", "tasks", "scope"])).toBe("14px minmax(0, 1fr) 116px 168px 64px 176px");
    expect(workGridTemplate([])).toBe("14px minmax(0, 1fr) 116px");
    expect(workGridTemplate(["progress", "scope"])).toBe("14px minmax(0, 1fr) 116px 168px 176px");
  });

  it("keeps the name and Status of every row, and the cells of the columns shown, in their place", () => {
    const cells = ["Feature", "Status", "Progress", "Tasks", "Scope"];
    expect(shownCells(cells, ["progress", "tasks", "scope"])).toEqual(cells);
    expect(shownCells(cells, ["progress"])).toEqual(["Feature", "Status", "Progress"]);
    expect(shownCells(cells, ["progress", "scope"])).toEqual(["Feature", "Status", "Progress", "Scope"]);
    expect(shownCells(cells, [])).toEqual(["Feature", "Status"]);
  });
});
