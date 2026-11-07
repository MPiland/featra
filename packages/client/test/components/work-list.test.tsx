/** STORY-3: the Work list, through the real App over a fake host whose server sends lists built by work-format. */
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PROJECT, renderApp } from "../harness.tsx";
import { PLAN, workList } from "../work-fixtures.ts";

afterEach(cleanup);

const region = () => screen.findByRole("region", { name: "Work list" });
const epic = (name: string) => screen.findByRole("region", { name });
const toggle = (name: string) => screen.getByRole("button", { name });
const cells = (row: HTMLElement) =>
  within(row)
    .getAllByRole("cell")
    .map((c) => c.textContent);
const rowOf = (name: string) => toggle(name).closest("[role=row]") as HTMLElement;
const rowsIn = (table: HTMLElement) => within(table).getAllByRole("row");
const columns = (row: HTMLElement) =>
  within(row)
    .getAllByRole("columnheader")
    .map((c) => c.textContent);
const work = { [PROJECT.dir]: workList(PLAN) };

describe("AC1: epics fold their features; a feature opens to its stories", () => {
  it("shows each epic as a header over its features, and the loose ones under No epic", async () => {
    renderApp({ work });
    const core = await epic("Prove the core");
    expect(within(core).getByText("1 of 3 features done")).toBeTruthy();
    const table = within(core).getByRole("table", { name: "Prove the core" });
    expect(
      rowsIn(table)
        .slice(1)
        .map((r) => r.getAttribute("data-card")),
    ).toEqual(["FEAT-1", "FEAT-2", "FEAT-3"]);
    const loose = await epic("No epic");
    expect(within(loose).getByRole("button", { name: "No feature" })).toBeTruthy();
  });

  it("collapses an epic and expands it again", async () => {
    const { user } = renderApp({ work });
    const core = await epic("Prove the core");
    const header = within(core).getByRole("button", { name: "Prove the core" });
    expect(header.getAttribute("aria-expanded")).toBe("true");
    await user.click(header);
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(within(core).queryByRole("table")).toBeNull();
    await user.click(header);
    expect(within(core).getByRole("table")).toBeTruthy();
  });

  it("opens a feature to its stories, rows of the same table", async () => {
    const { user } = renderApp({ work });
    await region();
    const feature = toggle("Cards and the feature list");
    expect(feature.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Open a folder")).toBeNull();
    await user.click(feature);
    expect(feature.getAttribute("aria-expanded")).toBe("true");
    const table = screen.getByRole("table", { name: "Prove the core" });
    expect(rowsIn(table).map((r) => r.getAttribute("data-card"))).toEqual([
      null,
      "FEAT-1",
      "FEAT-2",
      null,
      "STORY-2",
      "STORY-3",
      "FEAT-3",
    ]);
    await user.click(feature);
    expect(screen.queryByText("Open a folder")).toBeNull();
  });
});

describe("AC2: features and stories share one column grid", () => {
  it("names the columns for features and for stories, and fills each row in that order", async () => {
    const { user } = renderApp({ work });
    await region();
    await user.click(toggle("Cards and the feature list"));
    const table = screen.getByRole("table", { name: "Prove the core" });
    const [head, , , storyHead] = rowsIn(table);
    expect(columns(head as HTMLElement)).toEqual(["Feature", "Status", "Progress", "Tasks", "Scope"]);
    expect(columns(storyHead as HTMLElement)).toEqual(["Story", "Stage", "Criteria", "Tasks", "PR"]);
    expect(cells(rowOf("Cards and the feature list"))).toEqual([
      "Cards and the feature list",
      "In progress",
      "0 of 2 stories done",
      "4 / 6",
      "—",
    ]);
    const story = table.querySelector("[data-card=STORY-2]") as HTMLElement;
    expect(cells(story)).toEqual(["Open a folder", "In Progress", "1 / 3", "4 / 6", "#15"]);
    expect(story.className).toBe("prow");
    expect(rowOf("Cards and the feature list").className).toContain("frow");
  });

  it("shows counts, never percentages", async () => {
    renderApp({ work });
    expect((await region()).textContent).not.toMatch(/%/);
  });
});

describe("AC3: filter chips", () => {
  it("offers All, In progress, Needs review, Backlog and Done, each with its count", async () => {
    renderApp({ work });
    const chips = within(await region()).getByRole("group", { name: "Filter features" });
    expect(
      within(chips)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["All · 4", "In progress · 1", "Needs review · 1", "Backlog · 2", "Done · 1"]);
  });

  it.each([
    ["In progress", ["FEAT-2"]],
    ["Needs review", ["FEAT-2"]],
    ["Backlog", ["FEAT-3", null]],
    ["Done", ["FEAT-1"]],
    ["All", ["FEAT-1", "FEAT-2", "FEAT-3", null]],
  ])("%s shows only its features", async (chip, ids) => {
    const { user } = renderApp({ work });
    await user.click(within(await region()).getByRole("button", { name: new RegExp(`^${chip} ·`) }));
    expect(screen.getByRole("button", { name: new RegExp(`^${chip} ·`) }).getAttribute("aria-pressed")).toBe("true");
    const shown = screen
      .getAllByRole("row")
      .filter((r) => r.className.includes("frow") && !r.className.includes("hdr"))
      .map((r) => r.getAttribute("data-card"));
    expect(shown).toEqual(ids);
  });

  it("says so when no feature matches", async () => {
    const only = { [PROJECT.dir]: workList(PLAN.filter((c) => c.id !== "FEAT-1" && c.id !== "STORY-1")) };
    const { user } = renderApp({ work: only });
    await user.click(within(await region()).getByRole("button", { name: /^Done ·/ }));
    expect(screen.getByText("No features match this filter.")).toBeTruthy();
  });
});

describe("AC5: the list follows the server", () => {
  it("says No cards yet for an empty list", async () => {
    renderApp();
    expect((await region()).textContent).toContain("No cards yet.");
  });

  it("re-renders when the server pushes a new list, keeping what the user opened", async () => {
    const { user, pushWork } = renderApp({ work });
    await region();
    await user.click(toggle("Cards and the feature list"));
    pushWork(
      PROJECT.dir,
      workList(PLAN.map((c) => (c.id === "STORY-2" ? { ...c, title: "Renamed outside", status: "Done" } : c))),
    );
    expect(await screen.findByText("Renamed outside")).toBeTruthy();
    expect(screen.getByText("1 of 2 stories done")).toBeTruthy();
    expect(toggle("Cards and the feature list").getAttribute("aria-expanded")).toBe("true");
  });

  it("shows why the list is out of date, and stops watching when the project closes", async () => {
    const { pushWork, watching } = renderApp({ work });
    await region();
    expect(watching(PROJECT.dir)).toBe(1);
    pushWork(PROJECT.dir, { list: workList(PLAN), error: "The local server stopped. Reconnecting…" });
    expect((await screen.findByRole("alert")).textContent).toBe("The local server stopped. Reconnecting…");
    cleanup();
    expect(watching(PROJECT.dir)).toBe(0);
  });

  it("lists cards that can't be shown", async () => {
    renderApp({ work: { [PROJECT.dir]: workList(PLAN, [], ["STORY-7-card.md: no id."]) } });
    const problems = (await region()).querySelector("details") as HTMLElement;
    expect(within(problems).getByText("Some cards can't be shown")).toBeTruthy();
    expect(within(problems).getByText("STORY-7-card.md: no id.")).toBeTruthy();
  });
});

const STALE = { cardId: "STORY-2", location: { kind: "main" as const }, path: ".featra/cards/STORY-2.md" };
const staleWork = {
  [PROJECT.dir]: workList(PLAN, [
    { ...STALE, owner: { kind: "worktree" as const, branch: "claude/story-2", path: "/wt/story-2" } },
  ]),
};
const staleList = () => screen.findByRole("list", { name: "Edited outside its owner" });

describe("AC6: a stale copy is flagged with Apply to owner and Discard", () => {
  it("flags the copy with where it was edited and who owns it", async () => {
    renderApp({ work: staleWork });
    const item = within(await staleList()).getByRole("listitem");
    expect(item.textContent).toContain("STORY-2 · Edited outside its owner");
    expect(item.textContent).toContain("Changed in main. The card is owned by worktree claude/story-2.");
    expect(
      within(item)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Apply to owner", "Discard"]);
  });

  it("flags the card's own row, and only that one", async () => {
    const { user } = renderApp({ work: staleWork });
    await staleList();
    await user.click(toggle("Cards and the feature list"));
    const table = screen.getByRole("table", { name: "Prove the core" });
    const flagged = within(table)
      .getAllByText("Edited elsewhere")
      .map((m) => m.closest("[role=row]")?.getAttribute("data-card"));
    expect(flagged).toEqual(["STORY-2"]);
  });

  it.each([
    ["Apply to owner", "applyCopy"],
    ["Discard", "discardCopy"],
  ])("%s asks the server for that copy", async (button, method) => {
    const { user, actions } = renderApp({ work: staleWork });
    await user.click(within(await staleList()).getByRole("button", { name: button }));
    expect(actions()).toEqual([`${method}:${PROJECT.dir}:main|.featra/cards/STORY-2.md`]);
  });

  it("shows the server's refusal on the copy", async () => {
    const { user } = renderApp({
      work: staleWork,
      copyResult: { ok: false, error: "The owner changed the same field. Resolve it by hand." },
    });
    await user.click(within(await staleList()).getByRole("button", { name: "Apply to owner" }));
    expect((await within(await staleList()).findByRole("alert")).textContent).toBe(
      "The owner changed the same field. Resolve it by hand.",
    );
  });

  it("goes when the server's next list has no stale copy", async () => {
    const { pushWork } = renderApp({ work: staleWork });
    await staleList();
    pushWork(PROJECT.dir, workList(PLAN));
    expect(screen.queryByRole("list", { name: "Edited outside its owner" })).toBeNull();
  });
});
