import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { newCard, serializeCard, type Card, type CardType } from "@featra/work-format";
import { launch, sizeTo, tempUserData } from "./app.ts";
import { git, project } from "./draft-project.ts";

/**
 * STORY-17: the read-only stage board, in the real app with its real local server and real git. Only the platform is
 * faked: the userData and repository folders are temporary. Cards are written with work-format's own serializer.
 */
const card = (id: string, type: CardType, parent: string | null, status: string, title: string): Card =>
  newCard({ id, type, title, status, parent }, "user", "2026-11-01T00:00:00Z");

const PLAN = [
  card("FEAT-2", "feature", null, "active", "Delegation"),
  card("STORY-2", "story", "FEAT-2", "In Progress", "Spawn five"),
  card("STORY-3", "story", "FEAT-2", "Ready", "Report back"),
  card("FEAT-3", "feature", null, "approved", "Burn-up"),
  card("STORY-4", "story", "FEAT-3", "New", "Draw the chart"),
  card("STORY-5", "story", "FEAT-3", "In Progress", "Pick the scale"),
];

/** A project in git whose plan has two features with stories in several stages. */
async function boardRepo() {
  const repo = await project();
  for (const c of PLAN)
    await writeFile(join(repo.dir, ".featra", "cards", `${c.id}-card.md`), serializeCard(c), "utf8");
  git(repo.dir, "add", "-A");
  git(repo.dir, "commit", "-q", "-m", "plan");
  return repo;
}

const counts = (board: ReturnType<Page["getByRole"]>) =>
  board
    .locator(".bcol")
    .evaluateAll((cols) =>
      cols.map((c) => [c.getAttribute("data-stage"), c.querySelector(".bcol-count")?.textContent]),
    );

/** How far the page, the work area and the board scroll sideways: 0 where nothing does. */
const sideways = (page: Page) =>
  page.evaluate(() => {
    const [doc, main, work, board] = ["html", "main", ".work-list", ".stage-board"].map((sel) => {
      const el = document.querySelector(sel);
      return el ? el.scrollWidth - el.clientWidth : -1;
    });
    return { page: doc, main, work, board };
  });

test("Switch Work to the board, filter it to one feature, open a card from it, and find the board after a restart", async () => {
  const profile = await tempUserData();
  const repo = await boardRepo();
  let app: ElectronApplication | undefined;
  try {
    let page: Page;
    ({ app, page } = await launch(profile.dir, { FEATRA_PROJECT_DIR: repo.dir }));
    await sizeTo(app, page, 1280, 800);
    const work = page.getByRole("region", { name: "Work list" });
    const layout = work.getByRole("radiogroup", { name: "Layout" });
    await expect(layout.getByRole("radio", { name: "List" })).toBeChecked();

    // AC1, AC2: the toggle switches to the board, one column per stage with its count.
    await layout.getByRole("radio", { name: "Board" }).check();
    const board = page.getByRole("region", { name: "Stage board" });
    await expect(board).toBeVisible();
    await expect(layout.getByRole("radio", { name: "Board" })).toBeChecked();
    await expect
      .poll(() => counts(board), { timeout: 15_000 })
      .toEqual([
        ["New", "1"],
        ["Ready", "1"],
        ["In Progress", "2"],
        ["In Review", "0"],
        ["Acceptance", "0"],
        ["Done", "0"],
      ]);
    // At 1280×800 the columns fit: nothing scrolls sideways.
    expect(await sideways(page)).toEqual({ page: 0, main: 0, work: 0, board: 0 });

    // AC3: one feature's stories.
    const filter = page.getByRole("group", { name: "Filter by feature" });
    await filter.getByRole("button", { name: "FEAT-3 Burn-up" }).click();
    await expect(board.locator("[data-card]")).toHaveCount(2);
    const inProgress = board.locator("[data-stage='In Progress'] [data-card]");
    await expect(inProgress).toHaveCount(1);
    await expect(inProgress).toContainText("STORY-5 Pick the scale");
    await expect(counts(board)).resolves.toContainEqual(["New", "1"]);

    // AC4: a card opens its card pane; Escape closes it and focus is back on the card.
    const open = board.getByRole("button", { name: "STORY-5 Pick the scale" });
    await open.click();
    const pane = page.getByRole("complementary", { name: "STORY-5 card" });
    await expect(pane).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(pane).toHaveCount(0);
    await expect(open).toBeFocused();

    // AC5: nothing on the board can be dragged.
    await expect(board.locator("[draggable]")).toHaveCount(0);

    // At the app's minimum size only the board scrolls sideways, never the window or Work.
    await sizeTo(app, page, 720, 480);
    await expect.poll(() => sideways(page)).toMatchObject({ page: 0, main: 0, work: 0 });
    expect((await sideways(page)).board).toBeGreaterThan(0);

    // AC1: the choice is remembered for the project after a restart.
    await app.close();
    app = undefined;
    ({ app, page } = await launch(profile.dir, { FEATRA_PROJECT_DIR: repo.dir }));
    await expect(page.getByRole("region", { name: "Stage board" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("radiogroup", { name: "Layout" }).getByRole("radio", { name: "Board" })).toBeChecked();
  } finally {
    await app?.close();
    await repo.dispose();
    await profile.dispose();
  }
});
