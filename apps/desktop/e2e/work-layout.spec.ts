import { expect, test, type Page } from "@playwright/test";
import { githubApp, provenStory } from "./proven-story.ts";
import { REVIEW_SIZE, uxShot } from "./ux-shot.ts";

/**
 * STORY-62: the Work list and a story's card read cleanly at 1280×800, the size the user reviews at. The world of
 * proven-story.ts (the real app, its real local server and real git; the platform, the agent and GitHub faked), with
 * the busiest story row there is: in review with its PR, proven, its automatic merge refused, so its row carries its
 * session, Merge, Hold and its PR, and its card its notice and every action. Geometry is read from the real layout in
 * Electron: a value on one line is one line tall, nothing is wider than its box, and every row ends inside the list.
 */
const REFUSED = "X Pull request acme/app#1 is not mergeable: the base branch policy prohibits the merge.";

/** Everything on the Work list that wraps, clips or runs past it, as readable lines; none is the goal. */
function listProblems(page: Page) {
  return page.evaluate(() => {
    const problems: string[] = [];
    const list = document.querySelector<HTMLElement>(".work-list") as HTMLElement;
    const edge = list.getBoundingClientRect().right;
    // It runs in the page: page.evaluate sends this function alone, so nothing outside it is there.
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    const name = (el: Element) =>
      `${el.closest("[data-card]")?.getAttribute("data-card") ?? "header"} ${el.className || el.getAttribute("role")}`;
    // It runs in the page: page.evaluate sends this function alone, so nothing outside it is there.
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    const lineOf = (el: Element) => parseFloat(getComputedStyle(el).lineHeight) || 20;
    const oneLine = (el: Element) => {
      const h = el.getBoundingClientRect().height;
      if (h > lineOf(el) * 1.5) problems.push(`${name(el)} wraps: ${Math.round(h)}px tall`);
    };
    const fits = (el: Element) => {
      if (el.scrollWidth > el.clientWidth + 1)
        problems.push(`${name(el)} clips: ${el.scrollWidth} > ${el.clientWidth}`);
    };
    if (list.scrollWidth > list.clientWidth) problems.push(`the list scrolls sideways: ${list.scrollWidth}`);
    for (const row of list.querySelectorAll(".frow, .prow:not(.prow-below)")) {
      if (row.getBoundingClientRect().right > edge + 0.5) problems.push(`${name(row)} runs past the list`);
      for (const cell of row.querySelectorAll(':scope > [role="cell"], :scope > [role="columnheader"]')) {
        fits(cell);
        if (cell.getBoundingClientRect().right > row.getBoundingClientRect().right + 0.5)
          problems.push(`${name(cell)} runs past its row`);
      }
    }
    for (const el of list.querySelectorAll(
      '[role="columnheader"], .row-toggle > span, .row-open, .st, .prog .pl, .pn-title, .story-meta, .fchip',
    ))
      oneLine(el);
    for (const el of list.querySelectorAll(".row-open, .st-label, .story-meta, .wfilter")) fits(el);
    return problems;
  });
}

