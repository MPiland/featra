/**
 * STORY-66: what each project needs, in the project switcher, through the real App. The server's counts come over the
 * fake socket (they are proved against the real server in packages/server); everything the page does with them is real.
 */
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { NeedsList } from "@featra/work-format";
import { PROJECT, renderApp, sidebar } from "../harness.tsx";

afterEach(cleanup);

const OTHER = { dir: "/home/me/website", name: "website" };
const THIRD = { dir: "/home/me/docs", name: "docs" };
const projects = [PROJECT, OTHER, THIRD];
const needs = (...rows: [dir: string, waiting: number, review: boolean][]): NeedsList => ({
  projects: rows.map(([dir, waiting, review]) => ({ dir, waiting, review })),
});
const switcher = () => within(sidebar()).getByRole("button", { name: /^Switch project: / });
const dot = () => switcher().querySelector(".proj-dot");
const projectMenu = () => screen.getByRole("menu", { name: "Projects" });
const projectItems = () => within(projectMenu()).getAllByRole("menuitemradio");
const names = () => projectItems().map(accessibleName);
const marks = (el: HTMLElement) => [...el.querySelectorAll(".mmark")].map((m) => [m.className, m.textContent]);
/** The name a screen reader hears for an item: its label when it has one, else its text without what is hidden. */
const accessibleName = (el: HTMLElement) => {
  const label = el.getAttribute("aria-label");
  if (label !== null) return label;
  const copy = el.cloneNode(true) as HTMLElement;
  copy.querySelectorAll("[aria-hidden=true]").forEach((h) => h.remove());
  return copy.textContent;
};

describe("AC1: each project in the menu shows how many of its agents wait on the user", () => {
  it("shows each project's count, one for one agent and the number for more, and none when nothing waits", async () => {
    const app = renderApp({ projects, needs: needs([PROJECT.dir, 1, false], [OTHER.dir, 2, false]) });
    await waitFor(() => expect(dot()).not.toBeNull());
    await app.user.click(switcher());
    expect(within(projectMenu()).getByRole("menuitemradio", { name: "manager, 1 agent waiting" })).toBeTruthy();
    expect(within(projectMenu()).getByRole("menuitemradio", { name: "website, 2 agents waiting" })).toBeTruthy();
    expect(within(projectMenu()).getByRole("menuitemradio", { name: "docs" })).toBeTruthy();
    const counts = projectItems().map((i) => [...i.querySelectorAll(".mmark:not(.quiet)")].map((m) => m.textContent));
    expect(counts).toEqual([["1"], ["2"], []]);
    const tips = projectItems().map((i) =>
      [...i.querySelectorAll(".mmark:not(.quiet)")].map((m) => m.getAttribute("title")),
    );
    expect(tips).toEqual([["1 agent waiting"], ["2 agents waiting"], []]);
  });
});

describe("AC2: a project with work to review shows a quieter review mark beside its name, apart from the count", () => {
  it("shows the review mark alone, and after the count when the project has both", async () => {
    const app = renderApp({ projects, needs: needs([OTHER.dir, 0, true], [THIRD.dir, 3, true]) });
    await waitFor(() => expect(dot()).not.toBeNull());
    await app.user.click(switcher());
    const website = within(projectMenu()).getByRole("menuitemradio", { name: "website, to review" });
    const docs = within(projectMenu()).getByRole("menuitemradio", { name: "docs, 3 agents waiting, to review" });
    expect(marks(website)).toEqual([["mmark quiet", ""]]);
    expect(marks(docs)).toEqual([
      ["mmark", "3"],
      ["mmark quiet", ""],
    ]);
    expect(website.querySelector(".mmark.quiet")?.getAttribute("title")).toBe("To review");
  });
});

