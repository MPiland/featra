/**
 * STORY-62 AC2, AC3: with the card pane open the Work list hides its less important columns and brings them back when
 * it closes; feature and story rows keep one grid, and a story's PR moves to its line of marks while its column is
 * hidden. Through the real App, over real work-format cards.
 */
import { act, cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PROJECT, renderApp } from "../harness.tsx";
import { cardOf, PLAN } from "../work-fixtures.ts";

afterEach(cleanup);

const list = () => screen.getByRole("region", { name: "Work list" });
const table = () => within(list()).getByRole("table", { name: "Prove the core" });
const headers = () =>
  within(table())
    .getAllByRole("columnheader")
    .map((h) => h.textContent);
const rowOf = (id: string) => list().querySelector<HTMLElement>(`[role="row"][data-card="${id}"]`) as HTMLElement;
const cells = (id: string) => within(rowOf(id)).getAllByRole("cell");
const grid = () => list().style.getPropertyValue("--work-grid");
const meta = () => rowOf("STORY-2").querySelector<HTMLElement>(".story-meta");
const prCell = () => cells("STORY-2")[4];
const progressIn = (cell: Element) => cell.querySelector(".prog");
/** The epic's feature columns, then a feature's story columns, all shown. */
const ALL_HEADERS = ["Feature", "Status", "Progress", "Tasks", "Scope", "Story", "Stage", "Criteria", "Tasks", "PR"];

async function openFeature() {
  const app = renderApp({ cards: { [PROJECT.dir]: PLAN.map(cardOf) } });
  await screen.findByRole("region", { name: "Work list" });
  await app.user.click(screen.getByRole("button", { name: "Cards and the feature list" }));
  return app;
}

describe("the Work list's columns with the card pane (STORY-62 AC2)", () => {
  it("shows every column with the pane closed", async () => {
    await openFeature();
    expect(headers()).toEqual(ALL_HEADERS);
    expect(cells("FEAT-2")).toHaveLength(5);
    expect(cells("STORY-2")).toHaveLength(5);
    expect(grid()).toBe("14px minmax(0, 1fr) 116px 184px 64px 176px");
  });

  it("hides Tasks and Scope while the pane is open, and brings them back when it closes", async () => {
    const app = await openFeature();
    await app.user.click(screen.getByRole("button", { name: "Open a folder" }));
    const pane = await screen.findByRole("complementary", { name: "STORY-2 card" });
    expect(headers()).toEqual(["Feature", "Status", "Progress", "Story", "Stage", "Criteria"]);
    expect(cells("FEAT-2")).toHaveLength(3);
    expect(cells("STORY-2")).toHaveLength(3);
    expect(grid()).toBe("14px minmax(0, 1fr) 116px 184px");

    await app.user.click(within(pane).getByRole("button", { name: "Close card" }));
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(headers()).toHaveLength(10);
    expect(cells("FEAT-2")).toHaveLength(5);
    expect(cells("STORY-2")).toHaveLength(5);
  });

  it("keeps feature and story rows on the one grid the list sets", async () => {
    const app = await openFeature();
    const rows = [rowOf("FEAT-2"), rowOf("STORY-2"), ...within(table()).getAllByRole("row")];
    for (const row of rows) expect(row.className).toMatch(/^(frow|prow)\b/);
    // Both row types take the list's template; neither sets its own.
    for (const row of rows) expect(row.style.gridTemplateColumns).toBe("");
    await app.user.click(screen.getByRole("button", { name: "Open a folder" }));
    await screen.findByRole("complementary", { name: "STORY-2 card" });
    const features = within(table())
      .getAllByRole("row")
      .filter((r) => r.classList.contains("frow"));
    const stories = within(table())
      .getAllByRole("row")
      .filter((r) => r.classList.contains("prow"));
    for (const row of [...features, ...stories]) expect(row.children).toHaveLength(4);
  });
});

/**
 * The layout jsdom lacks, faked: ResizeObservers that report when observing and on `resize()`, and the Work list as
 * wide as it is at 1280×800: `closed` px, or `open` px beside the card pane. Everything else measures 0, as in jsdom.
 */
function listWidthOf(closed: number, open: number) {
  const observer = globalThis.ResizeObserver;
  const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
  const watching = new Set<() => void>();
  globalThis.ResizeObserver = class {
    private readonly tell: () => void;
    constructor(report: ResizeObserverCallback) {
      this.tell = () => report([], this);
    }
    observe() {
      watching.add(this.tell);
      this.tell();
    }
    unobserve() {
      watching.delete(this.tell);
    }
    disconnect() {
      watching.delete(this.tell);
    }
  };
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get(this: HTMLElement) {
      if (!this.classList.contains("work-list")) return 0;
      return document.querySelector(".card-pane") ? open : closed;
    },
  });
  return {
    resize: () => act(() => watching.forEach((tell) => tell())),
    restore: () => {
      globalThis.ResizeObserver = observer;
      if (clientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", clientWidth);
    },
  };
}

describe("a feature's progress while its column is hidden (STORY-62)", () => {
  it("joins the feature's name cell at the list's review width with the pane open, and goes back to its column after", async () => {
    const layout = listWidthOf(1202, 605);
    try {
      const app = await openFeature();
      expect(progressIn(cells("FEAT-2")[0] as HTMLElement)).toBeNull();
      expect(progressIn(cells("FEAT-2")[2] as HTMLElement)).toBeTruthy();

      await app.user.click(screen.getByRole("button", { name: "Open a folder" }));
      const pane = await screen.findByRole("complementary", { name: "STORY-2 card" });
      layout.resize();
      expect(headers()).toEqual(["Feature", "Status", "Story", "Stage"]);
      expect(cells("FEAT-2")).toHaveLength(2);
      expect(progressIn(cells("FEAT-2")[0] as HTMLElement)).toBeTruthy();
      expect(rowOf("FEAT-2").querySelectorAll(".prog")).toHaveLength(1);

      await app.user.click(within(pane).getByRole("button", { name: "Close card" }));
      layout.resize();
      expect(progressIn(cells("FEAT-2")[0] as HTMLElement)).toBeNull();
      expect(progressIn(cells("FEAT-2")[2] as HTMLElement)).toBeTruthy();
    } finally {
      layout.restore();
    }
  });
});

describe("a story's line of marks (STORY-62 AC3)", () => {
  it("holds its PR while the PR column is hidden, and gives it back to the column after", async () => {
    const app = await openFeature();
    expect(within(prCell() as HTMLElement).getByRole("link", { name: "#15" })).toBeTruthy();
    expect(meta()?.querySelector("a")).toBeNull();

    await app.user.click(screen.getByRole("button", { name: "Open a folder" }));
    const pane = await screen.findByRole("complementary", { name: "STORY-2 card" });
    expect(within(meta() as HTMLElement).getByRole("link", { name: "#15" })).toBeTruthy();
    expect(within(rowOf("STORY-2")).getAllByRole("link", { name: "#15" })).toHaveLength(1);

    await app.user.click(within(pane).getByRole("button", { name: "Close card" }));
    expect(within(prCell() as HTMLElement).getByRole("link", { name: "#15" })).toBeTruthy();
    expect(meta()?.querySelector("a")).toBeNull();
  });

  it("sits under the title, in the name cell, apart from it", async () => {
    await openFeature();
    const name = cells("STORY-2")[0] as HTMLElement;
    const title = name.querySelector(".pn-title");
    expect(within(title as HTMLElement).getByRole("button", { name: "Open a folder" })).toBeTruthy();
    expect(title?.nextElementSibling?.classList.contains("story-meta") ?? false).toBe(true);
  });
});