test("At 1280×800 the Work list and a story's card fit their rows, with fewer columns while the pane is open", async () => {
  const world = await githubApp({ mergeFails: REFUSED });
  try {
    const { page } = world;
    expect(await page.evaluate(() => [window.innerWidth, window.innerHeight])).toEqual([
      REVIEW_SIZE.width,
      REVIEW_SIZE.height,
    ]);
    const { row, card, id } = await provenStory(world);
    await expect(card.getByRole("status").filter({ hasText: /Didn't merge on its own/ })).toBeVisible({
      timeout: 30_000,
    });
    await expect(row.getByRole("button", { name: `Merge ${id}` })).toBeVisible();
    const work = page.getByRole("region", { name: "Work list" });
    // The columns of the story's table, by header.
    const headers = () => work.getByRole("table").filter({ has: row }).getByRole("columnheader").allTextContents();

    // AC2: with the pane open, Tasks and Scope (PR) are hidden, and at this size Progress (Criteria) too.
    const open = await headers();
    expect(open).not.toContain("Tasks");
    expect(open).not.toContain("Scope");
    expect(open).not.toContain("PR");
    expect(open).toEqual(expect.arrayContaining(["Feature", "Status", "Story", "Stage"]));
    // The PR moves to the story's line of marks, beside its session and actions.
    const meta = row.locator(".story-meta");
    await expect(meta.getByRole("link", { name: "#1", exact: true })).toBeVisible();
    await expect(meta.getByRole("button", { name: `Hold ${id}` })).toBeVisible();

    // AC1, AC3, AC4: no cell wraps or clips, and every row ends inside the list.
    expect(await listProblems(page)).toEqual([]);
    const geometry = await page.evaluate((storyId) => {
      // It runs in the page: page.evaluate sends this function alone, so nothing outside it is there.
      // oxlint-disable-next-line unicorn/consistent-function-scoping
      const box = (el: Element | null) => el?.getBoundingClientRect() ?? new DOMRect();
      const story = document.querySelector(`[role="row"][data-card="${storyId}"]`);
      const feature = story?.closest(".fl")?.querySelector(".frow:not(.hdr)");
      const title = story?.querySelector(".pn-title");
      const metaLine = story?.querySelector(".story-meta");
      const filters = document.querySelector(".wfilter");
      const newBug = document.querySelector(".work-toolbar .new-bug-bar .btn");
      // It runs in the page: page.evaluate sends this function alone, so nothing outside it is there.
      // oxlint-disable-next-line unicorn/consistent-function-scoping
      const centre = (r: DOMRect) => r.top + r.height / 2;
      return {
        // Feature and story rows share one grid: the same template, so Status starts at the same x.
        templates: [feature, story].map((r) => (r ? getComputedStyle(r).gridTemplateColumns : "")),
        statusX: [feature, story].map((r) => Math.round(box(r?.querySelector(":scope > :nth-child(3)") ?? null).left)),
        metaLeft: Math.round(box(metaLine ?? null).left) - Math.round(box(title ?? null).left),
        metaHeight: Math.round(box(metaLine ?? null).height),
        metaRightInCell: box(metaLine ?? null).right <= box(story?.querySelector(".pn") ?? null).right + 0.5,
        toolbarCentres: Math.abs(centre(box(filters)) - centre(box(newBug))),
        newBugRightInList: box(newBug).right <= box(document.querySelector(".work-list")).right,
        chipHeights: [...document.querySelectorAll(".fchip")].map((c) => Math.round(box(c).height)),
        newBugHeight: Math.round(box(newBug).height),
      };
    }, id);
    expect(geometry.templates[0]).toBe(geometry.templates[1]);
    expect(geometry.statusX[0]).toBe(geometry.statusX[1]);
    expect(geometry.metaLeft).toBe(0);
    expect(geometry.metaHeight).toBeLessThanOrEqual(22);
    expect(geometry.metaRightInCell).toBe(true);
    expect(geometry.toolbarCentres).toBeLessThanOrEqual(1);
    expect(geometry.newBugRightInList).toBe(true);
    expect(new Set([...geometry.chipHeights, geometry.newBugHeight])).toEqual(new Set([24]));

    // AC5: the card's properties, evidence and actions each fit their row, at one size per kind of control.
    const pane = await card.evaluate((root) => {
      // It runs in the page: page.evaluate sends this function alone, so nothing outside it is there.
      // oxlint-disable-next-line unicorn/consistent-function-scoping
      const box = (el: Element) => el.getBoundingClientRect();
      const body = root.querySelector(".card-body") as HTMLElement;
      const props = [...root.querySelectorAll(".card-props .dropdown-button")];
      const evidence = root.querySelector(".ev") as HTMLElement;
      const marks = [...evidence.querySelectorAll("li")];
      const rows = [...root.querySelectorAll(".card-actions")].filter((r) => r.querySelector("button"));
      return {
        sideways: body.scrollWidth - body.clientWidth,
        propHeights: props.map((b) => Math.round(box(b).height)),
        propsFit: props.every((b) => b.scrollWidth <= b.clientWidth + 1 && box(b).right <= box(body).right),
        evidenceTops: new Set(marks.map((m) => Math.round(box(m).top))).size,
        evidenceRight: box(evidence).right <= box(body).right,
        actionRows: rows.map((r) => {
          const buttons = [...r.querySelectorAll(":scope > * button, :scope > button")].filter(
            (b) => box(b).height > 0 && !b.closest(".draft-ask, .send-back, .card-error"),
          );
          return {
            heights: [...new Set(buttons.map((b) => Math.round(box(b).height)))],
            tops: new Set(buttons.map((b) => Math.round(box(b).top))).size,
            fits: r.scrollWidth <= r.clientWidth + 1,
          };
        }),
      };
    });
    expect(pane.sideways).toBeLessThanOrEqual(0);
    expect(pane.propHeights.length).toBeGreaterThan(0);
    expect(new Set(pane.propHeights)).toEqual(new Set([28]));
    expect(pane.propsFit).toBe(true);
    expect(pane.evidenceTops).toBe(1);
    expect(pane.evidenceRight).toBe(true);
    expect(pane.actionRows.length).toBeGreaterThan(0);
    for (const r of pane.actionRows) expect(r).toEqual({ heights: [28], tops: 1, fits: true });
    await uxShot(page, "story-62-work-pane-open");

    // AC2: closed, the pane gives the list its columns back, and they still fit.
    await card.getByRole("button", { name: "Close card" }).click();
    await expect(page.getByRole("complementary")).toHaveCount(0);
    await expect.poll(headers).toContain("Scope");
    expect(await headers()).toEqual([
      "Feature",
      "Status",
      "Progress",
      "Tasks",
      "Scope",
      "Story",
      "Stage",
      "Criteria",
      "Tasks",
      "PR",
    ]);
    await expect(row.locator(".story-meta").getByRole("link", { name: "#1", exact: true })).toHaveCount(0);
    await expect(row.getByRole("link", { name: "#1", exact: true })).toBeVisible();
    expect(await listProblems(page)).toEqual([]);
    await uxShot(page, "story-62-work-pane-closed");
  } finally {
    await world.dispose();
  }
});