describe("AC3: the closed switcher shows a dot when another project needs the user, not for its own", () => {
  it("shows no dot for the current project's own waiting agents and reviews", async () => {
    const app = renderApp({ projects, needs: needs([PROJECT.dir, 2, true]) });
    await waitFor(() => expect(app.needs.watching()).toBe(1));
    await app.user.click(switcher());
    // The needs have landed: the menu shows them on the current project.
    expect(
      within(projectMenu()).getByRole("menuitemradio", { name: "manager, 2 agents waiting, to review" }),
    ).toBeTruthy();
    await app.user.keyboard("{Escape}");
    expect(dot()).toBeNull();
    expect(switcher().getAttribute("aria-label")).toBe("Switch project: manager");
  });

  it("shows the dot with no current project when any open project needs the user: every one is another", async () => {
    const app = renderApp({ project: null, projects: [OTHER, THIRD], needs: needs([OTHER.dir, 0, true]) });
    await waitFor(() => expect(dot()).not.toBeNull());
    expect(switcher().getAttribute("aria-label")).toBe("Switch project: No project, another project needs you");
    app.needs.push(needs([OTHER.dir, 1, false], [THIRD.dir, 2, false]));
    expect(switcher().getAttribute("aria-label")).toBe("Switch project: No project, 2 other projects need you");
    app.needs.push(needs());
    expect(dot()).toBeNull();
  });

  it("shows the dot for another project's waiting agent, and for another's review", async () => {
    const app = renderApp({ projects, needs: needs([OTHER.dir, 1, false]) });
    await waitFor(() => expect(dot()).not.toBeNull());
    app.needs.push(needs([THIRD.dir, 0, true]));
    expect(dot()).not.toBeNull();
    app.needs.push(needs([PROJECT.dir, 1, false]));
    expect(dot()).toBeNull();
  });
});

describe("AC4: counts, marks and the dot change live, without reopening the menu", () => {
  it("updates the open menu and the dot as requests arrive and are answered in any project", async () => {
    const app = renderApp({ projects });
    await waitFor(() => expect(app.needs.watching()).toBe(1));
    expect(dot()).toBeNull();
    await app.user.click(switcher());
    expect(names()).toEqual(["manager", "website", "docs"]);

    app.needs.push(needs([OTHER.dir, 1, false]));
    expect(names()).toEqual(["manager", "website, 1 agent waiting", "docs"]);
    expect(dot()).not.toBeNull();
    app.needs.push(needs([OTHER.dir, 2, false], [THIRD.dir, 0, true]));
    expect(names()).toEqual(["manager", "website, 2 agents waiting", "docs, to review"]);
    app.needs.push(needs([PROJECT.dir, 1, false]));
    expect(names()).toEqual(["manager, 1 agent waiting", "website", "docs"]);
    expect(dot()).toBeNull();
    expect(screen.getByRole("menu", { name: "Projects" })).toBe(projectMenu());
  });
});

describe("AC5: a screen reader hears each project's count and review mark, and the dot's meaning", () => {
  it("names each menu item with its project, count and mark, and the switcher with what the dot means", async () => {
    const app = renderApp({ projects, needs: needs([OTHER.dir, 1, true]) });
    await waitFor(() => expect(dot()).not.toBeNull());
    expect(switcher().getAttribute("aria-label")).toBe("Switch project: manager, another project needs you");
    expect(dot()?.closest("[aria-hidden=true]")).not.toBeNull();
    app.needs.push(needs([OTHER.dir, 1, false], [THIRD.dir, 0, true]));
    expect(switcher().getAttribute("aria-label")).toBe("Switch project: manager, 2 other projects need you");
    await app.user.click(switcher());
    expect(names()).toEqual(["manager", "website, 1 agent waiting", "docs, to review"]);
    for (const mark of projectMenu().querySelectorAll(".mmark")) expect(mark.getAttribute("aria-hidden")).toBe("true");
  });

  it("names each item in one piece, so no layout of its marks can split the name (CI: Chromium heard a space before the comma)", async () => {
    const app = renderApp({ projects, needs: needs([OTHER.dir, 1, true], [THIRD.dir, 2, false]) });
    await waitFor(() => expect(dot()).not.toBeNull());
    await app.user.click(switcher());
    expect(projectItems().map((i) => i.getAttribute("aria-label"))).toEqual([
      null,
      "website, 1 agent waiting, to review",
      "docs, 2 agents waiting",
    ]);
  });
});
