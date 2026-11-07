import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
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
  // The worktree has moved the story on, so it is the owner.
  await write(story, card("STORY-2", "story", "FEAT-1", "In Progress", "Card pane"));
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
});
