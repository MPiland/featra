import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { newCard, parseCard, serializeCard, type Card, type CardType } from "@featra/work-format";
import { launch, tempUserData } from "./app.ts";

/**
 * STORY-4: the card pane, in the real app with its real local server and real git. Only the platform is faked: the
 * userData and repository folders are temporary. Cards are written and read with work-format's own serializer.
 */
const env = (() => {
  const e: Record<string, string | undefined> = { ...process.env };
  for (const key of Object.keys(e)) if (key.startsWith("GIT_")) delete e[key];
  return {
    ...e,
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.invalid",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.invalid",
  };
})();
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const STORY_TEXT = "As a builder, I open a card.";
const card = (id: string, type: CardType, parent: string | null, status: string, title: string): Card =>
  newCard(
    { id, type, title, status, parent, description: type === "story" ? STORY_TEXT : "" },
    "user",
    "2026-11-01T00:00:00Z",
  );
const cardsDir = (tree: string) => join(tree, ".featra", "cards");
const cardFile = (tree: string, id: string) => join(cardsDir(tree), `${id}-card.md`);
const write = (tree: string, c: Card) => writeFile(cardFile(tree, c.id), serializeCard(c), "utf8");
const read = async (tree: string, id: string) => parseCard(await readFile(cardFile(tree, id), "utf8"));

const LONG_PATH =
  "packages/client/test/components/card-pane-sizing/a-test-file-whose-name-goes-on-for-a-long-way.test.tsx AC5, " +
  "apps/desktop/e2e/card-pane-at-every-window-size-down-to-the-app-minimum.spec.ts";
const LONG_ACS = [
  { text: "The pane resizes", done: true, test: LONG_PATH },
  { text: "Nothing scrolls sideways", done: false, test: LONG_PATH },
];

/** main holds the plan; STORY-2 is being worked on in its own worktree, which owns it (ADR 0002). */
async function planRepo() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "featra-card-e2e-")));
  const main = join(root, "main");
  await mkdir(cardsDir(main), { recursive: true });
  git(main, "init", "-q", "-b", "main");
  git(main, "config", "core.autocrlf", "false");
  await writeFile(join(main, ".featra", "config.yaml"), "version: 1\n");
  await write(main, card("EPIC-1", "epic", null, "active", "Prove the core"));
  await write(main, card("FEAT-1", "feature", "EPIC-1", "active", "Cards and the feature list"));
  await write(main, card("STORY-1", "story", "FEAT-1", "In Progress", "Open a folder"));
  await write(main, card("STORY-2", "story", "FEAT-1", "Ready", "Card pane"));
  git(main, "add", "-A");
  git(main, "commit", "-q", "-m", "plan");
  const story = join(root, "story-2");
  git(main, "worktree", "add", "-q", "-b", "claude/story-2-pane", story, "main");
  // The worktree has moved the story on, so it is the owner. Its proof paths are long enough to push a pane wide.
  await write(story, { ...card("STORY-2", "story", "FEAT-1", "In Progress", "Card pane"), acs: LONG_ACS });
  return {
    root,
    main,
    story,
    dispose: () => rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }),
  };
}

