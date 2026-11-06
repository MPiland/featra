import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { launch, queueFolderPicks, tempUserData } from "./app.ts";

/**
 * STORY-2: open a folder and initialise Featra, in the real app with its real local server and real git. Only the
 * platform is faked: the userData and project folders are temporary, and the OS folder dialog answers with folders
 * the test queued.
 */
const offer = (page: Page) => page.getByRole("region", { name: "Project setup" });
/** STORY-42: the confirmation after Featra init. */
const confirmation = (page: Page) => page.getByRole("region", { name: "Featra is set up" });
/** The paths a confirmation list shows, by its label ("Created", "Kept"). */
const listed = (page: Page, label: string) =>
  confirmation(page)
    .locator("dl > div")
    .filter({ has: page.locator("dt", { hasText: label }) })
    .locator("dd code");

async function tempFolder(prefix: string) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  return { dir, dispose: () => rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }) };
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

function isRepo(dir: string): boolean {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
  return (
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: dir, env, encoding: "utf8" }).trim() === "true"
  );
}

test.describe("STORY-2: open a folder and initialise Featra", () => {
  test("open a plain folder, init git, then Featra; the files exist and CLAUDE.md is untouched (AC1-AC3)", async () => {
    const profile = await tempUserData();
    const project = await tempFolder("featra-plain-");
    const other = await tempFolder("featra-other-");
    await writeFile(join(project.dir, "CLAUDE.md"), "# My own agent rules\n");
    // STORY-42: a knowledge file the user already has, so the confirmation has something it kept.
    await writeFile(join(project.dir, "CONTEXT.md"), "# My own context\n");
    try {
      const { app, page } = await launch(profile.dir);
      await expect(offer(page)).toHaveCount(0);

      // AC1: a folder that isn't a git repository offers git init.
      await queueFolderPicks(app, project.dir);
      await page.keyboard.press("Control+O");
      await expect(offer(page)).toContainText("This folder isn't a git repository.");
      await offer(page).getByRole("button", { name: "Initialize Git" }).click();

      // AC1 (and STORY-42 AC2): a repository without .featra/ offers Featra init, with no reload.
      await expect(offer(page)).toContainText("Featra isn't set up in this project.");
      expect(isRepo(project.dir)).toBe(true);
      expect(await exists(join(project.dir, ".featra"))).toBe(false);
      await offer(page).getByRole("button", { name: "Initialize Featra" }).click();
      await expect(offer(page)).toHaveCount(0);

      // STORY-42 AC1: Work confirms what init created and what it kept, as the real server reported it.
      await expect(confirmation(page).getByRole("heading", { name: "Featra is set up" })).toBeVisible();
      await expect(listed(page, "Created")).toHaveText([
        ".featra/config.yaml",
        "docs/adr/",
        "docs/adr/README.md",
        "decisions.md",
        "open-questions.md",
      ]);
      await expect(listed(page, "Kept")).toHaveText(["CONTEXT.md"]);
      expect(await readFile(join(project.dir, "CONTEXT.md"), "utf8")).toBe("# My own context\n");

      // AC2: the scaffold is on disk.
      expect(await readFile(join(project.dir, ".featra", "config.yaml"), "utf8")).toContain("version: 1");
      for (const file of ["CONTEXT.md", "decisions.md", "open-questions.md"]) {
        expect(await exists(join(project.dir, file)), file).toBe(true);
      }
      expect((await stat(join(project.dir, "docs", "adr"))).isDirectory()).toBe(true);

      // AC3: the user's CLAUDE.md is as it was, and no AGENTS.md appeared.
      expect(await readFile(join(project.dir, "CLAUDE.md"), "utf8")).toBe("# My own agent rules\n");
      expect((await readdir(project.dir)).filter((f) => /^agents\.md$/i.test(f))).toEqual([]);

      // STORY-42 AC3: Dismiss hides the confirmation, and nothing comes back for the project after a restart.
      await confirmation(page).getByRole("button", { name: "Dismiss" }).click();
      await expect(confirmation(page)).toHaveCount(0);
      await app.close();
      const again = await launch(profile.dir);
      // A plain folder first, to see the real status check answer, then back to the project that is set up.
      await queueFolderPicks(again.app, other.dir, project.dir);
      await again.page.keyboard.press("Control+O");
      await expect(offer(again.page)).toContainText("This folder isn't a git repository.");
      await again.page.keyboard.press("Control+O");
      await expect(offer(again.page)).toHaveCount(0);
      // Nothing is waiting to appear: give the status check time to answer before the final look.
      await again.page.waitForTimeout(1000);
      await expect(offer(again.page)).toHaveCount(0);
      await expect(confirmation(again.page)).toHaveCount(0);
      await again.app.close();
    } finally {
      await profile.dispose();
      await project.dispose();
      await other.dispose();
    }
  });

  test("a new project is offered git init; Not now hides the offer", async () => {
    const profile = await tempUserData();
    const home = await tempFolder("featra-home-");
    try {
      const { app, page } = await launch(profile.dir);
      await page.keyboard.press("Control+Shift+N");
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("textbox", { name: "Location" }).fill(home.dir);
      await dialog.getByRole("textbox", { name: "Name" }).fill("fresh");
      await page.keyboard.press("Enter");
      await expect(offer(page)).toContainText("This folder isn't a git repository.");
      await offer(page).getByRole("button", { name: "Not now" }).click();
      await expect(offer(page)).toHaveCount(0);
      expect(await readdir(join(home.dir, "fresh"))).toEqual([]);
      await app.close();
    } finally {
      await profile.dispose();
      await home.dispose();
    }
  });
});
