import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { launch, queueFolderPicks, tempUserData } from "./app.ts";

/**
 * STORY-42 (which replaced STORY-2's offer): set a project up on one screen, in the real app with its real local
 * server and real git. Only the platform is faked: the userData and project folders are temporary, and the OS folder
 * dialog answers with folders the test queued.
 */
const setupPage = (page: Page) => page.getByRole("region", { name: "Set up project" });
const resultStep = (page: Page) => page.getByRole("region", { name: "Project is set up" });
/** Work's list for the current project (a placeholder until its story lands). */
const list = (page: Page) => page.locator("main .placeholder[data-view=work][data-project]");
const box = (page: Page, name: string) => setupPage(page).getByRole("checkbox", { name, exact: true });
// `has` is resolved inside each row, so it takes the checkbox alone, not a locator rooted at the page's region.
const row = (page: Page, name: string) =>
  setupPage(page)
    .locator(".setting-row")
    .filter({ has: page.getByRole("checkbox", { name, exact: true }) });
/** The paths a result list shows, by its label ("Created", "Kept"). */
const listed = (page: Page, label: string) =>
  resultStep(page)
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

function git(dir: string, ...args: string[]): string {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
  return execFileSync("git", args, { cwd: dir, env, encoding: "utf8" }).trim();
}