test.describe("STORY-4: the card pane", () => {
  test("open a story, edit its user story and status at the owner copy, and close it (AC1-AC4)", async () => {
    const profile = await tempUserData();
    const repo = await planRepo();
    try {
      const { app, page } = await launch(profile.dir, { FEATRA_PROJECT_DIR: repo.main });
      const list = page.getByRole("region", { name: "Work list" });
      await list.getByRole("button", { name: "Cards and the feature list" }).click();
      const row = list.getByRole("button", { name: "Card pane" });
      await expect(list.locator("[data-card=STORY-2]")).toContainText("In Progress");
      const mainBefore = await readFile(cardFile(repo.main, "STORY-2"), "utf8");

      // AC1: the pane docks beside the list, full height, and the list stays in view.
      await row.click();
      const pane = page.getByRole("complementary", { name: "STORY-2 card" });
      await expect(pane).toBeVisible();
      await expect(list).toBeVisible();
      const [paneBox, listBox, main] = await Promise.all([
        pane.boundingBox(),
        list.boundingBox(),
        page.locator("main").boundingBox(),
      ]);
      expect(paneBox!.x).toBeGreaterThanOrEqual(listBox!.x + listBox!.width - 1);
      expect(Math.abs(paneBox!.height - main!.height)).toBeLessThanOrEqual(2);

      // AC2: the card's parts, read from the worktree that owns it.
      await expect(pane.getByText("Saved to worktree claude/story-2-pane")).toBeVisible();
      await expect(pane.getByRole("region", { name: "Acceptance criteria" })).toBeVisible();
      await expect(pane.getByRole("list", { name: "Evidence" })).toBeVisible();

      // AC3: the user story edits in place, and leaving the field saves it to the owner's file only.
      await pane.getByRole("button", { name: `User story: ${STORY_TEXT}` }).click();
      const field = pane.getByRole("textbox", { name: "User story" });
      await field.fill("As a builder, I edit a card in place.");
      await pane.getByText("Saved to worktree claude/story-2-pane").click();
      await expect(
        pane.getByRole("button", { name: "User story: As a builder, I edit a card in place." }),
      ).toBeVisible();
      await expect
        .poll(async () => (await read(repo.story, "STORY-2")).description)
        .toBe("As a builder, I edit a card in place.");
      expect(await readFile(cardFile(repo.main, "STORY-2"), "utf8")).toBe(mainBefore);
      expect((await readdir(cardsDir(repo.story))).filter((n) => !n.endsWith(".md"))).toEqual([]);

      // AC4: a status change appends a history event in the owner's file.
      await pane.getByRole("button", { name: "Status: In Progress" }).click();
      await expect(page.getByRole("listbox", { name: "Status" }).getByRole("option", { name: "Done" })).toHaveCount(0);
      await page.getByRole("option", { name: "In Review" }).click();
      await expect(pane.getByRole("button", { name: "Status: In Review" })).toBeVisible();
      await expect(list.locator("[data-card=STORY-2]")).toContainText("In Review");
      const owner = await read(repo.story, "STORY-2");
      expect(owner.history.at(-1)).toMatchObject({ field: "status", from: "In Progress", to: "In Review", by: "user" });
      expect(owner.description).toBe("As a builder, I edit a card in place.");
      expect(git(repo.main, "status", "--porcelain")).toBe("");

      // Close: the pane goes and focus is back on the story.
      await pane.getByRole("button", { name: "Close card" }).click();
      await expect(pane).toHaveCount(0);
      await expect(row).toBeFocused();
      await app.close();
    } finally {
      await repo.dispose();
      await profile.dispose();
    }
  });

  test("at 1280×800 and at the app's minimum size nothing scrolls sideways; the pane resizes and keeps its width (AC5, AC6)", async () => {
    const profile = await tempUserData();
    const repo = await planRepo();
    try {
      let { app, page } = await launch(profile.dir, { FEATRA_PROJECT_DIR: repo.main });
      await sizeTo(app, page, 1280, 800);
      let pane = await openStory(page);

      // AC6: long proof paths are cut short in place, and the close button is in view.
      await expect(pane.getByText(LONG_PATH).first()).toHaveAttribute("title", LONG_PATH);
      expect(await sideways(page)).toEqual(NONE);
      expect(await closeInView(page)).toBe(true);
      // The default is 40% of the work area: 1280 less the 272 px sidebar.
      expect(Math.round((await pane.boundingBox())!.width)).toBe(403);

      // AC5: dragging the handle left widens the pane by as much.
      const handle = page.getByRole("separator", { name: "Resize card pane" });
      await expect(handle).toHaveAttribute("aria-orientation", "vertical");
      const h = (await handle.boundingBox())!;
      await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
      await page.mouse.down();
      await page.mouse.move(h.x + h.width / 2 - 120, h.y + h.height / 2, { steps: 6 });
      await page.mouse.up();
      await expect.poll(async () => Math.round((await pane.boundingBox())!.width)).toBe(523);
      await expect(handle).toHaveAttribute("aria-valuenow", "523");
      expect(await sideways(page)).toEqual(NONE);

      // Remembered when the pane reopens, and after a restart.
      await pane.getByRole("button", { name: "Close card" }).click();
      pane = await openStory(page, false);
      expect(Math.round((await pane.boundingBox())!.width)).toBe(523);
      await app.close();
      ({ app, page } = await launch(profile.dir, { FEATRA_PROJECT_DIR: repo.main }));
      await sizeTo(app, page, 1280, 800);
      pane = await openStory(page);
      expect(Math.round((await pane.boundingBox())!.width)).toBe(523);

      // AC6 at the app's minimum window: the list and the pane share the width, nothing scrolls sideways.
      await sizeTo(app, page, 720, 480);
      await expect.poll(() => sideways(page)).toEqual(NONE);
      expect(await closeInView(page)).toBe(true);
      const list = page.getByRole("region", { name: "Work list" });
      expect((await list.boundingBox())!.width).toBeGreaterThanOrEqual(180);
      await pane.getByRole("button", { name: "Close card" }).click();
      await expect(pane).toHaveCount(0);
      await app.close();
    } finally {
      await repo.dispose();
      await profile.dispose();
    }
  });
});

/** Sizes the window's content area, as a user dragging its edges would, and waits for the page to follow. */
async function sizeTo(app: ElectronApplication, page: Page, width: number, height: number) {
  await app.evaluate(
    ({ BrowserWindow }, [w, h]) => {
      const win = BrowserWindow.getAllWindows()[0]!;
      if (win.isMaximized()) win.unmaximize();
      win.setContentSize(w, h);
    },
    [width, height] as const,
  );
  await expect.poll(() => page.evaluate(() => [window.innerWidth, window.innerHeight])).toEqual([width, height]);
}

/** Opens STORY-2 in the pane; `expand` opens its feature first. */
async function openStory(page: Page, expand = true) {
  const list = page.getByRole("region", { name: "Work list" });
  if (expand) await list.getByRole("button", { name: "Cards and the feature list" }).click();
  await list.getByRole("button", { name: "Card pane" }).click();
  const pane = page.getByRole("complementary", { name: "STORY-2 card" });
  await expect(pane.getByText("Saved to worktree claude/story-2-pane")).toBeVisible();
  return pane;
}

const NONE = { page: 0, main: 0, split: 0, body: 0 };

/** How far the page, the work area and the pane's body scroll sideways: 0 each when nothing does. */
const sideways = (page: Page) =>
  page.evaluate(() => {
    const [doc, main, split, body] = ["html", "main", ".work-split", ".card-body"].map((sel) => {
      const el = document.querySelector(sel);
      return el ? el.scrollWidth - el.clientWidth : -1;
    });
    return { page: doc, main, split, body };
  });

/** Whether the close button is inside the window and is what a click at its centre lands on. */
const closeInView = (page: Page) =>
  page.evaluate(() => {
    const button = document.querySelector('[aria-label="Close card"]');
    if (!button) return false;
    const b = button.getBoundingClientRect();
    const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return b.left >= 0 && b.right <= window.innerWidth && b.bottom <= window.innerHeight && button.contains(hit);
  });
