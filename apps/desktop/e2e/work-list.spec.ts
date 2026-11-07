import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { newCard, serializeCard, type Card, type CardType } from "@featra/work-format";
import { launch, tempUserData } from "./app.ts";

/**
 * STORY-3: the Work list, in the real app with its real local server and real git. Only the platform is faked: the
 * userData and repository folders are temporary. Cards are written with work-format's own serializer.
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

const card = (id: string, type: CardType, parent: string | null, status: string, title: string): Card =>
  newCard({ id, type, title, status, parent }, "user", "2026-11-01T00:00:00Z");
const cardFile = (tree: string, id: string) => join(tree, ".featra", "cards", `${id}-card.md`);
const write = (tree: string, c: Card) => writeFile(cardFile(tree, c.id), serializeCard(c), "utf8");

/** main holds the plan; STORY-2 is being worked on in its own worktree, which owns it (ADR 0002). */
async function planRepo() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "featra-work-e2e-")));
  const main = join(root, "main");
  await mkdir(join(main, ".featra", "cards"), { recursive: true });
  git(main, "init", "-q", "-b", "main");
  git(main, "config", "core.autocrlf", "false");
  await writeFile(join(main, ".featra", "config.yaml"), "version: 1\n");
  await write(main, card("EPIC-1", "epic", null, "active", "Prove the core"));
  await write(main, card("FEAT-1", "feature", "EPIC-1", "active", "Cards and the feature list"));
  await write(main, card("STORY-1", "story", "FEAT-1", "In Progress", "Open a folder"));
  await write(main, card("STORY-2", "story", "FEAT-1", "Ready", "Home feature list"));
  git(main, "add", "-A");
  git(main, "commit", "-q", "-m", "plan");
  const story = join(root, "story-2");
  git(main, "worktree", "add", "-q", "-b", "claude/story-2-list", story, "main");
  return {
    root,
    main,
    story,
    dispose: () => rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }),
  };
}

const list = (page: Page) => page.getByRole("region", { name: "Work list" });
const stale = (page: Page) => page.getByRole("list", { name: "Edited outside its owner" });

test.describe("STORY-3: the Work list from owner copies", () => {
  test("see epics, features and stories; an owner edit shows within 1 s; a stale copy is applied (AC1, AC4-AC6)", async () => {
    const profile = await tempUserData();
    const repo = await planRepo();
    try {
      const { app, page } = await launch(profile.dir, { FEATRA_PROJECT_DIR: repo.main });

      // AC1: the epic is a header over its feature; the feature opens to its stories.
      const epic = list(page).getByRole("region", { name: "Prove the core" });
      await expect(epic.getByRole("button", { name: "Prove the core" })).toHaveAttribute("aria-expanded", "true");
      await expect(epic).toContainText("0 of 1 feature done");
      const feature = epic.getByRole("button", { name: "Cards and the feature list" });
      await feature.click();
      const table = epic.getByRole("table", { name: "Prove the core" });
      await expect(table.locator("[data-card=STORY-1]")).toContainText("Open a folder");
      await expect(table.locator("[data-card=STORY-1]")).toContainText("In Progress");
      await expect(table.locator("[data-card=STORY-2]")).toContainText("Home feature list");
      await expect(stale(page)).toHaveCount(0);

      // AC5: an edit to the owner's file outside the app shows within 1 s.
      const started = Date.now();
      await write(repo.main, card("STORY-1", "story", "FEAT-1", "In Progress", "Renamed outside"));
      await expect(table.locator("[data-card=STORY-1]")).toContainText("Renamed outside", { timeout: 1000 });
      expect(Date.now() - started).toBeLessThan(1000);

      // AC4: an edit in the story's own worktree is the owner's, so it shows too, and isn't flagged.
      await write(repo.story, card("STORY-2", "story", "FEAT-1", "In Progress", "Home feature list"));
      await expect(table.locator("[data-card=STORY-2]")).toContainText("In Progress");
      await expect(stale(page)).toHaveCount(0);

      // AC6: an edit to main's copy of STORY-2, which the worktree owns, is flagged.
      await write(repo.main, card("STORY-2", "story", "FEAT-1", "Ready", "Edited in main"));
      const flagged = stale(page).getByRole("listitem");
      await expect(flagged).toContainText("STORY-2 · Edited outside its owner");
      await expect(flagged).toContainText("Changed in main. The card is owned by worktree claude/story-2-list.");
      await expect(table.locator("[data-card=STORY-2]")).toContainText("Home feature list");
      await expect(table.getByText("Edited elsewhere")).toHaveCount(1);
      await expect(table.locator("[data-card=STORY-2]")).toContainText("Edited elsewhere");

      // Apply to owner: the owner takes the field main changed and keeps its own status, main's copy goes back to git's, and the flag goes.
      await flagged.getByRole("button", { name: "Apply to owner" }).click();
      await expect(stale(page)).toHaveCount(0);
      await expect(table.locator("[data-card=STORY-2]")).toContainText("Edited in main");
      await expect(table.getByText("Edited elsewhere")).toHaveCount(0);
      const owner = await readFile(cardFile(repo.story, "STORY-2"), "utf8");
      expect(owner).toContain("title: Edited in main");
      expect(owner).toContain("status: In Progress");
      expect(git(repo.main, "status", "--porcelain", "--", ".featra/cards/STORY-2-card.md")).toBe("");
      await app.close();
    } finally {
      await repo.dispose();
      await profile.dispose();
    }
  });
});