test.describe("STORY-42: set up a project on one screen", () => {
  test("a plain folder: untick one file, set up, see the result and the files, Done shows the list (AC1-AC5)", async () => {
    const profile = await tempUserData();
    const project = await tempFolder("featra-plain-");
    await writeFile(join(project.dir, "CLAUDE.md"), "# My own agent rules\n");
    try {
      const { app, page } = await launch(profile.dir);
      await expect(setupPage(page)).toHaveCount(0);

      // AC1: a folder that isn't set up shows the page in Work, not the list.
      await queueFolderPicks(app, project.dir);
      await page.keyboard.press("Control+O");
      await expect(setupPage(page).getByRole("heading", { name: "Set up project", level: 2 })).toBeVisible();
      await expect(list(page)).toHaveCount(0);

      // AC2: git and the Featra folder are required; every file is offered; a starter .gitignore too.
      for (const name of ["Git", "Featra folder"]) {
        await expect(box(page, name)).toBeChecked();
        await expect(box(page, name)).toBeDisabled();
        await expect(row(page, name)).toContainText("Required");
      }
      await expect(row(page, "Git")).not.toContainText("Already a git repository");
      for (const name of ["CONTEXT.md", "decisions.md", "open-questions.md", "docs/adr/", ".gitignore"]) {
        await expect(box(page, name)).toBeChecked();
        await expect(box(page, name)).toBeEnabled();
      }
      await box(page, "open-questions.md").uncheck();
      await setupPage(page).getByRole("radio", { name: "Tasks" }).check();

      // AC3, AC4: one Set up; the result lists what the real server created.
      await setupPage(page).getByRole("button", { name: "Set up", exact: true }).click();
      await expect(resultStep(page).getByRole("heading", { name: "Project is set up" })).toBeVisible();
      await expect(listed(page, "Created")).toHaveText([
        ".git/",
        ".featra/config.yaml",
        "CONTEXT.md",
        "decisions.md",
        "docs/adr/",
        "docs/adr/README.md",
        ".gitignore",
      ]);
      await expect(listed(page, "Kept")).toHaveCount(0);

      // The files are on disk, git first; the unticked one isn't; the workflow choice is in the config.
      expect(git(project.dir, "rev-parse", "--is-inside-work-tree")).toBe("true");
      const config = await readFile(join(project.dir, ".featra", "config.yaml"), "utf8");
      expect(config).toContain("version: 1");
      expect(config).toMatch(/progress: tasks/);
      for (const file of ["CONTEXT.md", "decisions.md", ".gitignore", "docs/adr/README.md"]) {
        expect(await exists(join(project.dir, file)), file).toBe(true);
      }
      expect(await exists(join(project.dir, "open-questions.md"))).toBe(false);
      expect(await readFile(join(project.dir, ".gitignore"), "utf8")).toContain("node_modules/");

      // AC5: the user's CLAUDE.md is as it was, and no AGENTS.md appeared.
      expect(await readFile(join(project.dir, "CLAUDE.md"), "utf8")).toBe("# My own agent rules\n");
      expect((await readdir(project.dir)).filter((f) => /^agents\.md$/i.test(f))).toEqual([]);

      // AC4: Done shows the list, and the page doesn't come back after a restart.
      await resultStep(page).getByRole("button", { name: "Done" }).click();
      await expect(list(page)).toHaveAttribute("data-project", project.dir);
      await app.close();
      const again = await launch(profile.dir);
      await expect(list(again.page)).toHaveAttribute("data-project", project.dir);
      // Nothing is waiting to appear: give the status check time to answer before the final look.
      await again.page.waitForTimeout(1000);
      await expect(setupPage(again.page)).toHaveCount(0);

      // AC1: "Set up project" in Project settings reopens it; everything is kept now.
      await again.page.keyboard.press("Control+Shift+,");
      await again.page.getByRole("button", { name: "Set up project" }).click();
      await expect(row(again.page, "Git")).toContainText("Already a git repository");
      await expect(row(again.page, "CONTEXT.md")).toContainText("Kept");
      await expect(box(again.page, "open-questions.md")).toBeEnabled();
      await again.app.close();
    } finally {
      await profile.dispose();
      await project.dispose();
    }
  });

  test("an existing repository: a file it has is kept as it was, and no .gitignore is offered", async () => {
    const profile = await tempUserData();
    const project = await tempFolder("featra-repo-");
    git(project.dir, "init");
    await writeFile(join(project.dir, "CONTEXT.md"), "# My own context\n");
    await writeFile(join(project.dir, ".gitignore"), "secret/\n");
    try {
      const { app, page } = await launch(profile.dir);
      await queueFolderPicks(app, project.dir);
      await page.keyboard.press("Control+O");
      await expect(row(page, "Git")).toContainText("Already a git repository");
      await expect(row(page, "CONTEXT.md")).toContainText("Kept");
      await expect(box(page, "CONTEXT.md")).toBeDisabled();
      await expect(box(page, ".gitignore")).toHaveCount(0);

      await setupPage(page).getByRole("button", { name: "Set up", exact: true }).click();
      await expect(listed(page, "Created")).toHaveText([
        ".featra/config.yaml",
        "decisions.md",
        "open-questions.md",
        "docs/adr/",
        "docs/adr/README.md",
      ]);
      await expect(listed(page, "Kept")).toHaveText(["CONTEXT.md"]);
      expect(await readFile(join(project.dir, "CONTEXT.md"), "utf8")).toBe("# My own context\n");
      expect(await readFile(join(project.dir, ".gitignore"), "utf8")).toBe("secret/\n");
      await app.close();
    } finally {
      await profile.dispose();
      await project.dispose();
    }
  });

  test("a new project shows the page; Skip goes to the empty list and changes nothing", async () => {
    const profile = await tempUserData();
    const home = await tempFolder("featra-home-");
    try {
      const { app, page } = await launch(profile.dir);
      await page.keyboard.press("Control+Shift+N");
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("textbox", { name: "Location" }).fill(home.dir);
      await dialog.getByRole("textbox", { name: "Name" }).fill("fresh");
      await page.keyboard.press("Enter");
      await expect(box(page, "Git")).toBeVisible();
      await setupPage(page).getByRole("button", { name: "Skip" }).click();
      await expect(setupPage(page)).toHaveCount(0);
      await expect(list(page)).toHaveAttribute("data-project", join(home.dir, "fresh"));
      expect(await readdir(join(home.dir, "fresh"))).toEqual([]);
      await app.close();
    } finally {
      await profile.dispose();
      await home.dispose();
    }
  });
});
